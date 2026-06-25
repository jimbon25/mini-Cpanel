import os
import shutil
import subprocess
import logging
import psutil
import urllib.request
import urllib.error
from sqlalchemy.orm import Session
from app.models.base import Project, ActivityLog
from app.core.notifications import dispatch_notification

logger = logging.getLogger("cpanel_lite.monitor")

cpu_breach_count = 0
ram_breach_count = 0
http_failures = {}

def is_service_running(provider: str, name: str) -> bool:
    """
    Checks if a project service/process is actually active in the OS/Docker background.
    """
    try:
        if provider == "docker":
            if shutil.which("docker"):
                result = subprocess.run(
                    ["docker", "inspect", "-f", "{{.State.Running}}", name],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                return "true" in result.stdout.strip().lower()
            return True 
            
        elif provider == "systemd":
            if shutil.which("systemctl"):
                result_system = subprocess.run(
                    ["systemctl", "is-active", f"{name}.service"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result_system.stdout.strip() == "active":
                    return True
                
                cmd_env = os.environ.copy()
                if "XDG_RUNTIME_DIR" not in cmd_env:
                    try:
                        uid = os.getuid()
                        runtime_dir = f"/run/user/{uid}"
                        if os.path.exists(runtime_dir):
                            cmd_env["XDG_RUNTIME_DIR"] = runtime_dir
                    except Exception:
                        pass
                
                result_user = subprocess.run(
                    ["systemctl", "--user", "is-active", f"{name}.service"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                    env=cmd_env
                )
                return result_user.stdout.strip() == "active"
            return True
            
        elif provider == "windows":
            nssm_bin = shutil.which("nssm")
            if nssm_bin:
                result = subprocess.run(
                    [nssm_bin, "status", name],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                return "SERVICE_RUNNING" in result.stdout
            return True 
            
        return True
    except Exception as e:
        logger.error(f"Error checking health for service {name} ({provider}): {e}")
        return True 

def ping_project_http(project: Project) -> tuple[bool, str]:
    url = None
    if project.domains:
        url = f"http://{project.domains[0].domain_name}"
    elif project.port:
        url = f"http://127.0.0.1:{project.port}"
        
    if not url:
        return True, "No port or domain configured"
        
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'mini-cPanel-Uptime-Monitor/1.0'}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            status_code = response.getcode()
            if status_code >= 500:
                return False, f"HTTP {status_code}"
            return True, ""
    except urllib.error.HTTPError as he:
        if he.code >= 500:
            return False, f"HTTP {he.code}"
        return True, ""
    except urllib.error.URLError as ue:
        return False, f"Connection failed: {ue.reason}"
    except Exception as e:
        return False, f"Error: {str(e)}"

def check_services_health(db: Session):
    projects = db.query(Project).all()
    
    for proj in projects:
        running = is_service_running(proj.provider, proj.name)
        
        if proj.status == "online" and not running:
            logger.warning(f"Project '{proj.name}' was marked online but is NOT running! Updating status to failed.")
            proj.status = "failed"
            db.commit()
            
            log_entry = ActivityLog(
                project_id=proj.id,
                event_type="error",
                message=f"Service '{proj.name}' crashed or stopped unexpectedly in background."
            )
            db.add(log_entry)
            db.commit()
            
            alert_msg = f"🚨 [cPanel-Lite Alert] Project '{proj.name}' has went down unexpectedly in background!"
            dispatch_notification(db, alert_msg)
            
        elif proj.status in ("failed", "offline") and running:
            is_healthy, _ = ping_project_http(proj)
            if is_healthy:
                logger.info(f"Service '{proj.name}' is running and responsive via HTTP. Restoring status to online.")
                proj.status = "online"
                http_failures[proj.id] = 0
                db.commit()
                
                log_entry = ActivityLog(
                    project_id=proj.id,
                    event_type="info",
                    message=f"Service '{proj.name}' is active and responsive via HTTP."
                )
                db.add(log_entry)
                db.commit()
                
        elif running and proj.status == "online":
            is_healthy, err_detail = ping_project_http(proj)
            if not is_healthy:
                failures = http_failures.get(proj.id, 0) + 1
                http_failures[proj.id] = failures
                logger.warning(f"HTTP ping failed for project '{proj.name}' ({failures}/3): {err_detail}")
                
                if failures >= 3:
                    logger.error(f"HTTP ping failed 3 times for project '{proj.name}'. Marking failed.")
                    proj.status = "failed"
                    db.commit()
                    
                    log_entry = ActivityLog(
                        project_id=proj.id,
                        event_type="error",
                        message=f"HTTP Ping failed: {err_detail}. Web server is unresponsive."
                    )
                    db.add(log_entry)
                    db.commit()
                    
                    alert_msg = f"🚨 [cPanel-Lite Alert] Project '{proj.name}' is running as a process, but HTTP ping is failing (Status: {err_detail})!"
                    dispatch_notification(db, alert_msg)
            else:
                if proj.id in http_failures:
                    http_failures[proj.id] = 0

def check_system_thresholds(db: Session):
    """
    Monitors CPU and RAM thresholds and triggers alerts on 5 consecutive minutes breach.
    """
    global cpu_breach_count, ram_breach_count
    
    try:
        cpu_percent = psutil.cpu_percent(interval=None)
        if cpu_percent > 95.0:
            cpu_breach_count += 1
            logger.warning(f"CPU threshold breached: {cpu_percent}% (Breach count: {cpu_breach_count})")
            if cpu_breach_count == 5:
                dispatch_notification(
                    db,
                    f"⚠️ [cPanel-Lite Alert] High CPU Usage detected: {cpu_percent}% for over 5 consecutive minutes!"
                )
        else:
            cpu_breach_count = 0
    except Exception as e:
        logger.error(f"Failed to check CPU threshold: {e}")
        
    # 2. Check RAM
    try:
        mem = psutil.virtual_memory()
        ram_percent = mem.percent
        if ram_percent > 90.0:
            ram_breach_count += 1
            logger.warning(f"RAM threshold breached: {ram_percent}% (Breach count: {ram_breach_count})")
            if ram_breach_count == 5:
                dispatch_notification(
                    db,
                    f"⚠️ [cPanel-Lite Alert] High RAM Usage detected: {ram_percent}% for over 5 consecutive minutes!"
                )
        else:
            ram_breach_count = 0
    except Exception as e:
        logger.error(f"Failed to check RAM threshold: {e}")

def run_monitoring_cycle(db: Session):
    """
    Executes a single check on services health and system thresholds.
    Called by the scheduler every minute.
    """
    logger.info("Executing background monitoring cycle...")
    check_services_health(db)
    check_system_thresholds(db)
