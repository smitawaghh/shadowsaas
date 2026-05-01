from typing import List
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import get_database
from app.models.app_profile import AppProfileCreate, AppProfileInDB
from app.crud import crud_app

router = APIRouter()

@router.post("/", response_model=AppProfileInDB)
async def create_app_profile(
    profile: AppProfileCreate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    # Check if exists
    existing = await crud_app.get_app_profile_by_name(db=db, app_name=profile.name)
    if existing:
        raise HTTPException(status_code=400, detail="App profile already exists")
    return await crud_app.create_app_profile(db=db, profile=profile)

@router.get("/", response_model=List[AppProfileInDB])
async def read_app_profiles(
    skip: int = 0,
    limit: int = 100,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    return await crud_app.get_app_profiles(db=db, skip=skip, limit=limit)

@router.get("/{app_name}", response_model=AppProfileInDB)
async def read_app_profile(
    app_name: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    profile = await crud_app.get_app_profile_by_name(db=db, app_name=app_name)
    if not profile:
        raise HTTPException(status_code=404, detail="App profile not found")
    return profile

@router.put("/{app_name}/sanction")
async def update_sanction_status(
    app_name: str,
    is_sanctioned: bool,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    updated = await crud_app.update_app_sanction_status(db=db, app_name=app_name, is_sanctioned=is_sanctioned)
    if not updated:
        raise HTTPException(status_code=404, detail="App profile not found")
    return {"message": f"Sanction status updated to {is_sanctioned}"}
