import time
import subprocess
import logging
import threading
import asyncio
from datetime import datetime
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.base import CronJob, ActivityLog
from app.core.monitor import run_monitoring_cycle

logger = logging.getLogger("cpanel_lite.scheduler")

_last_processed_minute = None
_last_ssl_renew_check = 0

def field_matches(field: str, value: int, min_val: int, max_val: int) -> bool:
    if field == "*":
        return True
    if "/" in field:
        parts = field.split("/")
        if len(parts) == 2:
            base, step = parts[0], parts[1]
            try:
                step_val = int(step)
                if base == "*":
                    return value % step_val == 0
                else:
                    if "-" in base:
                        r_parts = base.split("-")
                        start, end = int(r_parts[0]), int(r_parts[1])
                        return value >= start and value <= end and (value - start) % step_val == 0
                    else:
                        start = int(base)
                        return value >= start and (value - start) % step_val == 0
            except ValueError:
                return False
    if "," in field:
        for val_str in field.split(","):
            if field_matches(val_str, value, min_val, max_val):
                return True
        return False
    if "-" in field:
        parts = field.split("-")
        if len(parts) == 2:
            try:
                start, end = int(parts[0]), int(parts[1])
                return value >= start and value <= end
            except ValueError:
                return False
    try:
        return int(field) == value
    except ValueError:
        return False

def cron_matches(cron_expr: str, dt: datetime) -> bool:
    fields = cron_expr.split()
    if len(fields) != 5:
        return False
    
    minute = dt.minute
    hour = dt.hour
    day = dt.day
    month = dt.month
    day_of_week = (dt.weekday() + 1) % 7
    
    try:
        match_minute = field_matches(fields[0], minute, 0, 59)
        match_hour = field_matches(fields[1], hour, 0, 23)
        match_day = field_matches(fields[2], day, 1, 31)
        match_month = field_matches(fields[3], month, 1, 12)
        match_day_of_week = field_matches(fields[4], day_of_week, 0, 6)
        return match_minute and match_hour and match_day and match_month and match_day_of_week
    except Exception as e:
        logger.error(f"Error parsing cron expression '{cron_expr}': {e}")
        return False

def execute_job(job_id: str, command: str):
    """
    Runs the command, captures the output, and updates the database.
    """
    logger.info(f"Starting execution of cron job {job_id}: {command}")
    
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=300
        )
        output = f"Stdout:\n{result.stdout}\nStderr:\n{result.stderr}"
    except subprocess.TimeoutExpired:
        output = "Error: Job execution timed out after 300 seconds."
    except Exception as e:
        output = f"Error executing command: {str(e)}"
        
    db: Session = SessionLocal()
    try:
        job = db.query(CronJob).filter(CronJob.id == job_id).first()
        if job:
            job.last_run = datetime.utcnow()
            job.last_output = output
            
            log_entry = ActivityLog(
                project_id=job.project_id,
                event_type="cron",
                message=f"Executed cron job '{job.name}'."
            )
            db.add(log_entry)
            db.commit()
            logger.info(f"Completed cron job {job_id} successfully.")
    except Exception as e:
        logger.error(f"Failed to update database for cron job {job_id}: {e}")
    finally:
        db.close()

def scheduler_tick():
    global _last_processed_minute, _last_ssl_renew_check
    
    now = datetime.now()
    current_minute = (now.year, now.month, now.day, now.hour, now.minute)
    
    if _last_processed_minute == current_minute:
        return
        
    _last_processed_minute = current_minute
    
    db: Session = SessionLocal()
    try:
        run_monitoring_cycle(db)
        
        current_time = time.time()
        if current_time - _last_ssl_renew_check >= 43200:
            _last_ssl_renew_check = current_time
            from app.core.ssl import renew_expired_certificates
            try:
                logger.info("Scheduler Trigger: Starting check of expiring SSL certificates...")
                asyncio.run(renew_expired_certificates(db))
            except Exception as se:
                logger.error(f"Scheduler Trigger: Error executing SSL auto-renewal: {se}")
                
        active_jobs = db.query(CronJob).filter(CronJob.is_active == True).all()
        for job in active_jobs:
            if cron_matches(job.schedule, now):
                t = threading.Thread(
                    target=execute_job,
                    args=(job.id, job.command),
                    daemon=True
                )
                t.start()
    except Exception as e:
        logger.error(f"Scheduler tick error: {e}")
    finally:
        db.close()

def run_scheduler_loop():
    logger.info("Task Scheduler background worker started.")
    while True:
        try:
            scheduler_tick()
        except Exception as e:
            logger.error(f"Error in scheduler tick: {e}")
        time.sleep(5)

def start_scheduler():
    t = threading.Thread(target=run_scheduler_loop, daemon=True)
    t.start()
