from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import BruteForceProtector, verify_password, create_access_token
from app.models.base import User
from app.schemas.auth import LoginRequest, Token

router = APIRouter()

@router.post("/login", response_model=Token)
def login(
    request: Request,
    payload: LoginRequest,
    db: Session = Depends(get_db)
):
    ip = request.client.host if request.client else "unknown"
    username = payload.username
    
    is_locked, remaining_sec = BruteForceProtector.check_lockout_and_delay(username, ip)
    if is_locked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many attempts. Locked out for {remaining_sec}s"
        )
    
    user = db.query(User).filter(User.username == username).first()
    
    if not user or not verify_password(payload.password, user.password_hash):
        new_fails, lockout_sec = BruteForceProtector.record_failure(username, ip)
        
        if lockout_sec > 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many attempts. Locked out for {lockout_sec}s"
            )
            
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
        
    BruteForceProtector.record_success(username, ip)
    
    access_token = create_access_token(data={"sub": user.username, "role": user.role})
    return {"access_token": access_token, "token_type": "bearer"}
