import os
from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Mini cPanel"
    API_V1_STR: str = "/api/v1"
    
    SECRET_KEY: str = os.getenv("CPANEL_SECRET_KEY", "super-secret-key-change-in-production-1234567890")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000"
    
    CPANEL_APPS_DIR: Path = Path(os.getenv("CPANEL_APPS_DIR", Path.home() / "apps"))
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("CPANEL_MAX_UPLOAD_SIZE_MB", "500"))
    
    @property
    def CPANEL_DATA_DIR(self) -> Path:
        new_dir = Path(os.getenv("MINICPANEL_DATA_DIR", os.getenv("CPANEL_DATA_DIR", Path.home() / ".minicpanel")))
        old_dir = Path.home() / ".cpanel_lite"
        
        if not new_dir.exists() and old_dir.exists():
            try:
                old_dir.rename(new_dir)
                old_db = new_dir / "cpanel_lite.db"
                new_db = new_dir / "minicpanel.db"
                if old_db.exists() and not new_db.exists():
                    old_db.rename(new_db)
            except Exception:
                return old_dir
        return new_dir
    
    @property
    def DATABASE_URL(self) -> str:
        self.CPANEL_DATA_DIR.mkdir(parents=True, exist_ok=True)
        db_path = self.CPANEL_DATA_DIR / "minicpanel.db"
        if not db_path.exists():
            old_db_path = self.CPANEL_DATA_DIR / "cpanel_lite.db"
            if old_db_path.exists():
                try:
                    old_db_path.rename(db_path)
                except Exception:
                    return f"sqlite:///{old_db_path}"
        return f"sqlite:///{db_path}"

    class Config:
        env_prefix = "CPANEL_"
        case_sensitive = True

settings = Settings()

