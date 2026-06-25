import secrets
import logging
from typing import List, Dict, Optional
from sqlalchemy.orm import Session

from app.models.base import Project, ActivityLog
from app.schemas.marketplace import MarketplaceAppResponse, AppEnvVar
from app.core.deployment import find_available_port

logger = logging.getLogger("cpanel_lite.marketplace")

MARKETPLACE_APPS = [
    MarketplaceAppResponse(
        id="redis",
        name="Redis Cache",
        description="High-performance in-memory key-value database, ideal for caching, session storage, and message queues.",
        image="redis:7.0-alpine",
        category="Database",
        icon="Database",
        default_port=6379,
        env_variables=[
            AppEnvVar(name="REDIS_PASSWORD", default_value="", description="Optional password for Redis authentication. If empty, password auth is disabled.", is_password=True)
        ]
    ),
    MarketplaceAppResponse(
        id="postgresql",
        name="PostgreSQL Server",
        description="Powerful, open-source object-relational database system known for reliability, feature robustness, and performance.",
        image="postgres:15-alpine",
        category="Database",
        icon="Database",
        default_port=5432,
        env_variables=[
            AppEnvVar(name="POSTGRES_USER", default_value="postgres", description="Default root database superuser username."),
            AppEnvVar(name="POSTGRES_PASSWORD", default_value="", description="Password for database superuser. Automatically generated if left blank.", is_password=True),
            AppEnvVar(name="POSTGRES_DB", default_value="postgres", description="Initial database created on startup.")
        ]
    ),
    MarketplaceAppResponse(
        id="mysql",
        name="MySQL Database",
        description="Most popular open-source relational database management system, widely used for CMS and web development.",
        image="mysql:8.0",
        category="Database",
        icon="Database",
        default_port=3306,
        env_variables=[
            AppEnvVar(name="MYSQL_ROOT_PASSWORD", default_value="", description="Password for the root user. Automatically generated if left blank.", is_password=True),
            AppEnvVar(name="MYSQL_DATABASE", default_value="app_db", description="Initial database created on startup."),
            AppEnvVar(name="MYSQL_USER", default_value="db_user", description="A secondary database user account."),
            AppEnvVar(name="MYSQL_PASSWORD", default_value="", description="Password for the secondary database user account.", is_password=True)
        ]
    ),
    MarketplaceAppResponse(
        id="pgadmin",
        name="pgAdmin 4",
        description="Web-based administration tool for PostgreSQL databases, providing an interactive database administrator workspace.",
        image="dpage/pgadmin4",
        category="Tool",
        icon="Database",
        default_port=80,
        env_variables=[
            AppEnvVar(name="PGADMIN_DEFAULT_EMAIL", default_value="admin@cpanel.local", description="Login email for the pgAdmin UI dashboard."),
            AppEnvVar(name="PGADMIN_DEFAULT_PASSWORD", default_value="", description="Login password for pgAdmin. Automatically generated if left blank.", is_password=True)
        ]
    ),
    MarketplaceAppResponse(
        id="vaultwarden",
        name="Vaultwarden (Bitwarden)",
        description="Alternative Bitwarden password manager server written in Rust. Extremely lightweight and compatible with official clients.",
        image="vaultwarden/server:latest",
        category="Security",
        icon="Lock",
        default_port=80,
        env_variables=[
            AppEnvVar(name="WEBSOCKET_ENABLED", default_value="true", description="Enable support for push notification sync over WebSockets."),
            AppEnvVar(name="SIGNUPS_ALLOWED", default_value="true", description="Set to false to block new user registrations after setup.")
        ]
    ),
    MarketplaceAppResponse(
        id="n8n",
        name="n8n Automation",
        description="Fair-code licensed workflow automation tool. Drag-and-drop node canvas to connect APIs and automate operations.",
        image="n8nio/n8n:latest",
        category="Automation",
        icon="Cpu",
        default_port=5678,
        env_variables=[
            AppEnvVar(name="N8N_BASIC_AUTH_ACTIVE", default_value="true", description="Enable basic authentication to secure the n8n canvas."),
            AppEnvVar(name="N8N_BASIC_AUTH_USER", default_value="admin", description="Admin username for basic authentication."),
            AppEnvVar(name="N8N_BASIC_AUTH_PASSWORD", default_value="", description="Admin login password. Automatically generated if left blank.", is_password=True)
        ]
    ),
    MarketplaceAppResponse(
        id="portainer",
        name="Portainer CE",
        description="Intuitive, lightweight management container GUI which allows you to monitor and orchestrate your local Docker systems.",
        image="portainer/portainer-ce:latest",
        category="Tool",
        icon="Cpu",
        default_port=9000,
        env_variables=[]
    ),
    MarketplaceAppResponse(
        id="caddy",
        name="Caddy Web Server",
        description="Modern, enterprise-ready web server and reverse proxy written in Go with automatic SSL certificate generation.",
        image="caddy:latest",
        category="Web Server",
        icon="Globe",
        default_port=80,
        env_variables=[]
    )
]

