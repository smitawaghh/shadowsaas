# backend/app/core/database.py
import logging
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from contextlib import asynccontextmanager

from app.core.config import settings

logger = logging.getLogger(__name__)

# Global database instance
_db: Optional[AsyncIOMotorDatabase] = None
_client: Optional[AsyncIOMotorClient] = None

async def connect_to_mongo():
    """Connect to MongoDB"""
    global _db, _client
    
    try:
        _client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            maxPoolSize=50,
            minPoolSize=10,
            serverSelectionTimeoutMS=5000,
        )
        
        # Test connection
        await _client.admin.command('ping')
        
        _db = _client[settings.DATABASE_NAME]
        logger.info(f"✓ Connected to MongoDB: {settings.DATABASE_NAME}")
        
    except Exception as e:
        logger.error(f"❌ Failed to connect to MongoDB: {e}")
        raise

async def close_mongo_connection():
    """Close MongoDB connection"""
    global _db, _client
    
    if _client:
        _client.close()
        logger.info("✓ MongoDB connection closed")
    
    _db = None
    _client = None

def get_database() -> AsyncIOMotorDatabase:
    """Get database instance"""
    if _db is None:
        raise RuntimeError("Database not initialized. Call connect_to_mongo() first.")
    return _db

async def create_indices():
    """
    Create all indexes for query performance and TTL-based data retention.
    Safe to call repeatedly — MongoDB ignores duplicate index creation.
    """
    from app.core.config import settings
    db = get_database()

    try:
        # ── Events (heaviest read path) ────────────────────────────────────
        await db.events.create_index([("timestamp", -1)])
        await db.events.create_index([("source_ip", 1), ("timestamp", -1)])
        await db.events.create_index([("app_name", 1), ("risk_score", -1)])
        await db.events.create_index([("is_anomalous", 1), ("timestamp", -1)])
        await db.events.create_index([("risk_score", -1)])
        await db.events.create_index([("acknowledged", 1), ("risk_score", -1)])
        # Compound for dashboard stats query
        await db.events.create_index([
            ("timestamp", -1), ("risk_score", 1),
            ("is_anomalous", 1), ("source_ip", 1),
        ])
        # TTL — auto-delete events older than EVENT_RETENTION_DAYS
        await db.events.create_index(
            [("timestamp", 1)],
            expireAfterSeconds=settings.EVENT_RETENTION_DAYS * 86400,
            name="events_ttl",
        )

        # ── Users ──────────────────────────────────────────────────────────
        await db.users.create_index([("username", 1)], unique=True, sparse=True)

        # ── Audit logs (append-only, time-series) ─────────────────────────
        await db.audit_logs.create_index([("timestamp", -1)])
        await db.audit_logs.create_index([("admin", 1), ("timestamp", -1)])
        await db.audit_logs.create_index([("action", 1), ("outcome", 1)])

        # ── Policies ──────────────────────────────────────────────────────
        await db.policies.create_index([("is_active", 1)])

        # ── App profiles ──────────────────────────────────────────────────
        await db.app_profiles.create_index([("name", 1)], unique=True)
        await db.app_profiles.create_index([("is_sanctioned", 1), ("peak_risk", -1)])

        # ── UEBA device baselines ─────────────────────────────────────────
        await db.device_baselines.create_index([("source_ip", 1)], unique=True)
        await db.device_baselines.create_index([("computed_at", -1)])

        # ── Quarantined IPs ───────────────────────────────────────────────
        await db.quarantined_ips.create_index([("ip", 1)], unique=True)

        # ── User profiles (behavioral) ────────────────────────────────────
        await db.user_profiles.create_index([("source_ip", 1)], unique=True)

        logger.info(
            f"MongoDB indexes ready  (TTL retention = {settings.EVENT_RETENTION_DAYS} days)"
        )
    except Exception as exc:
        logger.error(f"Index creation error (non-fatal): {exc}")

async def drop_database():
    """Drop entire database (use with caution!)"""
    try:
        await _client.drop_database(settings.DATABASE_NAME)
        logger.warning("Database dropped")
    except Exception as exc:
        logger.error(f"Error dropping database: {exc}")

@asynccontextmanager
async def get_session():
    """Context manager for database sessions"""
    db = get_database()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database session error: {e}")
        raise
    finally:
        pass  # Motor handles cleanup automatically

