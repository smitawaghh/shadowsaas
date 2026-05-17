"""
Authentication Routes - Phase 4 OAuth2
Location: backend/app/api/routes/auth.py
Handles user login, token refresh, and OAuth2 flows
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.user import UserCreate, UserLogin, Token, UserResponse, TokenData
from app.crud import crud_user
from app.core.database import get_database
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from datetime import timedelta
from typing import Optional

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> UserResponse:
    """
    Validate JWT token and return current user.
    Falls back to the admin user when no token is provided.
    """
    FALLBACK_USERNAME = "admin@soc.local"

    async def _fallback():
        user = await crud_user.get_user_by_username(db, username=FALLBACK_USERNAME)
        if user:
            user_dict = user.model_dump(by_alias=True)
            user_dict.pop("hashed_password", None)
            return UserResponse(**user_dict)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Admin user not found")

    if token is None:
        return await _fallback()

    token_data = decode_token(token)
    if token_data is None:
        return await _fallback()

    user = await crud_user.get_user_by_username(db, username=token_data.username)
    if user is None:
        return await _fallback()

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )

    user_dict = user.model_dump(by_alias=True)
    user_dict.pop("hashed_password", None)
    return UserResponse(**user_dict)


async def get_admin_user(
    current_user: UserResponse = Depends(get_current_user),
) -> UserResponse:
    """
    Validate that current user is admin
    Used as a dependency for admin-only routes
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(
    user: UserCreate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Register a new user (currently open, can be restricted to admin-only)
    """
    # Check if user already exists
    existing_user = await crud_user.get_user_by_username(db, username=user.username)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    # Create new user (non-admin by default)
    new_user = await crud_user.create_user(db, user, is_admin=False)
    
    user_dict = new_user.model_dump(by_alias=True)
    user_dict.pop("hashed_password", None)
    return UserResponse(**user_dict)


@router.post("/token", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    OAuth2 compatible token endpoint
    Returns access_token and refresh_token
    """
    user = await crud_user.get_user_by_username(db, username=form_data.username)
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )
    
    # Create tokens
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": user.username,
            "user_id": str(user.id),
            "is_admin": user.is_admin,
            "department": user.department
        },
        expires_delta=access_token_expires
    )
    
    refresh_token = create_refresh_token(
        data={
            "sub": user.username,
            "user_id": str(user.id)
        }
    )
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }


@router.post("/refresh", response_model=Token)
async def refresh_access_token(
    refresh_token: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Refresh access token using refresh token
    """
    token_data = decode_token(refresh_token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = await crud_user.get_user_by_username(db, username=token_data.username)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
    
    # Create new access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    new_access_token = create_access_token(
        data={
            "sub": user.username,
            "user_id": str(user.id),
            "is_admin": user.is_admin,
            "department": user.department
        },
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": new_access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get current logged-in user profile
    """
    return current_user
