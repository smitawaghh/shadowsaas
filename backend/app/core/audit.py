"""
Immutable admin audit trail.

Every mutating action taken by an authenticated user is recorded here.
Records are append-only — no update or delete is ever called on audit_logs.

Schema per record:
  timestamp       ISO-8601 UTC
  admin           username of the actor
  admin_ip        IP of the request
  action          verb (QUARANTINE_IP, ACKNOWLEDGE_ALERT, SANCTION_APP, ...)
  resource_type   what was acted on  (IP, EVENT, APP, POLICY, MODEL, ...)
  resource_id     the specific target (IP string, event _id, app name, ...)
  before          snapshot of state before change  (optional)
  after           snapshot of state after change   (optional)
  outcome         SUCCESS | FAILURE
  detail          free-text note or error message
"""

import logging
from datetime import datetime
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def write_audit(
    db: AsyncIOMotorDatabase,
    *,
    admin: str,
    admin_ip: str,
    action: str,
    resource_type: str,
    resource_id: str,
    before: Optional[Any] = None,
    after: Optional[Any] = None,
    outcome: str = "SUCCESS",
    detail: str = "",
) -> None:
    """
    Persist one immutable audit record.  Never raises — a logging failure
    must never abort the business operation that triggered it.
    """
    record = {
        "timestamp":     datetime.utcnow().isoformat(),
        "admin":         admin,
        "admin_ip":      admin_ip,
        "action":        action,
        "resource_type": resource_type,
        "resource_id":   str(resource_id),
        "before":        before,
        "after":         after,
        "outcome":       outcome,
        "detail":        detail,
    }
    try:
        await db.audit_logs.insert_one(record)
        logger.info(f"AUDIT  {action}  by={admin}  target={resource_type}:{resource_id}  {outcome}")
    except Exception as exc:
        # Never let audit failure surface to the caller
        logger.error(f"Audit write failed (non-fatal): {exc}")


def get_admin_ip(request) -> str:
    """Extract real client IP, handling reverse-proxy headers."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
