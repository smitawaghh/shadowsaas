"""
User Management Routes - Admin Only
Location: backend/app/api/routes/users.py
Admin endpoints for managing enterprise users
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.user import UserCreate, UserResponse
from app.crud import crud_user
from app.core.database import get_database
from app.api.routes.auth import get_admin_user

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/", response_model=List[UserResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    admin_only: bool = False,
    current_admin: UserResponse = Depends(get_admin_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Get list of users (admin only)
    
    Query Parameters:
    - skip: Pagination offset
    - limit: Max results (default 100)
    - admin_only: Filter only admin users
    """
    users = await crud_user.get_users(
        db,
        skip=skip,
        limit=limit,
        is_admin_only=admin_only
    )
    return users


@router.get("/count")
async def get_user_count(
    current_admin: UserResponse = Depends(get_admin_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get total user count (admin only)"""
    count = await crud_user.get_all_users_count(db)
    return {"total_users": count}


@router.post("/", response_model=UserResponse, status_code=201)
async def create_user(
    user: UserCreate,
    is_admin: bool = False,
    current_admin: UserResponse = Depends(get_admin_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Create a new user (admin only)
    
    Body Parameters:
    - username: Unique username
    - email: Valid email address
    - password: User password
    - department: User department (optional)
    - is_admin: Create as admin (default: False)
    """
    # Check if user already exists
    existing = await crud_user.get_user_by_username(db, username=user.username)
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Username already exists"
        )
    
    new_user = await crud_user.create_user(db, user, is_admin=is_admin)
    
    user_dict = new_user.model_dump(by_alias=True)
    user_dict.pop("hashed_password", None)
    return UserResponse(**user_dict)


@router.put("/{user_id}/admin")
async def toggle_admin_status(
    user_id: str,
    is_admin: bool,
    current_admin: UserResponse = Depends(get_admin_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Toggle user admin status (admin only)
    """
    success = await crud_user.update_user_admin_status(db, user_id, is_admin)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "message": f"User admin status updated to {is_admin}",
        "user_id": user_id
    }


@router.put("/{user_id}/deactivate")
async def deactivate_user(
    user_id: str,
    current_admin: UserResponse = Depends(get_admin_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Deactivate a user (admin only)
    """
    success = await crud_user.deactivate_user(db, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User deactivated", "user_id": user_id}


@router.put("/{user_id}/activate")
async def activate_user(
    user_id: str,
    current_admin: UserResponse = Depends(get_admin_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Activate a user (admin only)
    """
    success = await crud_user.activate_user(db, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User activated", "user_id": user_id}
