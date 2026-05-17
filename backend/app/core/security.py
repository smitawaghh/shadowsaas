"""
Security & OAuth2 utilities for ShadowSaaS
Location: backend/app/core/security.py
"""

from datetime import datetime, timedelta
from typing import Optional
from passlib.context import CryptContext
from jose import JWTError, jwt
from pydantic import ValidationError
from app.models.user import TokenData
from app.core.config import settings

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Configuration
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against hashed password"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a plain password"""
    return pwd_context.hash(password)


def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create JWT access token
    
    Args:
        data: Token claims (username, user_id, is_admin, etc.)
        expires_delta: Custom expiration time (default: 30 minutes)
    
    Returns:
        Encoded JWT token
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=ALGORITHM
    )
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """
    Create JWT refresh token (longer expiration)
    
    Args:
        data: Token claims
    
    Returns:
        Encoded JWT refresh token
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=ALGORITHM
    )
    return encoded_jwt


def decode_token(token: str) -> Optional[TokenData]:
    """
    Decode and validate JWT token
    
    Args:
        token: JWT token to decode
    
    Returns:
        TokenData with claims, or None if invalid
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[ALGORITHM]
        )
        username: str = payload.get("sub")
        if username is None:
            return None
        
        token_data = TokenData(
            username=username,
            user_id=payload.get("user_id"),
            is_admin=payload.get("is_admin", False),
            department=payload.get("department")
        )
        return token_data
    except (JWTError, ValidationError):
        return None


def verify_token_expiration(token: str) -> bool:
    """Check if token is expired"""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[ALGORITHM]
        )
        return True
    except jwt.ExpiredSignatureError:
        return False
    except JWTError:
        return False
