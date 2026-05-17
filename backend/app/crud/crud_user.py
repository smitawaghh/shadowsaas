"""
CRUD operations for Users - Phase 4
Location: backend/app/crud/crud_user.py
Handles user management with JWT authentication
"""

from typing import Optional, List
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.user import UserCreate, UserInDB, UserResponse
from app.core.security import get_password_hash
from bson.objectid import ObjectId


async def create_user(
    db: AsyncIOMotorDatabase,
    user: UserCreate,
    is_admin: bool = False
) -> UserInDB:
    """
    Create a new user
    
    Args:
        db: MongoDB database connection
        user: User data
        is_admin: Whether to create as admin
    
    Returns:
        Created user
    """
    user_dict = user.model_dump(exclude={"password"})
    user_dict["hashed_password"] = get_password_hash(user.password)
    user_dict["is_admin"] = is_admin
    user_dict["is_active"] = True
    
    result = await db.users.insert_one(user_dict)
    stored_user = await db.users.find_one({"_id": result.inserted_id})
    stored_user["_id"] = str(stored_user["_id"])
    return UserInDB(**stored_user)


async def get_user_by_username(
    db: AsyncIOMotorDatabase,
    username: str
) -> Optional[UserInDB]:
    """Get user by username"""
    user = await db.users.find_one({"username": username})
    if user:
        user["_id"] = str(user["_id"])
        return UserInDB(**user)
    return None


async def get_user_by_id(
    db: AsyncIOMotorDatabase,
    user_id: str
) -> Optional[UserInDB]:
    """Get user by ID"""
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if user:
            user["_id"] = str(user["_id"])
            return UserInDB(**user)
    except:
        pass
    return None


async def get_users(
    db: AsyncIOMotorDatabase,
    skip: int = 0,
    limit: int = 100,
    is_admin_only: bool = False
) -> List[UserResponse]:
    """
    Get list of users (admin view only)
    
    Args:
        db: MongoDB database
        skip: Pagination offset
        limit: Max results
        is_admin_only: Filter by admin status
    
    Returns:
        List of user profiles
    """
    query = {}
    if is_admin_only:
        query = {"is_admin": True}
    
    cursor = db.users.find(query).skip(skip).limit(limit)
    users = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        # Remove password from response
        doc.pop("hashed_password", None)
        users.append(UserResponse(**doc))
    return users


async def get_all_users_count(db: AsyncIOMotorDatabase) -> int:
    """Get total user count"""
    return await db.users.count_documents({})


async def update_user_admin_status(
    db: AsyncIOMotorDatabase,
    user_id: str,
    is_admin: bool
) -> bool:
    """Update user admin status (admin-only action)"""
    try:
        result = await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"is_admin": is_admin}}
        )
        return result.modified_count > 0
    except:
        return False


async def deactivate_user(
    db: AsyncIOMotorDatabase,
    user_id: str
) -> bool:
    """Deactivate a user (admin-only action)"""
    try:
        result = await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"is_active": False}}
        )
        return result.modified_count > 0
    except:
        return False


async def activate_user(
    db: AsyncIOMotorDatabase,
    user_id: str
) -> bool:
    """Activate a user (admin-only action)"""
    try:
        result = await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"is_active": True}}
        )
        return result.modified_count > 0
    except:
        return False


async def user_exists(db: AsyncIOMotorDatabase, username: str) -> bool:
    """Check if user exists"""
    user = await db.users.find_one({"username": username})
    return user is not None
