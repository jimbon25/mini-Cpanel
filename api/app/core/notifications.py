import json
import logging
import urllib.request
from typing import Optional
from sqlalchemy.orm import Session
from app.models.base import NotificationChannel

logger = logging.getLogger("cpanel_lite.notifications")

def send_telegram_message(bot_token: str, chat_id: str, text: str):
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        return response.read()

def send_discord_message(webhook_url: str, text: str):
    payload = {
        "content": text
    }
    req = urllib.request.Request(
        webhook_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        return response.read()

def dispatch_notification(db: Session, message: str):
    """
    Finds all active notification channels and dispatches the alert message.
    """
    logger.info(f"Dispatching notification: {message}")
    
    channels = db.query(NotificationChannel).filter(NotificationChannel.is_active == True).all()
    
    for ch in channels:
        try:
            if ch.channel_type == "telegram" and ch.bot_token and ch.chat_id:
                logger.info(f"Sending Telegram alert to chat {ch.chat_id}")
                send_telegram_message(ch.bot_token, ch.chat_id, message)
            elif ch.channel_type == "discord" and ch.webhook_url:
                logger.info(f"Sending Discord alert to webhook")
                send_discord_message(ch.webhook_url, message)
        except Exception as e:
            logger.error(f"Failed to dispatch notification to channel {ch.id}: {e}")