VOLUME_MAPPINGS = {
    "redis": "/data",
    "postgresql": "/var/lib/postgresql/data",
    "mysql": "/var/lib/mysql",
    "pgadmin": "/var/lib/pgadmin",
    "vaultwarden": "/data",
    "n8n": "/home/node/.n8n",
    "portainer": "/data",
    "caddy": "/data,/config"
}

def generate_random_password(length: int = 16) -> str:
    """
    Generates a secure alphanumeric random password.
    """
    chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return "".join(secrets.choice(chars) for _ in range(length))

def get_app_template(app_id: str) -> Optional[MarketplaceAppResponse]:
    """
    Retrieves the app template details by ID.
    """
    for app in MARKETPLACE_APPS:
        if app.id == app_id:
            return app
    return None

def configure_and_save_app(
    db: Session,
    app_id: str,
    custom_name: Optional[str] = None,
    custom_port: Optional[int] = None,
    env_overrides: Optional[Dict[str, str]] = None
) -> Project:
    """
    Validates connection parameters, generates root credentials, allocates host ports,
    and registers the Marketplace item in the Projects relational table.
    """
    template = get_app_template(app_id)
    if not template:
        raise ValueError(f"App template '{app_id}' not found in marketplace catalog.")
    
    app_name = custom_name.strip() if custom_name and custom_name.strip() else template.id
    app_name = "".join(c for c in app_name if c.isalnum() or c in "-_").lower()
    
    existing = db.query(Project).filter(Project.name == app_name).first()
    if existing:
        suffix = secrets.token_hex(3)
        app_name = f"{app_name}-{suffix}"

    allocated_port = custom_port if custom_port else template.default_port
    if not custom_port:
        allocated_port = find_available_port(start_port=allocated_port)
    else:
        from app.core.deployment import is_port_available
        if not is_port_available(allocated_port):
            allocated_port = find_available_port(start_port=allocated_port)
            
    env_dict = {}
    overrides = env_overrides or {}
    
    env_dict["DOCKER_IMAGE"] = template.image
    env_dict["DOCKER_CONTAINER_PORT"] = str(template.default_port)
    if template.id in VOLUME_MAPPINGS:
        env_dict["DOCKER_VOLUME_MAPPINGS"] = VOLUME_MAPPINGS[template.id]
        
    for var in template.env_variables:
        val = overrides.get(var.name)
        if val is None or val.strip() == "":
            if var.is_password:
                val = generate_random_password()
            else:
                val = var.default_value
        env_dict[var.name] = val.strip()

    for k, v in overrides.items():
        if k not in env_dict:
            env_dict[k] = v.strip()
            
    import json
    env_str = json.dumps(env_dict)

    project = Project(
        name=app_name,
        provider="docker",
        git_repo=None,
        branch=None,
        port=allocated_port,
        status="deploying",
        env_vars=env_str
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    
    from app.core.deployment import log_activity
    log_entry = ActivityLog(
        project_id=project.id,
        event_type="deploy",
        message=f"Created marketplace project template for {template.name} ({app_name}) on port {allocated_port}."
    )
    db.add(log_entry)
    db.commit()

    return project
