import os
import shutil
from pathlib import Path
from typing import List, Dict, Any
from fastapi import HTTPException, status
from app.core.config import settings

def get_secure_path(relative_path: str) -> Path:
    """
    Resolves relative path against CPANEL_APPS_DIR and validates
    that it remains inside the allowed directory (preventing directory traversal).
    """
    apps_root = settings.CPANEL_APPS_DIR.resolve()
    
    apps_root.mkdir(parents=True, exist_ok=True)
    
    target = Path(apps_root / relative_path).resolve()
    
    if target != apps_root and apps_root not in target.parents:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: path is outside the allowed directory"
        )
        
    return target

def list_directory(relative_path: str = "") -> List[Dict[str, Any]]:
    target = get_secure_path(relative_path)
    
    if not target.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Directory does not exist"
        )
        
    if not target.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path is not a directory"
        )
        
    items = []
    try:
        for entry in os.scandir(target):
            rel_path = str(Path(entry.path).relative_to(settings.CPANEL_APPS_DIR.resolve()))
            stat = entry.stat()
            items.append({
                "name": entry.name,
                "path": rel_path,
                "is_dir": entry.is_dir(),
                "size": stat.st_size if entry.is_file() else 0,
                "modified_at": stat.st_mtime
            })
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read directory: {str(e)}"
        )
        
    items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    return items

def read_file_content(relative_path: str) -> str:
    target = get_secure_path(relative_path)
    
    if not target.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File does not exist"
        )
        
    if not target.is_file():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path is not a file"
        )
        
    try:
        file_size = target.stat().st_size
        if file_size > 5 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File is too large to edit inline (max 5MB)"
            )
            
        return target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="File is not a valid text file"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read file: {str(e)}"
        )

def write_file_content(relative_path: str, content: str) -> bool:
    target = get_secure_path(relative_path)
    
    if target.exists() and not target.is_file():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target path is not a file"
        )
        
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return True
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write file: {str(e)}"
        )

def create_new_directory(relative_path: str) -> bool:
    target = get_secure_path(relative_path)
    
    if target.exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path already exists"
        )
        
    try:
        target.mkdir(parents=True, exist_ok=False)
        return True
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create directory: {str(e)}"
        )

def delete_file_or_directory(relative_path: str) -> bool:
    target = get_secure_path(relative_path)
    
    if target == settings.CPANEL_APPS_DIR.resolve():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete the root apps directory"
        )
        
    if not target.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Path does not exist"
        )
        
    try:
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
        return True
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete item: {str(e)}"
        )

import zipfile

def upload_file_stream(relative_path: str, file_name: str, stream) -> bool:
    """
    Saves a binary file stream inside the target relative_path.
    Uses get_secure_path to prevent traversal and enforces size limits.
    """
    target_dir = get_secure_path(relative_path)
    if not target_dir.exists() or not target_dir.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target path is not a valid directory"
        )
        
    target_file = (target_dir / file_name).resolve()
    
    apps_root = settings.CPANEL_APPS_DIR.resolve()
    if target_file != apps_root and apps_root not in target_file.parents:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: target path is outside allowed directory"
        )
        
    try:
        written_bytes = 0
        max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        
        with open(target_file, "wb") as f:
            while True:
                chunk = stream.read(8192)
                if not chunk:
                    break
                written_bytes += len(chunk)
                if written_bytes > max_bytes:
                    f.close()
                    os.unlink(target_file)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File upload exceeds maximum limit of {settings.MAX_UPLOAD_SIZE_MB}MB"
                    )
                f.write(chunk)
        return True
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}"
        )

def compress_to_zip(relative_path: str) -> str:
    """
    Compresses a directory or file into a ZIP archive.
    Returns the relative path of the created ZIP archive.
    """
    target = get_secure_path(relative_path)
    if not target.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target path does not exist"
        )
        
    zip_filename = f"{target.name}.zip"
    zip_target = (target.parent / zip_filename).resolve()
    
    try:
        with zipfile.ZipFile(zip_target, "w", zipfile.ZIP_DEFLATED) as zip_file:
            if target.is_dir():
                for root, dirs, files in os.walk(target):
                    for file in files:
                        file_path = Path(root) / file
                        arcname = file_path.relative_to(target.parent)
                        zip_file.write(file_path, arcname)
            else:
                zip_file.write(target, target.name)
                
        rel_zip_path = str(zip_target.relative_to(settings.CPANEL_APPS_DIR.resolve()))
        return rel_zip_path
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Zip compression failed: {str(e)}"
        )

def decompress_zip_archive(relative_zip_path: str) -> bool:
    """
    Decompresses a ZIP archive into its containing folder.
    Implements Zip-Slip checks to prevent path traversal vulnerabilities.
    """
    zip_path = get_secure_path(relative_zip_path)
    if not zip_path.exists() or not zip_path.is_file() or zip_path.suffix.lower() != ".zip":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path is not a valid zip archive file"
        )
        
    apps_root = settings.CPANEL_APPS_DIR.resolve()
    output_dir = zip_path.parent.resolve()
    
    try:
        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            for member in zip_ref.infolist():
                member_target = Path(output_dir / member.filename).resolve()
                if member_target != apps_root and apps_root not in member_target.parents:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Decompression aborted: Traversal attempt detected in ZIP member '{member.filename}'"
                    )
            
            zip_ref.extractall(path=output_dir)
        return True
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Decompression failed: {str(e)}"
        )
