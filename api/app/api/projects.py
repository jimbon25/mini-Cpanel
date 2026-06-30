import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends, BackgroundTasks, HTTPException, status
from sqlalchemy.orm import Session
from jose import jwt
from typing import List

from app.core.config import settings
from app.core.database import get_db, SessionLocal
from app.models.base import Project, User, ActivityLog, Domain, CronJob, Deployment
from app.schemas.projects import ProjectCreate, ProjectUpdate, ProjectResponse, DomainResponse, DomainBase, CronJobCreate, CronJobUpdate, CronJobResponse, DeploymentResponse
from app.api.dependencies import get_current_user, RoleChecker
from app.core.deployment import deploy_project_task, start_service, stop_service, log_activity, cleanup_project_service
from app.core.ssl import issue_ssl_certificate
from app.core.broadcaster import deployment_broadcaster

router = APIRouter()
get_project_user = RoleChecker(["super_admin", "developer"])

def get_websocket_user(token: str, db: Session) -> bool:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return False
        user = db.query(User).filter(User.username == username).first()
        if user and user.role in ["super_admin", "developer"]:
            return True
        return False
    except Exception:
        return False


@router.get("", response_model=List[ProjectResponse])
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    List all configured projects.
    """
    from app.core.monitor import get_project_resources
    projects = db.query(Project).all()
    for project in projects:
        if project.status == "online":
            cpu, mem = get_project_resources(project.provider, project.name)
            project.cpu_usage = cpu
            project.memory_usage = mem
        else:
            project.cpu_usage = 0.0
            project.memory_usage = 0
    return projects

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Configure a new project.
    """
    existing = db.query(Project).filter(Project.name == payload.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project with this name already exists"
        )
    
    project = Project(
        name=payload.name,
        provider=payload.provider,
        git_repo=payload.git_repo,
        branch=payload.branch,
        port=payload.port,
        env_vars=payload.env_vars,
        enable_http_ping=payload.enable_http_ping,
        status="offline"
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    
    log_entry = ActivityLog(
        project_id=project.id,
        event_type="create",
        message=f"Project {project.name} registered under {project.provider} provider."
    )
    db.add(log_entry)
    db.commit()
    
    return project

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Get detailed project configuration.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    from app.core.monitor import get_project_resources
    if project.status == "online":
        cpu, mem = get_project_resources(project.provider, project.name)
        project.cpu_usage = cpu
        project.memory_usage = mem
    else:
        project.cpu_usage = 0.0
        project.memory_usage = 0
        
    return project

@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Update project details.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    old_name = project.name
    
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)
        
    db.commit()
    db.refresh(project)
    
    log_entry = ActivityLog(
        project_id=project.id,
        event_type="update",
        message=f"Project parameters updated (Old name: {old_name})."
    )
    db.add(log_entry)
    db.commit()
    
    return project

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Delete a project configuration and tear down any running service.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    await cleanup_project_service(project, db)
        
    db.delete(project)
    db.commit()
    
    log_entry = ActivityLog(
        event_type="delete",
        message=f"Project {project.name} configuration deleted from database."
    )
    db.add(log_entry)
    db.commit()
    
    return


