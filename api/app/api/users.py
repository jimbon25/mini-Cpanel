from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.base import User, ActivityLog
from app.api.dependencies import get_current_user, RoleChecker
from app.schemas.users import UserResponse, UserCreate, UserUpdate

router = APIRouter()
get_admin_user = RoleChecker(["super_admin"])

@router.get("", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    return db.query(User).all()

@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
        
    hashed_password = get_password_hash(payload.password)
    new_user = User(
        username=payload.username,
        password_hash=hashed_password,
        role=payload.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    log_entry = ActivityLog(
        event_type="auth",
        message=f"Administrator '{current_user.username}' created new user '{new_user.username}' with role '{new_user.role}'."
    )
    db.add(log_entry)
    db.commit()
    
    return new_user

@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        
    if user.id == current_user.id and payload.role and payload.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Self-demotion is restricted. You cannot change your own super_admin role."
        )
        
    if payload.role:
        user.role = payload.role
    if payload.password:
        user.password_hash = get_password_hash(payload.password)
        
    db.commit()
    db.refresh(user)
    
    log_entry = ActivityLog(
        event_type="auth",
        message=f"Administrator '{current_user.username}' updated credentials/role for user '{user.username}'."
    )
    db.add(log_entry)
    db.commit()
    
    return user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Self-deletion is restricted. You cannot delete the currently logged in administrator account."
        )
        
    db.delete(user)
    db.commit()
    
    log_entry = ActivityLog(
        event_type="auth",
        message=f"Administrator '{current_user.username}' deleted user account '{user.username}'."
    )
    db.add(log_entry)
    db.commit()
    
    return
