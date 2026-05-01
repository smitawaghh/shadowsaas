from typing import List
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.event import EventCreate, EventInDB

async def create_event(db: AsyncIOMotorDatabase, event: EventCreate) -> EventInDB:
    event_dict = event.model_dump()
    result = await db["events"].insert_one(event_dict)
    event_dict["_id"] = str(result.inserted_id)
    return EventInDB(**event_dict)

async def get_events(db: AsyncIOMotorDatabase, skip: int = 0, limit: int = 100) -> List[EventInDB]:
    cursor = db["events"].find().skip(skip).limit(limit).sort("timestamp", -1)
    events = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        events.append(EventInDB(**doc))
    return events

async def get_events_by_app(db: AsyncIOMotorDatabase, app_name: str, skip: int = 0, limit: int = 100) -> List[EventInDB]:
    cursor = db["events"].find({"app_name": app_name}).skip(skip).limit(limit).sort("timestamp", -1)
    events = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        events.append(EventInDB(**doc))
    return events
