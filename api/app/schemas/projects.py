from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class DomainBase(BaseModel):
    domain_name: str
    ssl_enabled: Optional[bool] = False
    ssl_provider: Optional[str] = None

class DomainCreate(DomainBase):
    project_id: str

class DomainResponse(DomainBase):
    id: str
    project_id: str
    ssl_expiry: Optional[datetime] = None

    class Config:
        from_attributes = True

class ProjectBase(BaseModel):
    name: str
    provider: str = Field(..., description="docker, systemd, or windows")
    git_repo: Optional[str] = None
    branch: Optional[str] = "main"
    port: Optional[int] = None
    env_vars: Optional[str] = None

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    git_repo: Optional[str] = None
    branch: Optional[str] = None
    port: Optional[int] = None
    env_vars: Optional[str] = None
    status: Optional[str] = None

class CronJobBase(BaseModel):
    name: str
    schedule: str
    command: str
    is_active: Optional[bool] = True

class CronJobCreate(CronJobBase):
    pass

class CronJobUpdate(BaseModel):
    name: Optional[str] = None
    schedule: Optional[str] = None
    command: Optional[str] = None
    is_active: Optional[bool] = None


class CronJobResponse(CronJobBase):
    id: str
    project_id: str
    last_run: Optional[datetime] = None
    last_output: Optional[str] = None

    class Config:
        from_attributes = True

class ProjectResponse(ProjectBase):
    id: str
    status: str
    last_deployed: Optional[datetime] = None
    webhook_secret: Optional[str] = None
    domains: List[DomainResponse] = []
    cron_jobs: List[CronJobResponse] = []

    class Config:
        from_attributes = True


class DeploymentResponse(BaseModel):
    id: str
    project_id: str
    commit_sha: Optional[str] = None
    commit_message: Optional[str] = None
    commit_author: Optional[str] = None
    status: str
    build_logs: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


