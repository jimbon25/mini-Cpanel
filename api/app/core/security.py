import time
import bcrypt
import threading
from datetime import datetime, timedelta
from typing import Optional, Dict, Tuple
from jose import jwt
from app.core.config import settings

_lockout_data: Dict[Tuple[str, str], Tuple[int, float]] = {}
_lockout_lock = threading.Lock()

def get_password_hash(password: str) -> str:
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

class BruteForceProtector:
    @staticmethod
    def get_lockout_info(username: str, ip: str) -> Tuple[int, float]:
        key = (username, ip)
        with _lockout_lock:
            if key not in _lockout_data:
                _lockout_data[key] = (0, 0.0)
            return _lockout_data[key]

    @staticmethod
    def check_lockout_and_delay(username: str, ip: str) -> Tuple[bool, int]:
        """
        Checks if the username/ip is currently locked out.
        Returns:
            (is_locked_out, remaining_seconds)
        """
        failures, lockout_until = BruteForceProtector.get_lockout_info(username, ip)
        now = time.time()
        
        if lockout_until > now:
            remaining = int(lockout_until - now)
            return True, max(1, remaining)
        
        if failures >= 2:
            delay = min(32, 2 ** (failures - 2))
            time.sleep(delay)
            
        return False, 0

    @staticmethod
    def record_failure(username: str, ip: str) -> Tuple[int, int]:
        """
        Records a login failure and calculates lockouts.
        Returns:
            (new_failure_count, lockout_duration_seconds)
        """
        key = (username, ip)
        with _lockout_lock:
            failures, _ = _lockout_data.get(key, (0, 0.0))
            new_failures = failures + 1
            
            lockout_sec = 0
            if new_failures == 3:
                lockout_sec = 15
            elif new_failures == 4:
                lockout_sec = 60
            elif new_failures == 5:
                lockout_sec = 300
            elif new_failures == 6:
                lockout_sec = 900
            elif new_failures >= 7:
                lockout_sec = 1800
                
            lockout_until = time.time() + lockout_sec if lockout_sec > 0 else 0.0
            _lockout_data[key] = (new_failures, lockout_until)
            return new_failures, lockout_sec

    @staticmethod
    def record_success(username: str, ip: str) -> None:
        """
        Resets failure count on successful authentication
        """
        key = (username, ip)
        with _lockout_lock:
            if key in _lockout_data:
                _lockout_data[key] = (0, 0.0)
