import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="viewer", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    provider = Column(String, nullable=False)
    git_repo = Column(String, nullable=True)
    branch = Column(String, nullable=True, default="main")
    port = Column(Integer, nullable=True)
    status = Column(String, default="offline")
    env_vars = Column(String, nullable=True)
    last_deployed = Column(DateTime, nullable=True)
    webhook_secret = Column(String, nullable=True)
    
    domains = relationship("Domain", back_populates="project", cascade="all, delete-orphan")
    cron_jobs = relationship("CronJob", back_populates="project", cascade="all, delete-orphan")
    backups = relationship("Backup", back_populates="project", cascade="all, delete-orphan")
    logs = relationship("ActivityLog", back_populates="project", cascade="all, delete-orphan")
    deployments = relationship("Deployment", back_populates="project", cascade="all, delete-orphan")

class Domain(Base):
    __tablename__ = "domains"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    domain_name = Column(String, unique=True, nullable=False)
    ssl_enabled = Column(Boolean, default=False)
    ssl_expiry = Column(DateTime, nullable=True)
    ssl_provider = Column(String, nullable=True)
    
    project = relationship("Project", back_populates="domains")

class CronJob(Base):
    __tablename__ = "cron_jobs"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    schedule = Column(String, nullable=False)
    command = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    last_run = Column(DateTime, nullable=True)
    last_output = Column(String, nullable=True)
    
    project = relationship("Project", back_populates="cron_jobs")

class Backup(Base):
    __tablename__ = "backups"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    project_id = Column(String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    name = Column(String, nullable=False)
    backup_type = Column(String, nullable=False)
    storage_provider = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    project = relationship("Project", back_populates="backups")

class NotificationChannel(Base):
    __tablename__ = "notification_channels"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    channel_type = Column(String, nullable=False)
    webhook_url = Column(String, nullable=True)
    bot_token = Column(String, nullable=True)
    chat_id = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    alert_rules = Column(String, nullable=True)

class ActivityLog(Base):
    __tablename__ = "activity_logs"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    event_type = Column(String, nullable=False)
    message = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    project = relationship("Project", back_populates="logs")


class DatabaseConnection(Base):
    __tablename__ = "database_connections"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    db_type = Column(String, nullable=False)
    host = Column(String, nullable=True)
    port = Column(Integer, nullable=True)
    username = Column(String, nullable=True)
    password = Column(String, nullable=True)
    database_name = Column(String, nullable=True)
    file_path = Column(String, nullable=True)


class SystemSetting(Base):
    __tablename__ = "system_settings"
    
    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)


class Deployment(Base):
    __tablename__ = "deployments"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    commit_sha = Column(String, nullable=True)
    commit_message = Column(String, nullable=True)
    commit_author = Column(String, nullable=True)
    status = Column(String, default="queued")
    build_logs = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    project = relationship("Project", back_populates="deployments")


