from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session
import asyncio
import logging
from app.api.dependencies import get_current_user, RoleChecker
from app.core.database import get_db
from app.core.system import get_system_metrics
from app.core.proxy_monitor import get_ingress_traffic_stats
from app.models.base import User, SystemSetting, ActivityLog
from app.schemas.system import SystemSettingsResponse, SystemSettingsUpdate
from app.core.config import settings

logger = logging.getLogger("cpanel_lite.system")
router = APIRouter()

@router.get("/metrics")
def read_system_metrics(current_user: User = Depends(get_current_user)):
    """
    Retrieve real-time server health and hardware metrics.
    Requires bearer token authentication.
    """
    return get_system_metrics()

@router.get("/traffic")
def read_ingress_traffic(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve real-time ingress reverse proxy traffic stats and metrics.
    Requires bearer token authentication.
    """
    return get_ingress_traffic_stats(db)

@router.get("/settings", response_model=SystemSettingsResponse)
def read_system_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proxy_type_setting = db.query(SystemSetting).filter(SystemSetting.key == "proxy_type").first()
    proxy_log_path_setting = db.query(SystemSetting).filter(SystemSetting.key == "proxy_log_path").first()
    
    proxy_type = proxy_type_setting.value if proxy_type_setting else "disabled"
    proxy_log_path = proxy_log_path_setting.value if proxy_log_path_setting else ""
    
    return {
        "proxy_type": proxy_type,
        "proxy_log_path": proxy_log_path
    }

@router.post("/settings", response_model=SystemSettingsResponse)
def update_system_settings(
    payload: SystemSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker(["super_admin"]))
):
    proxy_type_setting = db.query(SystemSetting).filter(SystemSetting.key == "proxy_type").first()
    if not proxy_type_setting:
        proxy_type_setting = SystemSetting(key="proxy_type")
        db.add(proxy_type_setting)
    proxy_type_setting.value = payload.proxy_type
    
    proxy_log_path_setting = db.query(SystemSetting).filter(SystemSetting.key == "proxy_log_path").first()
    if not proxy_log_path_setting:
        proxy_log_path_setting = SystemSetting(key="proxy_log_path")
        db.add(proxy_log_path_setting)
    proxy_log_path_setting.value = payload.proxy_log_path
    
    db.commit()
    
    return {
        "proxy_type": proxy_type_setting.value,
        "proxy_log_path": proxy_log_path_setting.value
    }

@router.get("/activity-logs")
def get_activity_logs(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve the latest activity logs from the database.
    """
    logs = db.query(ActivityLog).order_by(ActivityLog.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": log.id,
            "project_id": log.project_id,
            "event_type": log.event_type,
            "message": log.message,
            "timestamp": (log.timestamp.isoformat() + "Z") if log.timestamp else None
        }
        for log in logs
    ]


@router.websocket("/traffic/ws")
async def traffic_ws(
    websocket: WebSocket,
    token: str,
    db: Session = Depends(get_db)
):
    await websocket.accept()
    try:
        from jose import jwt
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        user = db.query(User).filter(User.username == username).first()
        if not user:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        while True:
            stats = get_ingress_traffic_stats(db)
            await websocket.send_json(stats)
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Error in traffic WebSocket: {e}", exc_info=True)
        try:
            await websocket.close()
        except Exception:
            pass
