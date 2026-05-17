"""
GET /audit-logs  — read-only audit trail for super-admins.
No data is ever modified here.  Supports pagination, date range, and
filtering by admin username or action type.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.auth import get_current_user
from app.core.database import get_database

router = APIRouter()


@router.get("/audit-logs")
async def get_audit_logs(
    limit:       int   = Query(50,  ge=1, le=500),
    offset:      int   = Query(0,   ge=0),
    admin:       str   = Query(None, description="Filter by admin username"),
    action:      str   = Query(None, description="Filter by action type"),
    outcome:     str   = Query(None, description="SUCCESS or FAILURE"),
    date_from:   str   = Query(None, description="ISO date lower bound"),
    date_to:     str   = Query(None, description="ISO date upper bound"),
    current_user: dict = Depends(get_current_user),
    db            = Depends(get_database),
):
    """
    Paginated, filtered view of the immutable admin audit trail.
    Admin-only endpoint — analysts cannot read this.
    """
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    query: dict = {}
    if admin:
        query["admin"] = {"$regex": admin, "$options": "i"}
    if action:
        query["action"] = {"$regex": action, "$options": "i"}
    if outcome:
        query["outcome"] = outcome.upper()
    if date_from or date_to:
        query["timestamp"] = {}
        if date_from:
            query["timestamp"]["$gte"] = date_from
        if date_to:
            query["timestamp"]["$lte"] = date_to

    total = await db.audit_logs.count_documents(query)
    records = (
        await db.audit_logs.find(query)
        .sort("timestamp", -1)
        .skip(offset)
        .limit(limit)
        .to_list(length=limit)
    )

    for r in records:
        r["_id"] = str(r["_id"])

    return {
        "total":   total,
        "limit":   limit,
        "offset":  offset,
        "records": records,
    }


@router.get("/audit-logs/summary")
async def audit_summary(
    current_user: dict = Depends(get_current_user),
    db            = Depends(get_database),
):
    """
    Aggregate counts by action type for the last 30 days.
    Used by the admin dashboard to spot unusual admin activity.
    """
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    from datetime import datetime, timedelta
    cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()

    pipeline = [
        {"$match": {"timestamp": {"$gte": cutoff}}},
        {"$group": {
            "_id":    "$action",
            "count":  {"$sum": 1},
            "admins": {"$addToSet": "$admin"},
            "last":   {"$max": "$timestamp"},
        }},
        {"$project": {
            "_id":         0,
            "action":      "$_id",
            "count":       1,
            "admin_count": {"$size": "$admins"},
            "last_seen":   "$last",
        }},
        {"$sort": {"count": -1}},
    ]

    rows = await db.audit_logs.aggregate(pipeline).to_list(None)

    # Also count failures in the period
    failures = await db.audit_logs.count_documents({
        "timestamp": {"$gte": cutoff},
        "outcome": "FAILURE",
    })

    return {"actions": rows, "failures_30d": failures, "window_days": 30}
