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
from typing import Optional

router = APIRouter()
logger = logging.getLogger(__name__)

RULE_PREFIX = "ShadowSaaS-Block-"

# IPs that must never be blocked — MongoDB Atlas shards + localhost
_PROTECTED_IPS = {
    "127.0.0.1", "::1",
    "159.41.233.221",  # ac-uwuykqc-shard-00-01 (MongoDB Atlas)
}
_PROTECTED_SUBNETS = ("10.", "172.16.", "172.17.", "172.18.", "172.19.",
                      "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
                      "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
                      "172.30.", "172.31.")

def _is_protected(ip: str) -> bool:
    return (ip in _PROTECTED_IPS or
            ip.startswith("169.254.") or      # link-local
            ip.startswith("224.")   or         # multicast
            any(ip.startswith(s) for s in _PROTECTED_SUBNETS))


# ── OS Detection & Admin Check ────────────────────────────────────────────────

def _detect_os() -> str:
    if sys.platform == "win32":
        return "windows"
    if sys.platform.startswith("linux"):
        return "linux"
    return "other"


def _check_admin() -> bool:
    try:
        if sys.platform == "win32":
            import ctypes
            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        import os
        return os.geteuid() == 0
    except Exception:
        return False


# ── OS-Aware Firewall Operations ──────────────────────────────────────────────

def _fw_block(ip: str) -> tuple[str, str]:
    os_type = _detect_os()
    if os_type == "windows":
        try:
            r = subprocess.run(
                ["netsh", "advfirewall", "firewall", "add", "rule",
                 f"name={RULE_PREFIX}{ip}", "dir=out", "action=block",
                 f"remoteip={ip}", "enable=yes", "profile=any"],
                capture_output=True, text=True, timeout=10,
            )
            if r.returncode == 0:
                logger.warning("FIREWALL BLOCK applied: %s", ip)
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

    if os_type == "linux":
        try:
            r = subprocess.run(
                ["iptables", "-I", "OUTPUT", "-d", ip, "-j", "DROP"],
                capture_output=True, text=True, timeout=10,
            )
            if r.returncode == 0:
                logger.warning("FIREWALL BLOCK (iptables) applied: %s", ip)
                return "BLOCKED_AT_FIREWALL", "iptables OUTPUT DROP rule inserted"
            err = (r.stderr or r.stdout).strip()
            if "Operation not permitted" in err or "Permission denied" in err:
                return "FIREWALL_ERROR", "Permission denied — restart backend as root"
            return "FIREWALL_ERROR", err or "iptables failed"
        except FileNotFoundError:
            return "FIREWALL_ERROR", "iptables not found — install iptables or run as root"
        except subprocess.TimeoutExpired:
            return "FIREWALL_ERROR", "iptables timed out"
        except Exception as exc:
            return "FIREWALL_ERROR", str(exc)

    return "LOGGED_ONLY", f"OS '{sys.platform}' not supported — rule logged but not OS-enforced"


def _fw_unblock(ip: str) -> tuple[str, str]:
    os_type = _detect_os()
    if os_type == "windows":
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

    if os_type == "linux":
        try:
            r = subprocess.run(
                ["iptables", "-D", "OUTPUT", "-d", ip, "-j", "DROP"],
                capture_output=True, text=True, timeout=10,
            )
            if r.returncode == 0:
                return "REMOVED", "iptables OUTPUT DROP rule removed"
            return "REMOVE_ERROR", (r.stderr or r.stdout).strip()
        except Exception as exc:
            return "REMOVE_ERROR", str(exc)

    return "REMOVED", "No OS-level rule to remove"


def _fw_verify_rule(ip: str) -> bool:
    """Check whether the OS-level firewall rule actually exists for this IP."""
    os_type = _detect_os()
    if os_type == "windows":
        try:
            r = subprocess.run(
                ["netsh", "advfirewall", "firewall", "show", "rule",
                 f"name={RULE_PREFIX}{ip}"],
                capture_output=True, text=True, timeout=5,
            )
            return r.returncode == 0 and "No rules match" not in (r.stdout or "")
        except Exception:
            return False

    if os_type == "linux":
        try:
            r = subprocess.run(
                ["iptables", "-C", "OUTPUT", "-d", ip, "-j", "DROP"],
                capture_output=True, text=True, timeout=5,
            )
            return r.returncode == 0
        except Exception:
            return False

    return False


