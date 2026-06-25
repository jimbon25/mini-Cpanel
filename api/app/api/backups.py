import os
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.database import get_db, SessionLocal
from app.api.dependencies import get_current_user, RoleChecker
from app.models.base import Backup, User, ActivityLog
from app.schemas.backups import BackupCreate, BackupResponse
from app.core.backup import perform_backup, restore_backup

router = APIRouter(dependencies=[Depends(RoleChecker(["super_admin"]))])

@router.get("", response_model=List[BackupResponse])
def list_backups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List all backups (system and project-specific).
    """
    return db.query(Backup).order_by(Backup.created_at.desc()).all()

@router.post("", response_model=BackupResponse, status_code=status.HTTP_201_CREATED)
def create_backup_endpoint(
    payload: BackupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Perform a system or project backup.
    """
    return perform_backup(
        db=db,
        project_id=payload.project_id,
        backup_type=payload.backup_type,
        storage_provider=payload.storage_provider
    )

@router.post("/{backup_id}/restore")
def restore_backup_endpoint(
    backup_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Restore system/project state from a backup archive.
    """
    success = restore_backup(db, backup_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Restore operation failed"
        )
    return {"status": "success", "message": "Restoration completed successfully."}

@router.delete("/{backup_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_backup_endpoint(
    backup_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a backup archive and its metadata record.
    """
    backup = db.query(Backup).filter(Backup.id == backup_id).first()
    if not backup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Backup record not found"
        )
        
    if backup.file_path and os.path.exists(backup.file_path):
        try:
            os.remove(backup.file_path)
        except Exception as e:
            pass
            
    if backup.storage_provider in ("s3", "gdrive"):
        remote_path = os.path.join(
            os.path.dirname(backup.file_path),
            "..",
            "remote_storage",
            backup.storage_provider,
            backup.name
        )
        remote_path = os.path.normpath(remote_path)
        if os.path.exists(remote_path):
            try:
                os.remove(remote_path)
            except Exception:
                pass
                
    db.delete(backup)
    db.commit()
    
    log_entry = ActivityLog(
        project_id=backup.project_id,
        event_type="update",
        message=f"Deleted backup record and file for '{backup.name}'."
    )
    db.add(log_entry)
    db.commit()
    
    return
