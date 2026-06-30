import os
import shutil
import subprocess
import logging
import psutil
import urllib.request
import urllib.error
import time
from sqlalchemy.orm import Session
from app.models.base import Project, ActivityLog
from app.core.notifications import dispatch_notification

logger = logging.getLogger("cpanel_lite.monitor")

cpu_breach_count = 0
ram_breach_count = 0
http_failures = {}

def parse_size_to_bytes(size_str: str) -> int:
    try:
        size_str = size_str.lower().strip()
        units = {
            "b": 1,
            "k": 1024,
            "kb": 1024,
            "m": 1024*1024,
            "mb": 1024*1024,
            "mib": 1024*1024,
            "g": 1024*1024*1024,
            "gb": 1024*1024*1024,
            "gib": 1024*1024*1024,
        }
        numeric_part = ""
        unit_part = ""
        for char in size_str:
            if char.isdigit() or char == ".":
                numeric_part += char
            else:
                unit_part += char
        unit_part = unit_part.strip()
        factor = units.get(unit_part, 1)
        return int(float(numeric_part) * factor)
    except Exception:
        return 0

class ProcessTracker:
    def __init__(self):
        self.processes = {}

    def get_process(self, pid: int) -> psutil.Process:
        import time
        now = time.time()
        if pid in self.processes:
            proc, _ = self.processes[pid]
            try:
                if proc.is_running():
                    self.processes[pid] = (proc, now)
                    return proc
            except Exception:
                pass
        
        proc = psutil.Process(pid)
        try:
            proc.cpu_percent(interval=None)
        except Exception:
            pass
        self.processes[pid] = (proc, now)
        
        stale_pids = [p for p, (_, t) in self.processes.items() if now - t > 60]
        for p in stale_pids:
            self.processes.pop(p, None)
        return proc

_tracker = ProcessTracker()

def get_project_resources(provider: str, name: str) -> tuple[float, int]:
    """
    Returns (cpu_percentage, memory_usage_bytes) for the given project.
    """
    cpu_percent = 0.0
    mem_bytes = 0
    
    if provider == "docker":
        if shutil.which("docker"):
            try:
                res = subprocess.run(
                    ["docker", "stats", "--no-stream", "--format", "{{.CPUPerc}}|{{.MemUsage}}", name],
                    capture_output=True, text=True, timeout=3
                )
                if res.returncode == 0:
                    parts = res.stdout.strip().split("|")
                    if len(parts) >= 2:
                        cpu_str = parts[0].replace("%", "").strip()
                        cpu_percent = float(cpu_str) if cpu_str else 0.0
                        
                        mem_part = parts[1].split("/")[0].strip()
                        mem_bytes = parse_size_to_bytes(mem_part)
            except Exception as e:
                logger.debug(f"Docker stats query failed for {name}: {e}")
                
    elif provider == "systemd":
        if shutil.which("systemctl"):
            try:
                res = subprocess.run(
                    ["systemctl", "show", f"{name}.service", "-p", "MainPID"],
                    capture_output=True, text=True, timeout=2
                )
                pid = 0
                if res.returncode == 0:
                    line = res.stdout.strip()
                    if "=" in line:
                        pid_str = line.split("=")[1].strip()
                        if pid_str.isdigit():
                            pid = int(pid_str)
                
                if pid > 0:
                    try:
                        main_proc = _tracker.get_process(pid)
                        mem_bytes = main_proc.memory_info().rss
                        cpu_percent = main_proc.cpu_percent(interval=None)
                        
                        for child in main_proc.children(recursive=True):
                            try:
                                child_proc = _tracker.get_process(child.pid)
                                mem_bytes += child_proc.memory_info().rss
                                cpu_percent += child_proc.cpu_percent(interval=None)
                            except (psutil.NoSuchProcess, psutil.AccessDenied):
                                pass
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
                
                if mem_bytes == 0:
                    res_mem = subprocess.run(
                        ["systemctl", "show", f"{name}.service", "-p", "MemoryCurrent"],
                        capture_output=True, text=True, timeout=2
                    )
                    if res_mem.returncode == 0:
                        line = res_mem.stdout.strip()
                        if "=" in line:
                            val = line.split("=")[1].strip()
                            if val.isdigit() and val != "18446744073709551615":
                                mem_bytes = int(val)
            except Exception as e:
                logger.debug(f"Systemd resource query failed for {name}: {e}")
                
    return cpu_percent, mem_bytes

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

