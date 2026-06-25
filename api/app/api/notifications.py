from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.dependencies import get_current_user, RoleChecker
from app.models.base import NotificationChannel, User
from app.schemas.notifications import NotificationChannelCreate, NotificationChannelResponse

router = APIRouter(dependencies=[Depends(RoleChecker(["super_admin"]))])

@router.get("", response_model=List[NotificationChannelResponse])
def list_notification_channels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List all configured notification channels.
    """
    return db.query(NotificationChannel).all()

@router.post("", response_model=NotificationChannelResponse)
def save_notification_channel(
    payload: NotificationChannelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create or update settings for a notification channel.
    """
    ch = db.query(NotificationChannel).filter(
        NotificationChannel.channel_type == payload.channel_type
    ).first()
    
    if not ch:
        ch = NotificationChannel(channel_type=payload.channel_type)
        db.add(ch)
        
    ch.webhook_url = payload.webhook_url
    ch.bot_token = payload.bot_token
    ch.chat_id = payload.chat_id
    ch.is_active = payload.is_active
    ch.alert_rules = payload.alert_rules
    
    db.commit()
    db.refresh(ch)
    return ch

@router.post("/test/{channel_type}")
def test_notification_channel(
    channel_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Sends a verification test alert to the configured channel type.
    """
    ch = db.query(NotificationChannel).filter(
        NotificationChannel.channel_type == channel_type
    ).first()
    
    if not ch:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Notification channel '{channel_type}' is not configured"
        )
        
    test_msg = "🔔 [cPanel-Lite Alert] Test message: Notification channel successfully verified!"
    
    try:
        if ch.channel_type == "telegram" and ch.bot_token and ch.chat_id:
            from app.core.notifications import send_telegram_message
            send_telegram_message(ch.bot_token, ch.chat_id, test_msg)
        elif ch.channel_type == "discord" and ch.webhook_url:
            from app.core.notifications import send_discord_message
            send_discord_message(ch.webhook_url, test_msg)
        else:
            raise ValueError("Incomplete credentials configuration parameters")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Notification dispatch failed: {str(e)}"
        )
        
    return {"status": "success", "message": f"Test alert successfully sent to {channel_type}."}
