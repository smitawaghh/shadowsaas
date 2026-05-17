"""
CRUD operations for Events - Updated for Phase 3
Location: backend/app/crud/crud_event.py
This extends your existing CRUD operations with ML feature support
"""

from bson.objectid import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.event import EventCreate, EventInDB


async def create_event(db: AsyncIOMotorDatabase, event: EventCreate) -> EventInDB:
    """
    Create new event with ML features
    
    Args:
        db: MongoDB database connection
        event: EventCreate schema with ML features
    
    Returns:
        EventInDB with stored ID and timestamp
    """
    event_dict = event.model_dump(exclude_unset=True)
    
    # Add timestamp if not provided
    from datetime import datetime
    if "timestamp" not in event_dict:
        event_dict["timestamp"] = datetime.utcnow()
    
    result = await db.events.insert_one(event_dict)
    
    stored_event = await db.events.find_one({"_id": result.inserted_id})
    stored_event["_id"] = str(stored_event["_id"])
    return EventInDB(**stored_event)


async def get_events(
    db: AsyncIOMotorDatabase,
    skip: int = 0,
    limit: int = 100,
    anomalous: bool = None
) -> list:
    """
    Get events with optional filtering by anomaly status
    
    Args:
        db: MongoDB database connection
        skip: Number of records to skip (pagination)
        limit: Max records to return
        anomalous: Filter by is_anomalous (True/False/None=all)
    
    Returns:
        List of events matching criteria
    """
    query = {}
    
    # Filter by anomaly status if specified
    if anomalous is not None:
        query["is_anomalous"] = anomalous
    
    events = await db.events.find(query).skip(skip).limit(limit).to_list(limit)
    
    return [EventInDB(**{**event, "_id": str(event["_id"])}) for event in events]


async def get_events_by_app(
    db: AsyncIOMotorDatabase,
    app_name: str,
    skip: int = 0,
    limit: int = 100
) -> list:
    """
    Get events filtered by application name
    
    Args:
        db: MongoDB database connection
        app_name: Application name to filter
        skip: Pagination offset
        limit: Max results
    
    Returns:
        List of events for the specified app
    """
    query = {"app_name": app_name}
    events = await db.events.find(query).skip(skip).limit(limit).to_list(limit)
    
    return [EventInDB(**{**event, "_id": str(event["_id"])}) for event in events]


async def get_events_by_ip(
    db: AsyncIOMotorDatabase,
    destination_ip: str,
    skip: int = 0,
    limit: int = 100
) -> list:
    """
    Get events filtered by destination IP
    
    Args:
        db: MongoDB database
        destination_ip: IP to search for
        skip: Pagination
        limit: Max results
    
    Returns:
        List of events to that IP
    """
    query = {"destination_ip": destination_ip}
    events = await db.events.find(query).skip(skip).limit(limit).to_list(limit)
    
    return [EventInDB(**{**event, "_id": str(event["_id"])}) for event in events]


async def get_high_risk_events(
    db: AsyncIOMotorDatabase,
    threshold: float = 60.0,
    limit: int = 100
) -> list:
    """
    Get events with risk_score above threshold
    ⭐ NEW: For Phase 3 anomaly filtering
    
    Args:
        db: MongoDB database
        threshold: Risk score threshold (default 60)
        limit: Max results
    
    Returns:
        High-risk events sorted by risk_score descending
    """
    query = {"risk_score": {"$gte": threshold}}
    events = await db.events.find(query).sort("risk_score", -1).limit(limit).to_list(limit)
    
    return [EventInDB(**{**event, "_id": str(event["_id"])}) for event in events]


async def get_anomaly_stats(db: AsyncIOMotorDatabase) -> dict:
    """
    Get anomaly detection statistics
    ⭐ NEW: For Phase 3 analytics
    
    Returns:
        Dict with counts and averages
    """
    total = await db.events.count_documents({})
    anomalies = await db.events.count_documents({"is_anomalous": True})
    
    # Get average risk score
    pipeline = [
        {"$group": {
            "_id": None,
            "avg_risk": {"$avg": "$risk_score"},
            "max_ratio": {"$max": "$upload_download_ratio"},
            "avg_ratio": {"$avg": "$upload_download_ratio"}
        }}
    ]
    
    stats = await db.events.aggregate(pipeline).to_list(1)
    
    return {
        "total_events": total,
        "anomalous_events": anomalies,
        "anomaly_rate": round(100.0 * anomalies / max(1, total), 2),
        "avg_risk_score": round(stats[0].get("avg_risk", 0), 2) if stats else 0,
        "max_upload_ratio": round(stats[0].get("max_ratio", 0), 2) if stats else 0,
        "avg_upload_ratio": round(stats[0].get("avg_ratio", 0), 2) if stats else 0
    }


async def delete_old_events(
    db: AsyncIOMotorDatabase,
    days: int = 30
) -> int:
    """
    Delete events older than specified days
    
    Args:
        db: MongoDB database
        days: Delete events older than this many days
    
    Returns:
        Number of deleted documents
    """
    from datetime import datetime, timedelta
    
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    query = {"timestamp": {"$lt": cutoff_date}}
    
    result = await db.events.delete_many(query)
    
    return result.deleted_count