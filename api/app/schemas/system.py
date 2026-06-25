from pydantic import BaseModel, Field

class SystemSettingsResponse(BaseModel):
    proxy_type: str = Field(..., description="caddy, nginx, or disabled")
    proxy_log_path: str = Field(..., description="Absolute path to the access log file")

class SystemSettingsUpdate(BaseModel):
    proxy_type: str = Field(..., description="caddy, nginx, or disabled")
    proxy_log_path: str = Field("", description="Absolute path to the access log file")
