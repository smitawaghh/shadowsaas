from typing import List
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import get_database
from app.models.event import EventCreate, EventInDB
from app.crud import crud_event

router = APIRouter()

@router.post("/", response_model=EventInDB)
async def create_event(
    event: EventCreate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    return await crud_event.create_event(db=db, event=event)

@router.get("/", response_model=List[EventInDB])
async def read_events(
    skip: int = 0,
    limit: int = 100,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    return await crud_event.get_events(db=db, skip=skip, limit=limit)

@router.get("/app/{app_name}", response_model=List[EventInDB])
async def read_events_by_app(
    app_name: str,
    skip: int = 0,
    limit: int = 100,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    return await crud_event.get_events_by_app(db=db, app_name=app_name, skip=skip, limit=limit)
