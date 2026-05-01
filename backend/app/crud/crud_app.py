from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.app_profile import AppProfileCreate, AppProfileInDB

async def create_app_profile(db: AsyncIOMotorDatabase, profile: AppProfileCreate) -> AppProfileInDB:
    profile_dict = profile.model_dump()
    result = await db["apps"].insert_one(profile_dict)
    profile_dict["_id"] = str(result.inserted_id)
    return AppProfileInDB(**profile_dict)

async def get_app_profiles(db: AsyncIOMotorDatabase, skip: int = 0, limit: int = 100) -> List[AppProfileInDB]:
    cursor = db["apps"].find().skip(skip).limit(limit)
    profiles = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        profiles.append(AppProfileInDB(**doc))
    return profiles

async def get_app_profile_by_name(db: AsyncIOMotorDatabase, app_name: str) -> Optional[AppProfileInDB]:
    doc = await db["apps"].find_one({"name": app_name})
    if doc:
        doc["_id"] = str(doc["_id"])
        return AppProfileInDB(**doc)
    return None

async def update_app_sanction_status(db: AsyncIOMotorDatabase, app_name: str, is_sanctioned: bool) -> bool:
    result = await db["apps"].update_one(
        {"name": app_name},
        {"$set": {"is_sanctioned": is_sanctioned}}
    )
    return result.modified_count > 0