# ── Request Models ────────────────────────────────────────────────────────────

class FirewallBlockBody(BaseModel):
    ip: str
    reason: Optional[str] = "Manual SOC Block"
    source: Optional[str] = "manual"    # manual | policy | auto
    severity: Optional[str] = "high"   # low | medium | high | critical


class PlaybookCreate(BaseModel):
    name: str
    condition_metric: str
    condition_operator: str
    condition_value: float
    action: str


# ── Firewall Status & Rules ───────────────────────────────────────────────────

@router.get("/firewall/status")
async def get_firewall_status(db: AsyncIOMotorDatabase = Depends(get_database)):
    os_type = _detect_os()
    is_admin = _check_admin()

    if os_type == "windows":
        platform_label = "Windows (netsh advfirewall)"
        enforcement_mode = "ACTIVE" if is_admin else "DEGRADED"
    elif os_type == "linux":
        platform_label = "Linux (iptables)"
        enforcement_mode = "ACTIVE" if is_admin else "DEGRADED"
    else:
        platform_label = f"Unsupported ({sys.platform})"
        enforcement_mode = "LOGGED_ONLY"

    total = await db.quarantined_ips.count_documents({})
    active = await db.quarantined_ips.count_documents({"status": {"$ne": "UNBLOCKED"}})
    enforced = await db.quarantined_ips.count_documents({"status": "BLOCKED_AT_FIREWALL"})
    errors = await db.quarantined_ips.count_documents({"status": "FIREWALL_ERROR"})
    logged_only = await db.quarantined_ips.count_documents({"status": "LOGGED_ONLY"})
    unblocked = await db.quarantined_ips.count_documents({"status": "UNBLOCKED"})

    return {
        "os": os_type,
        "platform_label": platform_label,
        "enforcement_mode": enforcement_mode,
        "is_admin": is_admin,
        "total_rules": total,
        "active_rules": active,
        "enforced_rules": enforced,
        "error_rules": errors,
        "logged_only_rules": logged_only,
        "unblocked_count": unblocked,
    }


