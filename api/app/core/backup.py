import os
import shutil
import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.core.config import settings
from app.models.base import Backup, Project, ActivityLog

logger = logging.getLogger("cpanel_lite.backup")

def perform_backup(
    db: Session,
    project_id: Optional[str] = None,
    backup_type: str = "database",
    storage_provider: str = "local"
) -> Backup:
    """
    Performs compression of database and/or files and saves it to local and/or simulated remote storage.
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    project_name = "system"
    project = None
    if project_id:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target project for backup not found"
            )
        project_name = project.name

    local_backup_dir = settings.CPANEL_DATA_DIR / "backups"
    local_backup_dir.mkdir(parents=True, exist_ok=True)
    
    temp_dir = local_backup_dir / f"tmp_{timestamp}_{project_name}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    archive_name = f"backup_{timestamp}_{backup_type}_{project_name}"
    archive_out_path = local_backup_dir / archive_name
    
    try:
        if backup_type in ("database", "full"):
            db_file_name = "minicpanel.db"
            db_file_path = settings.CPANEL_DATA_DIR / db_file_name
            if not db_file_path.exists():
                legacy_db = settings.CPANEL_DATA_DIR / "cpanel_lite.db"
                if legacy_db.exists():
                    db_file_path = legacy_db
                    db_file_name = "cpanel_lite.db"
            
            if db_file_path.exists():
                db_temp_copy = temp_dir / db_file_name
                src = sqlite3.connect(str(db_file_path))
                dest = sqlite3.connect(str(db_temp_copy))
                src.backup(dest)
                src.close()
                dest.close()
                logger.info(f"Database file {db_file_name} copied successfully to backup temp dir.")
                
        if backup_type in ("files", "full"):
            files_dest = temp_dir / "apps_files"
            if project:
                proj_dir = settings.CPANEL_APPS_DIR / project.name
                if proj_dir.exists() and proj_dir.is_dir():
                    shutil.copytree(proj_dir, files_dest / project.name, symlinks=True)
            else:
                if settings.CPANEL_APPS_DIR.exists():
                    shutil.copytree(settings.CPANEL_APPS_DIR, files_dest, symlinks=True)

        archive_path_str = shutil.make_archive(
            str(archive_out_path),
            "zip",
            root_dir=temp_dir
        )
        archive_path = Path(archive_path_str)
        file_size = archive_path.stat().st_size
        
        if storage_provider in ("s3", "gdrive"):
            remote_dir = settings.CPANEL_DATA_DIR / "remote_storage" / storage_provider
            remote_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(archive_path, remote_dir / archive_path.name)
            logger.info(f"Backup uploaded to simulated remote storage: {storage_provider}")

        backup_record = Backup(
            project_id=project_id,
            name=archive_path.name,
            backup_type=backup_type,
            storage_provider=storage_provider,
            file_path=str(archive_path),
            file_size=file_size
        )
        db.add(backup_record)
        db.commit()
        db.refresh(backup_record)
        
        log_entry = ActivityLog(
            project_id=project_id,
            event_type="backup",
            message=f"Backup '{backup_record.name}' successfully created ({storage_provider})."
        )
        db.add(log_entry)
        db.commit()
        
        return backup_record
        
    except Exception as e:
        logger.error(f"Backup operation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Backup operation failed: {str(e)}"
        )
    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir)

def restore_backup(db: Session, backup_id: str) -> bool:
    """
    Unpacks backup archive and performs restoration of files and/or database online.
    """
    backup = db.query(Backup).filter(Backup.id == backup_id).first()
    if not backup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Backup record not found in database"
        )
        
    archive_path = Path(backup.file_path)
    
    if not archive_path.exists() and backup.storage_provider in ("s3", "gdrive"):
        remote_path = settings.CPANEL_DATA_DIR / "remote_storage" / backup.storage_provider / backup.name
        if remote_path.exists():
            archive_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(remote_path, archive_path)
            logger.info(f"Retrieved archive '{backup.name}' from remote storage.")
            
    if not archive_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Backup archive file could not be found locally or remotely"
        )
        
    temp_extract = settings.CPANEL_DATA_DIR / "backups" / f"restore_tmp_{backup.id}"
    if temp_extract.exists():
        shutil.rmtree(temp_extract)
    temp_extract.mkdir(parents=True, exist_ok=True)
    
    try:
        shutil.unpack_archive(str(archive_path), str(temp_extract), "zip")
        
        restored_files_dir = temp_extract / "apps_files"
        if restored_files_dir.exists():
            if backup.project_id:
                project = db.query(Project).filter(Project.id == backup.project_id).first()
                if project:
                    proj_dest = settings.CPANEL_APPS_DIR / project.name
                    proj_src = restored_files_dir / project.name
                    if proj_src.exists():
                        if proj_dest.exists():
                            shutil.rmtree(proj_dest)
                        shutil.copytree(proj_src, proj_dest, symlinks=True)
                        logger.info(f"Restored files for project: {project.name}")
            else:
                for entry in os.scandir(restored_files_dir):
                    dest_path = settings.CPANEL_APPS_DIR / entry.name
                    if dest_path.exists():
                        if dest_path.is_dir():
                            shutil.rmtree(dest_path)
                        else:
                            os.remove(dest_path)
                    if entry.is_dir():
                        shutil.copytree(entry.path, dest_path, symlinks=True)
                    else:
                        shutil.copy2(entry.path, dest_path)
                logger.info("Restored system application files.")
                
        restored_db_file = temp_extract / "minicpanel.db"
        if not restored_db_file.exists():
            restored_db_file = temp_extract / "cpanel_lite.db"
            
        if restored_db_file.exists():
            is_in_memory = False
            try:
                if db.bind and "sqlite:///:memory:" in str(db.bind.url):
                    is_in_memory = True
            except Exception:
                pass
                
            if is_in_memory:
                logger.info("In-memory database detected, skipping SQLite online restore to prevent session erasure.")
            else:
                logger.info("Restoring database online via SQLite backup API...")
                src = sqlite3.connect(str(restored_db_file))
                dest = db.connection().connection
                if hasattr(dest, "dbapi_connection"):
                    dest = dest.dbapi_connection
                src.backup(dest)
                src.close()
                logger.info("Database online restore completed.")
            
        log_entry = ActivityLog(
            project_id=backup.project_id,
            event_type="restore",
            message=f"Restored backup archive '{backup.name}' successfully."
        )
        db.add(log_entry)
        db.commit()
        
        return True
        
    except Exception as e:
        logger.error(f"Restore operation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Restore operation failed: {str(e)}"
        )
    finally:
        if temp_extract.exists():
            shutil.rmtree(temp_extract)
