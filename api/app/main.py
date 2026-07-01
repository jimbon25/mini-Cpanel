import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base, SessionLocal
from app.models.base import User
from app.core.security import get_password_hash
from app.api.auth import router as auth_router
from app.api.system import router as system_router
from app.api.files import router as files_router
from app.api.projects import router as projects_router
from app.api.backups import router as backups_router
from app.api.notifications import router as notifications_router
from app.api.databases import router as databases_router
from app.api.marketplace import router as marketplace_router
from app.api.terminal import router as terminal_router
from app.api.users import router as users_router
from app.api.docker import router as docker_router
from app.core.scheduler import start_scheduler



logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cpanel_lite")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database tables...")
    Base.metadata.create_all(bind=engine)
    
    from sqlalchemy import text
    db_init = SessionLocal()
    try:
        cursor = db_init.execute(text("PRAGMA table_info(projects)"))
        columns = [row[1] for row in cursor.fetchall()]
        if "webhook_secret" not in columns:
            logger.info("Adding webhook_secret column to projects table...")
            db_init.execute(text("ALTER TABLE projects ADD COLUMN webhook_secret VARCHAR"))
            db_init.commit()
        if "ping_latency_ms" not in columns:
            db_init.execute(text("ALTER TABLE projects ADD COLUMN ping_latency_ms INTEGER"))
            db_init.commit()
        if "ping_error_detail" not in columns:
            db_init.execute(text("ALTER TABLE projects ADD COLUMN ping_error_detail VARCHAR"))
            db_init.commit()
    except Exception as e:
        logger.error(f"Error checking/migrating projects table columns: {e}")
    finally:
        db_init.close()
    
    db = SessionLocal()
    try:
        user_count = db.query(User).count()
        if user_count == 0:
            logger.warning("No users found in database. Seeding default admin user...")
            default_username = "admin"
            default_password = "cpaneladminpassword"
            
            hashed_password = get_password_hash(default_password)
            default_user = User(
                username=default_username,
                password_hash=hashed_password
            )
            db.add(default_user)
            db.commit()
            logger.info(f"Default admin user created successfully. Username: {default_username}")
    except Exception as e:
        logger.error(f"Error seeding database: {e}")
    finally:
        db.close()
        
    start_scheduler()
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=lifespan
)

origins = [origin.strip() for origin in settings.BACKEND_CORS_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# Include API Routers
app.include_router(auth_router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(system_router, prefix=f"{settings.API_V1_STR}/system", tags=["System Metrics"])
app.include_router(files_router, prefix=f"{settings.API_V1_STR}/files", tags=["File Manager"])
app.include_router(projects_router, prefix=f"{settings.API_V1_STR}/projects", tags=["Project Manager"])
app.include_router(backups_router, prefix=f"{settings.API_V1_STR}/backups", tags=["Backup Manager"])
app.include_router(notifications_router, prefix=f"{settings.API_V1_STR}/notifications", tags=["Notification Manager"])
app.include_router(databases_router, prefix=f"{settings.API_V1_STR}/databases", tags=["Database Administrator"])
app.include_router(marketplace_router, prefix=f"{settings.API_V1_STR}/marketplace", tags=["App Store Marketplace"])
app.include_router(terminal_router, prefix=f"{settings.API_V1_STR}/system/terminal", tags=["Terminal Console"])
app.include_router(users_router, prefix=f"{settings.API_V1_STR}/users", tags=["User Management"])
app.include_router(docker_router, prefix=f"{settings.API_V1_STR}/docker", tags=["Docker Administrator"])


@app.get("/health")
def health_check():
    return {"status": "ok", "project": settings.PROJECT_NAME}
