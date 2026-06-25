from pydantic import BaseModel
from typing import List, Dict, Optional

class AppEnvVar(BaseModel):
    name: str
    default_value: str
    description: str
    is_password: bool = False

class MarketplaceAppResponse(BaseModel):
    id: str
    name: str
    description: str
    image: str
    category: str
    icon: str
    default_port: int
    env_variables: List[AppEnvVar]

class MarketplaceInstallRequest(BaseModel):
    app_id: str
    custom_name: Optional[str] = None
    custom_port: Optional[int] = None
    env_overrides: Optional[Dict[str, str]] = None
