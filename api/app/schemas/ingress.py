from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class IngressRuleBase(BaseModel):
    domain_name: str = Field(..., description="The domain or subdomain name to proxy (e.g. app.dilua.site)")
    target_type: str = Field(..., description="Target type: port or url")
    target_value: str = Field(..., description="The internal port (e.g. 8080) or external URL (e.g. http://10.0.0.5:8000)")
    max_body_size: Optional[str] = Field("100M", description="Client max body size limit (e.g. 50M)")
    cors_enabled: Optional[bool] = Field(False, description="Whether to inject CORS headers")

class IngressRuleCreate(IngressRuleBase):
    pass

class IngressRuleUpdate(BaseModel):
    target_type: Optional[str] = None
    target_value: Optional[str] = None
    max_body_size: Optional[str] = None
    cors_enabled: Optional[bool] = None
    ssl_enabled: Optional[bool] = None

class IngressRuleResponse(IngressRuleBase):
    id: str
    ssl_enabled: bool
    ssl_expiry: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
