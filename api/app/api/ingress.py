import logging
import shutil
import asyncio
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.core.database import SessionLocal, get_db
from app.api.dependencies import get_current_user, RoleChecker
from app.models.base import User, IngressRule, ActivityLog, Domain
from app.schemas.ingress import IngressRuleCreate, IngressRuleUpdate, IngressRuleResponse
from app.core.ingress import apply_ingress_config, remove_ingress_config, run_command

logger = logging.getLogger("cpanel_lite.ingress_api")
router = APIRouter(dependencies=[Depends(RoleChecker(["super_admin", "developer"]))])

async def issue_ingress_ssl_task(db_factory, rule_id: str):
    db: Session = db_factory()
    try:
        rule = db.query(IngressRule).filter(IngressRule.id == rule_id).first()
        if not rule:
            logger.error(f"Ingress SSL: Rule {rule_id} not found.")
            return

        logger.info(f"Issuing SSL certificate for ingress domain: {rule.domain_name}")
        certbot_bin = shutil.which("certbot")
        if not certbot_bin:
            logger.warning("Certbot not found. Simulating SSL certificate generation...")
            await asyncio.sleep(1.0)
            rule.ssl_enabled = True
            rule.ssl_expiry = datetime.utcnow() + timedelta(days=90)
            db.commit()
            
            log = ActivityLog(
                event_type="deploy",
                message=f"SSL certificate (Simulated) issued for ingress domain: {rule.domain_name} via Let's Encrypt."
            )
            db.add(log)
            db.commit()
            return

        cmd = [
            certbot_bin, "certonly",
            "--standalone",
            "-d", rule.domain_name,
            "--non-interactive",
            "--agree-tos",
            "--register-unsafely-without-email"
        ]
        code, out, err = await run_command(cmd)
        if code == 0:
            rule.ssl_enabled = True
            rule.ssl_expiry = datetime.utcnow() + timedelta(days=90)
            db.commit()
            
            log = ActivityLog(
                event_type="deploy",
                message=f"SSL certificate issued successfully for ingress domain: {rule.domain_name} using Certbot Let's Encrypt."
            )
            db.add(log)
            db.commit()
        else:
            logger.error(f"Certbot failed for ingress {rule.domain_name}: {err}")
            log = ActivityLog(
                event_type="error",
                message=f"SSL certificate issuance failed for ingress domain: {rule.domain_name}. Error: {err}"
            )
            db.add(log)
            db.commit()
    except Exception as e:
        logger.error(f"Ingress SSL exception: {e}")
    finally:
        db.close()


@router.get("/rules", response_model=List[IngressRuleResponse])
def list_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(IngressRule).all()


@router.post("/rules", response_model=IngressRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    payload: IngressRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing_rule = db.query(IngressRule).filter(IngressRule.domain_name == payload.domain_name).first()
    if existing_rule:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Domain '{payload.domain_name}' is already mapped to another custom Ingress rule."
        )

    existing_domain = db.query(Domain).filter(Domain.domain_name == payload.domain_name).first()
    if existing_domain:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Domain '{payload.domain_name}' is already mapped to a cPanel project."
        )

    rule = IngressRule(
        domain_name=payload.domain_name,
        target_type=payload.target_type,
        target_value=payload.target_value,
        max_body_size=payload.max_body_size or "100M",
        cors_enabled=payload.cors_enabled or False,
        ssl_enabled=False
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    success = await apply_ingress_config(rule, db)
    if not success:
        logger.warning(f"Could not apply proxy configuration for ingress domain: {rule.domain_name}")

    log = ActivityLog(
        event_type="deploy",
        message=f"Added Ingress Rule mapping: {rule.domain_name} -> {rule.target_value} ({rule.target_type})"
    )
    db.add(log)
    db.commit()

    return rule


@router.put("/rules/{rule_id}", response_model=IngressRuleResponse)
async def update_rule(
    rule_id: str,
    payload: IngressRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    rule = db.query(IngressRule).filter(IngressRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingress Rule not found.")

    if payload.target_type is not None:
        rule.target_type = payload.target_type
    if payload.target_value is not None:
        rule.target_value = payload.target_value
    if payload.max_body_size is not None:
        rule.max_body_size = payload.max_body_size
    if payload.cors_enabled is not None:
        rule.cors_enabled = payload.cors_enabled
    if payload.ssl_enabled is not None:
        rule.ssl_enabled = payload.ssl_enabled

    db.commit()
    db.refresh(rule)

    success = await apply_ingress_config(rule, db)
    if not success:
        logger.warning(f"Failed to apply updated configuration for ingress domain: {rule.domain_name}")

    log = ActivityLog(
        event_type="deploy",
        message=f"Updated Ingress Rule config: {rule.domain_name}"
    )
    db.add(log)
    db.commit()

    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    rule = db.query(IngressRule).filter(IngressRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingress Rule not found.")

    await remove_ingress_config(rule.domain_name, db)

    db.delete(rule)
    db.commit()

    log = ActivityLog(
        event_type="deploy",
        message=f"Deleted Ingress Rule mapping: {rule.domain_name}"
    )
    db.add(log)
    db.commit()

    return None


@router.post("/rules/{rule_id}/ssl", response_model=IngressRuleResponse)
async def trigger_ingress_ssl(
    rule_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    rule = db.query(IngressRule).filter(IngressRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingress Rule not found.")

    background_tasks.add_task(issue_ingress_ssl_task, SessionLocal, rule.id)
    
    rule.ssl_enabled = True
    db.commit()
    db.refresh(rule)

    return rule