@router.post("/{project_id}/deploy")
def deploy_project(
    project_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Triggers asynchronous git clone/pull and deployment builder workflow.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    project.status = "deploying"
    db.commit()
    
    background_tasks.add_task(deploy_project_task, project.id, SessionLocal)
    
    return {"status": "deploying", "message": "Deployment task successfully scheduled in background."}

@router.post("/{project_id}/start")
async def start_project_service(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Manually start the project process container or daemon.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    success = await start_service(project, db)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start project process"
        )
    return {"status": "online", "message": f"Service {project.name} successfully started."}

@router.post("/{project_id}/stop")
async def stop_project_service(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Manually stop the project process container or daemon.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    success = await stop_service(project, db)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to stop project process"
        )
    return {"status": "offline", "message": f"Service {project.name} successfully stopped."}


@router.get("/{project_id}/domains", response_model=List[DomainResponse])
def list_project_domains(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    List all domains configured for a project.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    return project.domains

@router.post("/{project_id}/domains", response_model=DomainResponse, status_code=status.HTTP_201_CREATED)
def add_project_domain(
    project_id: str,
    payload: DomainBase,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Map a new domain to a project.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    existing = db.query(Domain).filter(Domain.domain_name == payload.domain_name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Domain name already mapped to a project"
        )
        
    domain = Domain(
        project_id=project.id,
        domain_name=payload.domain_name,
        ssl_enabled=payload.ssl_enabled,
        ssl_provider=payload.ssl_provider
    )
    db.add(domain)
    db.commit()
    db.refresh(domain)
    
    log_entry = ActivityLog(
        project_id=project.id,
        event_type="update",
        message=f"Added domain mapping: {domain.domain_name} for project {project.name}."
    )
    db.add(log_entry)
    db.commit()
    
    return domain

@router.delete("/{project_id}/domains/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_project_domain(
    project_id: str,
    domain_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Delete a domain mapping from a project.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
        
    domain = db.query(Domain).filter(Domain.id == domain_id, Domain.project_id == project_id).first()
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain mapping not found"
        )
        
    db.delete(domain)
    db.commit()
    
    log_entry = ActivityLog(
        project_id=project.id,
        event_type="update",
        message=f"Removed domain mapping: {domain.domain_name}."
    )
    db.add(log_entry)
    db.commit()
    
    return

@router.post("/{project_id}/domains/{domain_id}/ssl", response_model=DomainResponse)
async def configure_domain_ssl(
    project_id: str,
    domain_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Request an SSL/TLS certificate dynamically via Let's Encrypt for a mapped domain.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
        
    domain = db.query(Domain).filter(Domain.id == domain_id, Domain.project_id == project_id).first()
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain mapping not found"
        )
        
    background_tasks.add_task(issue_ssl_certificate, SessionLocal, domain.id)
    
    domain.ssl_enabled = True
    domain.ssl_provider = "certbot"
    db.commit()
    db.refresh(domain)
    
    return domain



@router.websocket("/{project_id}/logs/stream")
async def websocket_logs_stream(
    websocket: WebSocket,
    project_id: str,
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    is_authenticated = get_websocket_user(token, db)
    if not is_authenticated:
        await websocket.close(code=1008)
        return
        
    await websocket.accept()
    
    project = db.query(Project).filter(Project.id == project_id).first()
    
    try:
        if not project:
            await websocket.send_text(f"[System] Project {project_id} not found in DB. Commencing mock log stream...")
            for i in range(1, 6):
                await websocket.send_text(f"[Mock Log - {i}/5] Service listening on port 8000...")
                await asyncio.sleep(0.2)
            await websocket.send_text("[System] Mock log stream terminated.")
            return
            
        if project.provider == "systemd":
            await websocket.send_text(f"[Systemd] Reading journalctl logs for {project.name}.service...")
            import os
            from app.core.deployment import is_systemd_user_service
            
            is_root = (os.geteuid() == 0)
            is_user = is_systemd_user_service(f"{project.name}.service")
            
            journal_cmd = ["journalctl"]
            if is_user:
                journal_cmd.append("--user")
            journal_cmd.extend(["-u", f"{project.name}.service", "-f", "-n", "30"])
            
            cmd_env = os.environ.copy()
            if is_user and "XDG_RUNTIME_DIR" not in cmd_env:
                uid = os.getuid()
                runtime_dir = f"/run/user/{uid}"
                if os.path.exists(runtime_dir):
                    cmd_env["XDG_RUNTIME_DIR"] = runtime_dir
            
            proc = await asyncio.create_subprocess_exec(
                *journal_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=cmd_env
            )
            try:
                while True:
                    line = await proc.stdout.readline()
                    if not line:
                        break
                    await websocket.send_text(line.decode("utf-8").strip())
            except Exception as e:
                await websocket.send_text(f"[Systemd Error] {str(e)}")
            finally:
                try:
                    proc.kill()
                    await proc.wait()
                except Exception:
                    pass
                    
        elif project.provider == "docker":
            await websocket.send_text(f"[Docker] Log stream initiated for container {project.name}...")
            proc = await asyncio.create_subprocess_exec(
                "docker", "logs", "-f", "--tail", "50", project.name,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            try:
                while True:
                    line = await proc.stdout.readline()
                    if not line:
                        break
                    await websocket.send_text(line.decode("utf-8").strip())
            except Exception as e:
                await websocket.send_text(f"[Docker Error] {str(e)}")
            finally:
                try:
                    proc.kill()
                    await proc.wait()
                except Exception:
                    pass
        else:
            await websocket.send_text(f"[cPanel-Lite] Log stream for {project.provider} is not fully active.")
            
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_text(f"[Error] Stream exception: {str(e)}")
        except Exception:
            pass

@router.websocket("/{project_id}/deployments/{deployment_id}/stream")
async def websocket_deployment_logs_stream(
    websocket: WebSocket,
    project_id: str,
    deployment_id: str,
    token: str = Query(...)
):
    db = SessionLocal()
    try:
        is_authenticated = get_websocket_user(token, db)
    finally:
        db.close()

    if not is_authenticated:
        await websocket.close(code=1008)
        return
        
    await websocket.accept()
    
    is_active = False
    for _ in range(30):
        async with deployment_broadcaster.lock:
            if deployment_id in deployment_broadcaster.active_logs:
                is_active = True
                break
        await asyncio.sleep(0.5)
        
    if is_active:
        try:
            buffer = await deployment_broadcaster.subscribe(deployment_id, websocket)
            for line in buffer:
                await websocket.send_text(line)
                
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            await deployment_broadcaster.unsubscribe(deployment_id, websocket)
    else:
        db = SessionLocal()
        try:
            deployment = db.query(Deployment).filter(Deployment.id == deployment_id).first()
            if deployment and deployment.build_logs:
                for line in deployment.build_logs.split("\n"):
                    await websocket.send_text(line)
            else:
                await websocket.send_text("[System] No active or historical deployment logs found.")
        except Exception as e:
            try:
                await websocket.send_text(f"[Error] Failed to fetch static logs: {str(e)}")
            except Exception:
                pass
        finally:
            db.close()
            try:
                await websocket.close(code=1000)
            except Exception:
                pass


@router.get("/{project_id}/cron", response_model=List[CronJobResponse])
def list_project_cron_jobs(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    List all cron jobs configured for a project.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    return project.cron_jobs

@router.post("/{project_id}/cron", response_model=CronJobResponse, status_code=status.HTTP_201_CREATED)
def add_project_cron_job(
    project_id: str,
    payload: CronJobCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Add a new cron job schedule for a project.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
        
    cron_job = CronJob(
        project_id=project.id,
        name=payload.name,
        schedule=payload.schedule,
        command=payload.command,
        is_active=payload.is_active
    )
    db.add(cron_job)
    db.commit()
    db.refresh(cron_job)
    
    log_entry = ActivityLog(
        project_id=project.id,
        event_type="update",
        message=f"Configured cron job '{cron_job.name}' with schedule '{cron_job.schedule}' for project {project.name}."
    )
    db.add(log_entry)
    db.commit()
    
    return cron_job

@router.put("/{project_id}/cron/{cron_id}", response_model=CronJobResponse)
def update_project_cron_job(
    project_id: str,
    cron_id: str,
    payload: CronJobUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Update details of a project cron job.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
        
    cron_job = db.query(CronJob).filter(CronJob.id == cron_id, CronJob.project_id == project_id).first()
    if not cron_job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cron job not found"
        )
        
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(cron_job, key, value)
        
    db.commit()
    db.refresh(cron_job)
    
    log_entry = ActivityLog(
        project_id=project.id,
        event_type="update",
        message=f"Updated parameters for cron job '{cron_job.name}'."
    )
    db.add(log_entry)
    db.commit()
    
    return cron_job

@router.delete("/{project_id}/cron/{cron_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_project_cron_job(
    project_id: str,
    cron_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Remove a cron job from a project.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
        
    cron_job = db.query(CronJob).filter(CronJob.id == cron_id, CronJob.project_id == project_id).first()
    if not cron_job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cron job not found"
        )
        
    db.delete(cron_job)
    db.commit()
    
    log_entry = ActivityLog(
        project_id=project.id,
        event_type="update",
        message=f"Deleted cron job '{cron_job.name}'."
    )
    db.add(log_entry)
    db.commit()
    
    return

import hmac
import hashlib
import secrets
from fastapi import Request

@router.post("/webhook/{project_id}", status_code=status.HTTP_202_ACCEPTED)
async def github_webhook_deploy(
    project_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Public webhook endpoint that allows GitHub/GitLab to trigger automatic redeployment
    if the HMAC-SHA256 signature validates correctly.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
        
    if not project.webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Webhook auto-deploy is not configured/active for this project"
        )
        
    signature_header = request.headers.get("X-Hub-Signature-256")
    if not signature_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing signature header"
        )
        
    body_content = await request.body()
    secret_bytes = project.webhook_secret.encode("utf-8")
    expected_sig = "sha256=" + hmac.new(secret_bytes, body_content, hashlib.sha256).hexdigest()
    
    if not hmac.compare_digest(signature_header, expected_sig):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature"
        )
        
    if project.status == "deploying":
        return {"status": "ignored", "message": "Project deployment is already in progress"}
        
    project.status = "deploying"
    db.commit()
    
    background_tasks.add_task(deploy_project_task, project.id, SessionLocal)
    
    return {"status": "deploying", "message": "Signature verified. Webhook trigger scheduled auto-deploy."}

@router.post("/{project_id}/webhook/secret", status_code=status.HTTP_200_OK)
def regenerate_webhook_secret(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Generates or rotates a random webhook secret key for GitHub integration.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
        
    secret = secrets.token_hex(20)
    project.webhook_secret = secret
    db.commit()
    
    return {"webhook_secret": secret}

@router.delete("/{project_id}/webhook/secret", status_code=status.HTTP_200_OK)
def delete_webhook_secret(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Removes the webhook secret, effectively disabling automatic deployments.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
        
    project.webhook_secret = None
    db.commit()
    
    return {"message": "Webhook auto-deploy disabled."}


@router.get("/{project_id}/deployments", response_model=List[DeploymentResponse])
def get_project_deployments(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Get all deployments for a project, sorted by most recent.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    return db.query(Deployment).filter(Deployment.project_id == project_id).order_by(Deployment.created_at.desc()).all()


@router.get("/{project_id}/deployments/{deployment_id}", response_model=DeploymentResponse)
def get_project_deployment_details(
    project_id: str,
    deployment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    """
    Get details (including build logs) for a specific deployment.
    """
    deployment = db.query(Deployment).filter(
        Deployment.id == deployment_id,
        Deployment.project_id == project_id
    ).first()
    
    if not deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found"
        )
    return deployment

import os
import shutil
import subprocess
from pathlib import Path
from pydantic import BaseModel

class WriteConfigRequest(BaseModel):
    filename: str
    content: str
    restart_service: bool = True

def get_project_config_path(project: Project) -> Path:
    base_dir = None
    if project.provider == "systemd":
        import shutil, subprocess
        if shutil.which("systemctl"):
            try:
                res = subprocess.run(
                    ["systemctl", "show", f"{project.name}.service", "-p", "WorkingDirectory"],
                    capture_output=True, text=True, timeout=2
                )
                if res.returncode == 0:
                    line = res.stdout.strip()
                    if "=" in line:
                        dir_str = line.split("=")[1].strip()
                        if dir_str and os.path.exists(dir_str):
                            base_dir = Path(dir_str)
            except Exception:
                pass
                
    if not base_dir:
        base_dir = settings.CPANEL_APPS_DIR / project.name
        
    return base_dir

def get_secure_project_file_path(project: Project, filename: str) -> Path:
    base_dir = get_project_config_path(project).resolve()
    target = (base_dir / filename).resolve()
    if target != base_dir and base_dir not in target.parents:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: path is outside the project directory"
        )
    return target

@router.get("/{project_id}/config/files", response_model=List[str])
def list_project_config_files(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
        
    base_dir = get_project_config_path(project)
    if not base_dir.exists() or not base_dir.is_dir():
        return []
        
    common_files = [".env", "config.yml", "config.yaml", "settings.json", "wrangler.toml"]
    found = []
    
    for filename in common_files:
        file_path = base_dir / filename
        if file_path.exists() and file_path.is_file():
            found.append(filename)
            
    if not found:
        try:
            for entry in os.scandir(base_dir):
                if entry.is_file() and any(pat in entry.name.lower() for pat in ["config", "env", "settings", "setup"]):
                    ext = Path(entry.name).suffix.lower()
                    if ext in [".json", ".yaml", ".yml", ".ini", ".toml", ".conf", ".txt", ""] or entry.name.startswith(".env"):
                        found.append(entry.name)
        except Exception:
            pass
            
    found.sort()
    return found

@router.get("/{project_id}/config/read")
def read_project_config_file(
    project_id: str,
    filename: str = Query(..., description="Name of the configuration file"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
        
    target_file = get_secure_project_file_path(project, filename)
    if not target_file.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Configuration file '{filename}' does not exist"
        )
        
    if not target_file.is_file():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{filename}' is not a file"
        )
        
    try:
        file_size = target_file.stat().st_size
        if file_size > 5 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File is too large to edit inline (max 5MB)"
            )
            
        content = target_file.read_text(encoding="utf-8")
        return {"filename": filename, "content": content}
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

@router.post("/{project_id}/config/write")
async def write_project_config_file(
    project_id: str,
    payload: WriteConfigRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_project_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
        
    target_file = get_secure_project_file_path(project, payload.filename)
    if target_file.exists() and not target_file.is_file():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target path is not a file"
        )
        
    try:
        target_file.parent.mkdir(parents=True, exist_ok=True)
        target_file.write_text(payload.content, encoding="utf-8")
        
        log_entry = ActivityLog(
            project_id=project.id,
            event_type="update",
            message=f"Configuration file '{payload.filename}' was modified."
        )
        db.add(log_entry)
        db.commit()
        
        restarted = False
        if payload.restart_service and project.status == "online":
            await stop_service(project, db)
            await start_service(project, db)
            restarted = True
            
            log_restart = ActivityLog(
                project_id=project.id,
                event_type="info",
                message=f"Service restarted automatically to apply config updates."
            )
            db.add(log_restart)
            db.commit()
            
        return {
            "success": True, 
            "message": f"Successfully wrote config file '{payload.filename}'." + (" Service restarted." if restarted else ""),
            "restarted": restarted
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write file: {str(e)}"
        )



