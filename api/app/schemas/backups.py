from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class BackupCreate(BaseModel):
    project_id: Optional[str] = None
    backup_type: str = "database"
    storage_provider: str = "local"

class BackupResponse(BaseModel):
    id: str
    project_id: Optional[str] = None
    name: str
    backup_type: str
    storage_provider: str
    file_path: str
    file_size: int
    created_at: datetime

    class Config:
        from_attributes = True
