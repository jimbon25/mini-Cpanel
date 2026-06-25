from fastapi import APIRouter, Depends, Query, status, UploadFile, File
from app.api.dependencies import get_current_user, RoleChecker
from app.core.files import (
    list_directory,
    read_file_content,
    write_file_content,
    create_new_directory,
    delete_file_or_directory,
    upload_file_stream,
    compress_to_zip,
    decompress_zip_archive
)
from app.schemas.files import CreateDirRequest, WriteFileRequest, ZipRequest
from app.models.base import User

router = APIRouter(dependencies=[Depends(RoleChecker(["super_admin", "developer"]))])

@router.get("/list")
def list_files(
    path: str = Query("", description="Relative path from application directory root"),
    current_user: User = Depends(get_current_user)
):
    """
    List files and directories relative to the applications root directory.
    """
    return list_directory(path)

@router.get("/read")
def read_file(
    path: str = Query(..., description="Relative path of file to read"),
    current_user: User = Depends(get_current_user)
):
    """
    Read text contents of a file.
    """
    content = read_file_content(path)
    return {"path": path, "content": content}

@router.post("/write", status_code=status.HTTP_200_OK)
def write_file(
    payload: WriteFileRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Write (or overwrite) text contents of a file.
    """
    success = write_file_content(payload.path, payload.content)
    return {"path": payload.path, "success": success}

@router.post("/mkdir", status_code=status.HTTP_201_CREATED)
def make_directory(
    payload: CreateDirRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Create a new directory.
    """
    success = create_new_directory(payload.path)
    return {"path": payload.path, "success": success}

@router.delete("", status_code=status.HTTP_200_OK)
def delete_item(
    path: str = Query(..., description="Relative path to delete"),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a file or directory recursively.
    """
    success = delete_file_or_directory(path)
    return {"path": path, "success": success}

@router.post("/upload", status_code=status.HTTP_201_CREATED)
def upload_file(
    path: str = Query("", description="Target relative directory path to upload to"),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Upload a binary file inside a directory.
    """
    success = upload_file_stream(path, file.filename, file.file)
    return {"filename": file.filename, "success": success}

@router.post("/zip", status_code=status.HTTP_200_OK)
def zip_item(
    payload: ZipRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Compress a file or directory into a ZIP archive.
    """
    zip_path = compress_to_zip(payload.path)
    return {"zip_path": zip_path, "success": True}

@router.post("/unzip", status_code=status.HTTP_200_OK)
def unzip_item(
    payload: ZipRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Decompress a ZIP archive into its containing folder.
    """
    success = decompress_zip_archive(payload.path)
    return {"path": payload.path, "success": success}
