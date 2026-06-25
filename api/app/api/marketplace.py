from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db, SessionLocal
from app.api.dependencies import get_current_user, RoleChecker
from app.models.base import User
from app.schemas.marketplace import MarketplaceAppResponse, MarketplaceInstallRequest
from app.schemas.projects import ProjectResponse
from app.core.marketplace import MARKETPLACE_APPS, configure_and_save_app
from app.core.deployment import deploy_project_task

router = APIRouter(dependencies=[Depends(RoleChecker(["super_admin", "developer"]))])

@router.get("", response_model=List[MarketplaceAppResponse])
def get_marketplace_catalog(
    current_user: User = Depends(get_current_user)
):
    """
    List all available templates in the App Store marketplace catalog.
    """
    return MARKETPLACE_APPS

@router.post("/install", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def install_app(
    request: MarketplaceInstallRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Triggers one-click installation of a marketplace container template,
    allocates host resources, and starts the container deployment task in the background.
    """
    try:
        project = configure_and_save_app(
            db=db,
            app_id=request.app_id,
            custom_name=request.custom_name,
            custom_port=request.custom_port,
            env_overrides=request.env_overrides
        )
        
        background_tasks.add_task(
            deploy_project_task,
            project.id,
            SessionLocal
        )
        
        return project
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"App installation trigger failed: {str(e)}"
        )