@router.get("/firewall/rules")
async def get_firewall_rules(
    verify: bool = False,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Return all firewall records. verify=true checks each BLOCKED rule against the OS."""
    results = await db.quarantined_ips.find({}).sort("timestamp", -1).to_list(500)
    for r in results:
        r["_id"] = str(r["_id"])
        if verify and r.get("status") == "BLOCKED_AT_FIREWALL":
            r["os_verified"] = _fw_verify_rule(r["ip"])
        else:
            r["os_verified"] = None
    return results


# ── Firewall Block / Unblock ──────────────────────────────────────────────────

@router.post("/firewall/block")
async def firewall_block(
    body: FirewallBlockBody,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(get_current_user),
):
    ip = body.ip.strip()

    if _is_protected(ip):
        raise HTTPException(status_code=400, detail=f"IP {ip} is on the protected safelist and cannot be blocked")

    existing = await db.quarantined_ips.find_one({"ip": ip, "status": {"$ne": "UNBLOCKED"}})
    if existing:
        return {"status": "already_blocked", "ip": ip, "fw_status": existing.get("status")}

    fw_status, fw_message = _fw_block(ip)

    record = {
        "ip": ip,
        "timestamp": datetime.utcnow().isoformat(),
        "reason": body.reason,
        "source": body.source,
        "severity": body.severity,
        "quarantined_by": current_user.get("username", "unknown"),
        "status": fw_status,
        "fw_message": fw_message,
    }
    await db.quarantined_ips.insert_one(record)

    await write_audit(
        db,
        admin=current_user.get("username", "unknown"),
        admin_ip=get_admin_ip(request),
        action="FIREWALL_BLOCK",
        resource_type="IP",
        resource_id=ip,
        after={"fw_status": fw_status, "reason": body.reason, "source": body.source},
        outcome="SUCCESS" if "ERROR" not in fw_status else "FAILURE",
        detail=fw_message,
    )

    return {"status": "success", "fw_status": fw_status, "fw_message": fw_message, "ip": ip}


@router.post("/firewall/unblock/{ip}")
async def firewall_unblock(
    ip: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(get_current_user),
):
    fw_status, fw_message = _fw_unblock(ip)

    await db.quarantined_ips.update_one(
        {"ip": ip},
        {"$set": {
            "status": "UNBLOCKED",
            "unblocked_at": datetime.utcnow().isoformat(),
            "unblocked_by": current_user.get("username", "unknown"),
        }},
    )

    await write_audit(
        db,
        admin=current_user.get("username", "unknown"),
        admin_ip=get_admin_ip(request),
        action="FIREWALL_UNBLOCK",
        resource_type="IP",
        resource_id=ip,
        after={"fw_status": fw_status},
        outcome="SUCCESS",
        detail=fw_message,
    )

    return {"status": "success", "fw_status": fw_status, "fw_message": fw_message, "ip": ip}


# ── Legacy Quarantine Endpoints (backward compat) ─────────────────────────────

@router.post("/quarantine/{ip}")
async def quarantine_ip(
    ip: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(get_current_user),
):
    if _is_protected(ip):
        return {"status": "protected", "ip": ip, "message": "IP is on safelist"}

    existing = await db.quarantined_ips.find_one({"ip": ip, "status": {"$ne": "UNBLOCKED"}})
    if existing:
        return {"status": "already_quarantined", "ip": ip}

    fw_status, fw_message = _fw_block(ip)

    record = {
        "ip": ip,
        "timestamp": datetime.utcnow().isoformat(),
        "reason": "Manual SOC Analyst Intervention",
        "source": "manual",
        "severity": "high",
        "quarantined_by": current_user.get("username", "unknown"),
        "status": fw_status,
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
    results = await db.quarantined_ips.find(
        {"status": {"$ne": "UNBLOCKED"}}
    ).sort("timestamp", -1).to_list(100)
    for r in results:
        r["_id"] = str(r["_id"])
    return results


@router.post("/unquarantine/{ip}")
async def unquarantine_ip(
    ip: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(get_current_user),
):
    fw_status, fw_message = _fw_unblock(ip)
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


# ── Playbooks ─────────────────────────────────────────────────────────────────

@router.post("/playbooks")
async def create_playbook(
    playbook: PlaybookCreate,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(get_current_user),
):
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")

    record = playbook.model_dump()
    record["timestamp"] = datetime.utcnow().isoformat()
    record["active"] = True
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


# ── My Device Registration ─────────────────────────────────────────────────────
# The packet sniffer calls POST /my-device at startup so every frontend page
# can distinguish "my machine" (the sniffer host) from other network devices.

class MyDeviceBody(BaseModel):
    ip: str
    hostname: Optional[str] = None


@router.post("/my-device")
async def register_my_device(
    body: MyDeviceBody,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Sniffer registers its own IP at startup."""
    await db.device_config.update_one(
        {"key": "my_device"},
        {"$set": {
            "ip": body.ip,
            "hostname": body.hostname,
            "registered_at": datetime.utcnow().isoformat(),
        }},
        upsert=True,
    )
    logger.info("My-device registered: %s (%s)", body.ip, body.hostname)
    return {"ok": True, "ip": body.ip}


@router.get("/my-device")
async def get_my_device(db: AsyncIOMotorDatabase = Depends(get_database)):
    """
    Returns the IP of this server machine.
    Checks DB first (sniffer registration), then auto-detects using the
    same outbound-interface trick the sniffer uses — so it works even
    before the sniffer has registered.
    """
    import socket as _socket
    doc = await db.device_config.find_one({"key": "my_device"})
    if doc and doc.get("ip"):
        return {"ip": doc["ip"], "hostname": doc.get("hostname"), "source": "registered"}
    # Auto-detect: connect to a public address to learn the outbound interface IP
    try:
        with _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            my_ip = s.getsockname()[0]
        return {"ip": my_ip, "hostname": _socket.gethostname(), "source": "auto"}
    except Exception:
        return {"ip": None, "hostname": None, "source": "unknown"}
