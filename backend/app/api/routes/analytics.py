import math
from datetime import datetime
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import get_database
from app.core.auth import get_current_user

router = APIRouter()

# Exponential decay constant (λ): half-life ≈ 7 days
DECAY_LAMBDA = 0.1


def _apply_decay(avg_risk: float, last_seen) -> float:
    """Apply time-based exponential decay to a risk score.

    Handles both Motor's native datetime objects and ISO-format strings,
    since timestamps are stored inconsistently across event batches.
    """
    try:
        if isinstance(last_seen, datetime):
            last_seen_dt = last_seen.replace(tzinfo=None)
        else:
            last_seen_dt = datetime.fromisoformat(str(last_seen)).replace(tzinfo=None)
        days_elapsed = (datetime.utcnow() - last_seen_dt).total_seconds() / 86400.0
        return round(max(0.0, avg_risk * math.exp(-DECAY_LAMBDA * days_elapsed)), 2)
    except Exception:
        return round(avg_risk, 2)


@router.get("/analytics/users")
async def get_user_analytics(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Aggregate network events by source IP to build behavioral user profiles.

    Returns per-IP stats including dynamic_risk_score (avg_risk with exponential
    time decay — a user who behaves normally for 7 days drops ~50% in score).
    """
    try:
        pipeline = [
            {
                "$group": {
                    "_id": "$source_ip",
                    "totalEvents": {"$sum": 1},
                    "anomalies": {"$sum": {"$cond": ["$is_anomalous", 1, 0]}},
                    "riskSum": {"$sum": "$risk_score"},
                    "uploadBytes": {"$sum": {"$ifNull": ["$bytes_sent", 0]}},
                    "apps": {"$addToSet": "$app_name"},
                    "lastSeen": {"$max": "$timestamp"},
                    "genaiEvents": {"$sum": {"$cond": [{"$eq": ["$is_genai_exfiltration", True]}, 1, 0]}},
                    # Pick the most-recently-seen device name and MAC (from sniffer ARP discovery)
                    "device_name": {"$last": "$device_name"},
                    "mac_address":  {"$last": "$mac_address"},
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "ip": {"$ifNull": ["$_id", "UNKNOWN"]},
                    "totalEvents": 1,
                    "anomalies": 1,
                    "genaiEvents": 1,
                    "uploadVol": {"$divide": ["$uploadBytes", 1048576]},
                    "appCount": {"$size": "$apps"},
                    "avgRisk": {
                        "$cond": [
                            {"$gt": ["$totalEvents", 0]},
                            {"$divide": ["$riskSum", "$totalEvents"]},
                            0,
                        ]
                    },
                    "lastSeen": 1,
                    "device_name": 1,
                    "mac_address": 1,
                }
            },
            {
                "$addFields": {
                    "riskLevel": {
                        "$switch": {
                            "branches": [
                                {"case": {"$gt": ["$avgRisk", 60]}, "then": "CRITICAL"},
                                {"case": {"$gt": ["$avgRisk", 30]}, "then": "ELEVATED"},
                            ],
                            "default": "NORMAL",
                        }
                    }
                }
            },
            {"$sort": {"avgRisk": -1}},
            {"$limit": 20},
        ]

        users = await db.events.aggregate(pipeline).to_list(None)

        # Apply exponential time decay in Python (can't do exp() in Mongo without $function)
        for user in users:
            user["dynamic_risk_score"] = _apply_decay(
                user.get("avgRisk", 0), user.get("lastSeen", datetime.utcnow().isoformat())
            )
            user["avgRisk"] = round(user.get("avgRisk", 0), 2)

        return {"users": users}

    except Exception as e:
        return {"users": [], "error": str(e)}


@router.get("/analytics/threats")
async def get_threat_intel(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """High-risk and GenAI exfiltration events for threat intelligence panel."""
    try:
        threats = (
            await db.events.find({"risk_score": {"$gte": 60}})
            .sort("timestamp", -1)
            .limit(25)
            .to_list(length=25)
        )

        return {
            "threats": [
                {
                    "app": t.get("app_name"),
                    "risk": round(t.get("risk_score", 0), 1),
                    "level": t.get("risk_level", "NORMAL"),
                    "ip": t.get("source_ip"),
                    "timestamp": t.get("timestamp"),
                    "bytes": t.get("bytes_sent", 0),
                    "is_anomalous": t.get("is_anomalous", False),
                    "is_genai": t.get("is_genai_exfiltration", False),
                    "reasons": t.get("risk_reasons", []),
                }
                for t in threats
            ]
        }
    except Exception as e:
        return {"threats": [], "error": str(e)}


@router.get("/analytics/shadow-apps")
async def get_shadow_apps(
    days: int = 7,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Returns apps first detected within the last N days that are unsanctioned or unknown.
    Used by the App Governance 'Shadow Discovery' panel.
    """
    from datetime import timedelta
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()

    # App profiles auto-created on ingest — filter to recently first-detected
    profiles = await db.app_profiles.find({
        "first_detected": {"$gte": cutoff},
        "$or": [
            {"is_sanctioned": False},
            {"is_sanctioned": None},
            {"category": "Unknown SaaS"},
        ],
    }).sort("first_detected", -1).limit(50).to_list(length=50)

    return {
        "shadow_apps": [
            {
                "name": p.get("name"),
                "category": p.get("category", "Unknown SaaS"),
                "first_detected": p.get("first_detected"),
                "last_detected": p.get("last_detected"),
                "is_sanctioned": p.get("is_sanctioned"),
                "peak_risk": p.get("peak_risk", 0),
                "event_count": p.get("event_count", 0),
            }
            for p in profiles
        ]
    }


@router.get("/analytics/genai")
async def get_genai_stats(
    hours: int = 24,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    GenAI-specific analytics: which models are being used, by whom, and how much data
    is being sent. Powers the GenAI Intelligence panel.
    """
    from datetime import timedelta
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    pipeline = [
        {
            "$match": {
                "timestamp": {"$gte": cutoff},
                "$or": [
                    {"app_name": {"$regex": "genai|chatgpt|claude|gemini|copilot|huggingface|perplexity|mistral|groq|midjourney", "$options": "i"}},
                    {"is_genai_exfiltration": True},
                ],
            }
        },
        {
            "$group": {
                "_id": "$app_name",
                "events": {"$sum": 1},
                "unique_users": {"$addToSet": "$source_ip"},
                "total_upload_bytes": {"$sum": "$bytes_sent"},
                "exfil_events": {"$sum": {"$cond": ["$is_genai_exfiltration", 1, 0]}},
                "avg_risk": {"$avg": "$risk_score"},
                "last_seen": {"$max": "$timestamp"},
            }
        },
        {
            "$project": {
                "_id": 0,
                "app": "$_id",
                "events": 1,
                "unique_users": {"$size": "$unique_users"},
                "upload_mb": {"$divide": ["$total_upload_bytes", 1048576]},
                "exfil_events": 1,
                "avg_risk": {"$round": ["$avg_risk", 1]},
                "last_seen": 1,
            }
        },
        {"$sort": {"events": -1}},
    ]

    stats = await db.events.aggregate(pipeline).to_list(None)
    return {"genai_apps": stats, "time_window_hours": hours}
