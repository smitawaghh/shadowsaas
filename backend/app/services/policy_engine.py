"""
Automated Policy Enforcement Engine.

Runs as a background asyncio task every POLICY_EVAL_INTERVAL_SECONDS.
For each active policy it:
  1. Queries recent events that match the policy conditions
  2. If threshold is met → executes the configured action automatically
  3. Writes an audit record for every automated action taken
  4. Broadcasts a WebSocket alert so the dashboard reacts in real time

Policy document schema (stored in MongoDB `policies` collection):
  {
    "name":                 "Block ChatGPT bulk uploads",
    "description":          "...",
    "is_active":            true,
    "created_by":           "admin@soc.local",
    "conditions": {
      "app_name":           "ChatGPT",        # optional substring match
      "min_risk_score":     60,               # optional minimum risk
      "min_bytes_sent":     1048576,          # optional minimum bytes (1 MB)
      "is_genai":           true,             # optional boolean flag
      "window_minutes":     60,               # look-back window (default 60)
      "event_count":        1,               # how many matching events trigger action
    },
    "action":  "quarantine"   # log_only | alert | quarantine | block_and_alert
  }
"""

import asyncio
import logging
import sys
import subprocess
from datetime import datetime, timedelta

from app.core.config import settings
from app.core.database import get_database
from app.core.audit import write_audit
from app.core.ws_manager import ws_manager

logger = logging.getLogger(__name__)

RULE_PREFIX = "ShadowSaaS-Block-"


def _netsh_block(ip: str) -> bool:
    if sys.platform != "win32":
        return False
    try:
        r = subprocess.run(
            ["netsh", "advfirewall", "firewall", "add", "rule",
             f"name={RULE_PREFIX}{ip}", "dir=out", "action=block",
             f"remoteip={ip}", "enable=yes", "profile=any"],
            capture_output=True, text=True, timeout=10,
        )
        return r.returncode == 0
    except Exception:
        return False


async def _execute_action(db, policy: dict, matching_events: list) -> None:
    """Carry out the policy action and write audit + WebSocket notification."""
    action     = policy.get("action", "log_only")
    policy_name = policy.get("name", "unnamed")
    affected_ips = list({e.get("source_ip") for e in matching_events if e.get("source_ip")})

    for ip in affected_ips:
        # ── Quarantine ────────────────────────────────────────────────────
        if action in ("quarantine", "block_and_alert"):
            already = await db.quarantined_ips.find_one({"ip": ip})
            if not already:
                blocked = _netsh_block(ip)
                fw_status = "BLOCKED_AT_FIREWALL" if blocked else "LOGGED_ONLY"
                await db.quarantined_ips.insert_one({
                    "ip":             ip,
                    "timestamp":      datetime.utcnow().isoformat(),
                    "reason":         f"Auto-enforced by policy: {policy_name}",
                    "quarantined_by": "policy_engine",
                    "status":         fw_status,
                    "fw_message":     "Automatic policy enforcement",
                })
                logger.warning(f"[POLICY] Auto-quarantined {ip}  policy='{policy_name}'")

        await write_audit(
            db,
            admin="policy_engine",
            admin_ip="127.0.0.1",
            action=f"POLICY_ENFORCE_{action.upper()}",
            resource_type="IP",
            resource_id=ip,
            before=None,
            after={"policy": policy_name, "action": action,
                   "matching_events": len(matching_events)},
            outcome="SUCCESS",
            detail=f"Automated enforcement of policy '{policy_name}'",
        )

    # ── WebSocket broadcast ───────────────────────────────────────────────
    await ws_manager.broadcast({
        "type": "policy_alert",
        "data": {
            "policy":          policy_name,
            "action":          action,
            "affected_ips":    affected_ips,
            "event_count":     len(matching_events),
            "timestamp":       datetime.utcnow().isoformat(),
        },
    })


async def _evaluate_policy(db, policy: dict) -> None:
    cond   = policy.get("conditions", {})
    window = int(cond.get("window_minutes", 60))
    cutoff = (datetime.utcnow() - timedelta(minutes=window)).isoformat()

    query: dict = {"timestamp": {"$gte": cutoff}}

    app_name = cond.get("app_name")
    if app_name:
        query["app_name"] = {"$regex": app_name, "$options": "i"}

    min_risk = cond.get("min_risk_score")
    if min_risk is not None:
        query["risk_score"] = {"$gte": float(min_risk)}

    min_bytes = cond.get("min_bytes_sent")
    if min_bytes is not None:
        query["bytes_sent"] = {"$gte": int(min_bytes)}

    if cond.get("is_genai"):
        query["is_genai_exfiltration"] = True

    threshold = int(cond.get("event_count", 1))
    events = await db.events.find(query).limit(threshold + 1).to_list(length=threshold + 1)

    if len(events) >= threshold:
        logger.info(
            f"[POLICY] '{policy['name']}' triggered — "
            f"{len(events)} events match in last {window} min"
        )
        await _execute_action(db, policy, events)
    else:
        logger.debug(
            f"[POLICY] '{policy['name']}' — {len(events)}/{threshold} events, not triggered"
        )


async def policy_enforcement_loop() -> None:
    """
    Background coroutine.  Evaluates all active policies on every tick.
    Started once from main.py lifespan and runs until the server shuts down.
    """
    interval = settings.POLICY_EVAL_INTERVAL_SECONDS
    logger.info(f"Policy engine started  (interval={interval}s)")

    while True:
        await asyncio.sleep(interval)
        try:
            db = get_database()
            policies = await db.policies.find({"is_active": True}).to_list(length=None)
            if not policies:
                continue
            for policy in policies:
                try:
                    await _evaluate_policy(db, policy)
                except Exception as exc:
                    logger.error(f"Policy eval error [{policy.get('name')}]: {exc}")
        except Exception as exc:
            logger.error(f"Policy engine loop error: {exc}")