def ping_project_http(project: Project) -> tuple[bool, str, int | None]:
    url = None
    if project.domains:
        url = f"http://{project.domains[0].domain_name}"
    elif project.port:
        url = f"http://127.0.0.1:{project.port}"
        
    if not url:
        return True, "No port or domain configured", None
        
    start_time = time.perf_counter()
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'mini-cPanel-Uptime-Monitor/1.0'}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            status_code = response.getcode()
            latency = int((time.perf_counter() - start_time) * 1000)
            if status_code >= 500:
                return False, f"HTTP {status_code}", latency
            return True, "", latency
    except urllib.error.HTTPError as he:
        latency = int((time.perf_counter() - start_time) * 1000)
        if he.code >= 500:
            return False, f"HTTP {he.code}", latency
        return True, "", latency
    except urllib.error.URLError as ue:
        latency = int((time.perf_counter() - start_time) * 1000)
        return False, f"Connection failed: {ue.reason}", latency
    except Exception as e:
        latency = int((time.perf_counter() - start_time) * 1000)
        return False, f"Error: {str(e)}", latency

def check_services_health(db: Session):
    projects = db.query(Project).all()
    
    for proj in projects:
        running = is_service_running(proj.provider, proj.name)
        
        if proj.status == "online" and not running:
            logger.warning(f"Project '{proj.name}' was marked online but is NOT running! Updating status to failed.")
            proj.status = "failed"
            proj.ping_latency_ms = None
            proj.ping_error_detail = "Process/Service not running in background"
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
            if not proj.enable_http_ping:
                proj.status = "online"
                proj.ping_latency_ms = None
                proj.ping_error_detail = None
                http_failures[proj.id] = 0
                db.commit()
                continue
            is_healthy, err_detail, latency = ping_project_http(proj)
            if is_healthy:
                logger.info(f"Service '{proj.name}' is running and responsive via HTTP. Restoring status to online.")
                proj.status = "online"
                proj.ping_latency_ms = latency
                proj.ping_error_detail = None
                http_failures[proj.id] = 0
                db.commit()
                
                log_entry = ActivityLog(
                    project_id=proj.id,
                    event_type="info",
                    message=f"Service '{proj.name}' is active and responsive via HTTP."
                )
                db.add(log_entry)
                db.commit()
            else:
                proj.ping_latency_ms = latency
                proj.ping_error_detail = err_detail
                db.commit()
                
        elif running and proj.status == "online":
            if not proj.enable_http_ping:
                proj.ping_latency_ms = None
                proj.ping_error_detail = None
                if proj.id in http_failures:
                    http_failures[proj.id] = 0
                db.commit()
                continue
            is_healthy, err_detail, latency = ping_project_http(proj)
            if not is_healthy:
                failures = http_failures.get(proj.id, 0) + 1
                http_failures[proj.id] = failures
                logger.warning(f"HTTP ping failed for project '{proj.name}' ({failures}/3): {err_detail}")
                
                if failures >= 3:
                    logger.error(f"HTTP ping failed 3 times for project '{proj.name}'. Marking failed.")
                    proj.status = "failed"
                    proj.ping_latency_ms = latency
                    proj.ping_error_detail = err_detail
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
                proj.ping_latency_ms = latency
                proj.ping_error_detail = None
                db.commit()
                
        elif not running and proj.status == "failed":
            if proj.ping_error_detail != "Process/Service not running in background":
                proj.ping_latency_ms = None
                proj.ping_error_detail = "Process/Service not running in background"
                db.commit()

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
