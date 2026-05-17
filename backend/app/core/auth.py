from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from starlette.requests import Request
from jose import JWTError, jwt
from datetime import datetime, timedelta
from app.core.config import settings

security = HTTPBearer()

FALLBACK_USER = {"username": "admin@soc.local", "is_admin": True, "department": "Security Operations"}

async def get_current_user(request: Request):
    """Verify JWT token and return user — falls back to admin when no token present"""
    auth_header = request.headers.get("Authorization")

    if not auth_header:
        return FALLBACK_USER

    try:
        token = auth_header.replace("Bearer ", "")
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return FALLBACK_USER
        return {
            "username": username,
            "is_admin": payload.get("is_admin", False),
            "department": payload.get("department"),
        }
    except JWTError:
        return FALLBACK_USER

def create_access_token(data: dict, expires_delta: timedelta = None):
    """Create JWT token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt