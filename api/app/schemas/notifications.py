from pydantic import BaseModel
from typing import Optional

class NotificationChannelBase(BaseModel):
    channel_type: str
    webhook_url: Optional[str] = None
    bot_token: Optional[str] = None
    chat_id: Optional[str] = None
    is_active: Optional[bool] = True
    alert_rules: Optional[str] = None

class NotificationChannelCreate(NotificationChannelBase):
    pass

class NotificationChannelResponse(NotificationChannelBase):
    id: str

    class Config:
        from_attributes = True
