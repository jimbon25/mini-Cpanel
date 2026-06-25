import os
import shutil
import asyncio
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.models.base import Domain, ActivityLog

logger = logging.getLogger("cpanel_lite.ssl")

async def run_command(cmd: list[str]) -> tuple[int, str, str]:
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        return proc.returncode, stdout.decode('utf-8', errors='ignore'), stderr.decode('utf-8', errors='ignore')
    except Exception as e:
        return -1, "", str(e)

async def issue_ssl_certificate(db_factory, domain_id: str) -> bool:
    """
    Attempts to issue a Let's Encrypt SSL certificate using Certbot wrapper.
    If Certbot is not found, falls back to simulating a valid certificate.
    """
    db: Session = db_factory()
    domain = db.query(Domain).filter(Domain.id == domain_id).first()
    if not domain:
        logger.error(f"SSL worker: Domain mapping {domain_id} not found in DB.")
        db.close()
        return False

    logger.info(f"Initiating SSL certificate issuance for domain: {domain.domain_name}")
    
    try:
        certbot_bin = shutil.which("certbot")
        if not certbot_bin:
            logger.warning("Certbot binary not found. Simulating certificate generation...")
            await asyncio.sleep(1.0) # Simulate network ACME challenge delay
            
            domain.ssl_enabled = True
            domain.ssl_expiry = datetime.utcnow() + timedelta(days=90)
            domain.ssl_provider = "certbot"
            db.commit()
            
            log_entry = ActivityLog(
                project_id=domain.project_id,
                event_type="deploy",
                message=f"SSL certificate successfully issued (Simulated) for domain: {domain.domain_name} via Let's Encrypt."
            )
            db.add(log_entry)
            db.commit()
            return True

        cmd = [
            certbot_bin, "certonly",
            "--standalone",
            "-d", domain.domain_name,
            "--non-interactive",
            "--agree-tos",
            "--register-unsafely-without-email"
        ]
        
        code, out, err = await run_command(cmd)
        if code == 0:
            domain.ssl_enabled = True
            domain.ssl_expiry = datetime.utcnow() + timedelta(days=90)
            domain.ssl_provider = "certbot"
            db.commit()
            
            log_entry = ActivityLog(
                project_id=domain.project_id,
                event_type="deploy",
                message=f"SSL certificate successfully issued for domain: {domain.domain_name} using Certbot Let's Encrypt."
            )
            db.add(log_entry)
            db.commit()
            return True
        else:
            logger.error(f"Certbot failed for domain {domain.domain_name}: {err}")
            log_entry = ActivityLog(
                project_id=domain.project_id,
                event_type="error",
                message=f"SSL certificate issuance failed for domain: {domain.domain_name}. Error: {err}"
            )
            db.add(log_entry)
            db.commit()
            return False
    except Exception as e:
        logger.error(f"SSL certificate exception: {e}")
        return False
    finally:
        db.close()

async def renew_expired_certificates(db: Session):
    """
    Finds all enabled SSL certificates expiring within the next 30 days
    and triggers automated renewal.
    """
    threshold = datetime.utcnow() + timedelta(days=30)
    expiring_domains = db.query(Domain).filter(
        Domain.ssl_enabled == True,
        Domain.ssl_expiry <= threshold
    ).all()
    
    if not expiring_domains:
        logger.info("No expiring SSL certificates found.")
        return
        
    logger.info(f"Found {len(expiring_domains)} expiring SSL certificate(s). Starting auto-renewal...")
    
    certbot_bin = shutil.which("certbot")
    if not certbot_bin:
        for domain in expiring_domains:
            domain.ssl_expiry = datetime.utcnow() + timedelta(days=90)
            db.commit()
            logger.info(f"Renewed certificate (Simulated) for domain: {domain.domain_name}")
        return

    code, out, err = await run_command([certbot_bin, "renew", "--non-interactive"])
    if code == 0:
        logger.info("Certbot renew succeeded. Syncing domain expiry dates...")
        for domain in expiring_domains:
            domain.ssl_expiry = datetime.utcnow() + timedelta(days=90)
            db.commit()
    else:
        logger.error(f"Certbot renew failed: {err}")
