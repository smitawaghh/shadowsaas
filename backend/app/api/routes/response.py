import sys
import subprocess
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import get_database
from app.core.auth import get_current_user
from app.core.audit import write_audit, get_admin_ip
from datetime import datetime
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger(__name__)

RULE_PREFIX = "ShadowSaaS-Block-"


def _netsh_block(ip: str) -> tuple[str, str]:
    if sys.platform != "win32":
        return "LOGGED_ONLY", "Non-Windows — firewall enforcement skipped"
    try:
        r = subprocess.run(
            ["netsh", "advfirewall", "firewall", "add", "rule",
             f"name={RULE_PREFIX}{ip}", "dir=out", "action=block",
             f"remoteip={ip}", "enable=yes", "profile=any"],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode == 0:
            logger.warning(f"FIREWALL BLOCK applied: {ip}")
            return "BLOCKED_AT_FIREWALL", "Windows Firewall outbound block rule created"
        err = (r.stderr or r.stdout).strip()
        if "5" in err or "Access" in err:
            return "FIREWALL_ERROR", "Access denied — restart backend as Administrator"
        return "FIREWALL_ERROR", err or "netsh failed"
    except FileNotFoundError:
        return "FIREWALL_ERROR", "netsh not found"
    except subprocess.TimeoutExpired:
        return "FIREWALL_ERROR", "netsh timed out"
    except Exception as exc:
        return "FIREWALL_ERROR", str(exc)


def _netsh_unblock(ip: str) -> tuple[str, str]:
    if sys.platform != "win32":
        return "REMOVED", "Non-Windows — nothing to remove"
    try:
        r = subprocess.run(
            ["netsh", "advfirewall", "firewall", "delete", "rule",
             f"name={RULE_PREFIX}{ip}"],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode == 0:
            return "REMOVED", "Windows Firewall rule deleted"
        return "REMOVE_ERROR", (r.stderr or r.stdout).strip()
    except Exception as exc:
        return "REMOVE_ERROR", str(exc)


class PlaybookCreate(BaseModel):
    name: str
    condition_metric: str
    condition_operator: str
    condition_value: float
    action: str


@router.post("/quarantine/{ip}")
async def quarantine_ip(
    ip: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict       = Depends(get_current_user),
):
    existing = await db.quarantined_ips.find_one({"ip": ip})
    if existing:
        return {"status": "already_quarantined", "ip": ip}

    fw_status, fw_message = _netsh_block(ip)

    record = {
        "ip":         ip,
        "timestamp":  datetime.utcnow().isoformat(),
        "reason":     "Manual SOC Analyst Intervention",
        "quarantined_by": current_user.get("username", "unknown"),
        "status":     fw_status,
        "fw_message": fw_message,
    }
    await db.quarantined_ips.insert_one(record)

    await write_audit(
        db,
        admin=current_user.get("username", "unknown"),
        admin_ip=get_admin_ip(request),
        action="QUARANTINE_IP",
        resource_type="IP",
        resource_id=ip,
        after={"fw_status": fw_status},
        outcome="SUCCESS" if "ERROR" not in fw_status else "FAILURE",
        detail=fw_message,
    )

    return {"status": "success", "fw_status": fw_status, "fw_message": fw_message, "ip": ip}


@router.get("/quarantined")
async def get_quarantined_ips(db: AsyncIOMotorDatabase = Depends(get_database)):
    results = await db.quarantined_ips.find({}).sort("timestamp", -1).to_list(100)
    for r in results:
        r["_id"] = str(r["_id"])
    return results


@router.post("/unquarantine/{ip}")
async def unquarantine_ip(
    ip: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict       = Depends(get_current_user),
):
    fw_status, fw_message = _netsh_unblock(ip)
    await db.quarantined_ips.delete_one({"ip": ip})

    await write_audit(
        db,
        admin=current_user.get("username", "unknown"),
        admin_ip=get_admin_ip(request),
        action="UNQUARANTINE_IP",
        resource_type="IP",
        resource_id=ip,
        after={"fw_status": fw_status},
        outcome="SUCCESS",
        detail=fw_message,
    )

    return {"status": "success", "fw_status": fw_status, "fw_message": fw_message, "ip": ip}


@router.post("/playbooks")
async def create_playbook(
    playbook: PlaybookCreate,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict       = Depends(get_current_user),
):
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")

    record = playbook.model_dump()
    record["timestamp"] = datetime.utcnow().isoformat()
    record["active"]    = True
    record["created_by"] = current_user.get("username", "unknown")
    await db.playbooks.insert_one(record)
    record["_id"] = str(record["_id"])

    await write_audit(
        db,
        admin=current_user.get("username", "unknown"),
        admin_ip=get_admin_ip(request),
        action="CREATE_PLAYBOOK",
        resource_type="PLAYBOOK",
        resource_id=playbook.name,
        after={"action": playbook.action, "metric": playbook.condition_metric},
        outcome="SUCCESS",
    )
    return record


@router.get("/playbooks")
async def get_playbooks(db: AsyncIOMotorDatabase = Depends(get_database)):
    results = await db.playbooks.find({}).sort("timestamp", -1).to_list(100)
    for r in results:
        r["_id"] = str(r["_id"])
    return results
