"""
User and Entity Behavior Analytics (UEBA) — Behavioral Baseline Engine.

For each device (identified by source_ip) we maintain a rolling baseline that
captures typical behavior:
  • avg / std of bytes uploaded
  • avg / std of risk score
  • active hours of day (hour indices with ≥ 5% of events)
  • top 10 apps seen

Deviation scoring compares an incoming event against the stored baseline and
returns an additive risk penalty when behavior is statistically unusual
(Z-score > UEBA_DEVIATION_THRESHOLD).

Background task `ueba_baseline_loop()` recomputes all baselines every
UEBA_RECOMPUTE_INTERVAL_SEC.  Baselines live in `device_baselines` collection.
"""

import asyncio
import logging
import math
from datetime import datetime, timedelta
from typing import Optional

from app.core.config import settings
from app.core.database import get_database

logger = logging.getLogger(__name__)


# ── Statistical helpers ───────────────────────────────────────────────────────

def _mean(vals: list) -> float:
    return sum(vals) / len(vals) if vals else 0.0


def _std(vals: list, m: float) -> float:
    if len(vals) < 2:
        return 0.0
    return math.sqrt(sum((v - m) ** 2 for v in vals) / (len(vals) - 1))


def _zscore(value: float, mean: float, std: float) -> float:
    if std < 1e-9:
        return 0.0
    return abs(value - mean) / std


# ── Deviation scoring (called per-ingest) ─────────────────────────────────────

def compute_deviation_score(event: dict, baseline: dict) -> dict:
    """
    Compare a single event against the stored device baseline.

    Returns:
        deviation_score  float  additive risk penalty (0–100)
        ueba_flags       list   human-readable anomaly tags
    """
    flags: list  = []
    penalty: float = 0.0

    # 1. Upload-volume deviation
    z_upload = _zscore(
        event.get("bytes_sent", 0),
        baseline.get("avg_bytes_sent", 0),
        baseline.get("std_bytes_sent", 0),
    )
    if z_upload > settings.UEBA_DEVIATION_THRESHOLD:
        flags.append(f"Upload {z_upload:.1f}σ above device baseline")
        penalty += min(30, z_upload * 5)

    # 2. Risk-score deviation
    z_risk = _zscore(
        event.get("risk_score", 0),
        baseline.get("avg_risk_score", 50),
        baseline.get("std_risk_score", 10),
    )
    if z_risk > settings.UEBA_DEVIATION_THRESHOLD:
        flags.append(f"Risk {z_risk:.1f}σ above device average")
        penalty += min(25, z_risk * 4)

    # 3. Off-hours access
    try:
        ts = datetime.fromisoformat(
            event.get("timestamp", datetime.utcnow().isoformat())
        )
        hour: int = ts.hour
        active_hours: list = baseline.get("active_hours", list(range(8, 20)))
        if active_hours and hour not in active_hours:
            flags.append(f"Activity at {hour:02d}:00 outside normal hours")
            penalty += 15
    except Exception:
        pass

    # 4. Unseen application
    known_apps: list = baseline.get("top_apps", [])
    app_name: str = event.get("app_name", "")
    if known_apps and app_name and app_name not in known_apps:
        flags.append(f"New app not in baseline: {app_name}")
        penalty += 10

    return {
        "deviation_score": round(min(100.0, penalty), 2),
        "ueba_flags": flags,
    }


# ── Baseline computation ──────────────────────────────────────────────────────

async def _compute_device_baseline(db, source_ip: str) -> Optional[dict]:
    """Compute a fresh baseline for one IP from the last UEBA_BASELINE_DAYS days."""
    cutoff = (
        datetime.utcnow() - timedelta(days=settings.UEBA_BASELINE_DAYS)
    ).isoformat()

    events = await db.events.find(
        {"source_ip": source_ip, "timestamp": {"$gte": cutoff}}
    ).to_list(length=10_000)

    if len(events) < 10:
        return None  # Insufficient history

    bytes_sent_vals = [float(e.get("bytes_sent", 0))    for e in events]
    risk_score_vals = [float(e.get("risk_score", 50))   for e in events]

    avg_b = _mean(bytes_sent_vals)
    std_b = _std(bytes_sent_vals, avg_b)
    avg_r = _mean(risk_score_vals)
    std_r = _std(risk_score_vals, avg_r)

    # Active hours — hours that appear in ≥ 5% of events
    hour_counts: dict = {}
    for e in events:
        try:
            h = datetime.fromisoformat(e["timestamp"]).hour
            hour_counts[h] = hour_counts.get(h, 0) + 1
        except Exception:
            pass
    min_count = max(1, len(events) * 0.05)
    active_hours = sorted(h for h, c in hour_counts.items() if c >= min_count)

    # Top 10 apps by event count
    app_counts: dict = {}
    for e in events:
        a = e.get("app_name", "Unknown")
        app_counts[a] = app_counts.get(a, 0) + 1
    top_apps = [
        a for a, _ in sorted(app_counts.items(), key=lambda x: -x[1])[:10]
    ]

    return {
        "source_ip":      source_ip,
        "computed_at":    datetime.utcnow().isoformat(),
        "sample_count":   len(events),
        "baseline_days":  settings.UEBA_BASELINE_DAYS,
        "avg_bytes_sent": round(avg_b, 2),
        "std_bytes_sent": round(std_b, 2),
        "avg_risk_score": round(avg_r, 2),
        "std_risk_score": round(std_r, 2),
        "active_hours":   active_hours,
        "top_apps":       top_apps,
    }


async def recompute_all_baselines() -> None:
    """
    Recompute baselines for every device active in the last UEBA_BASELINE_DAYS.
    Safe to call at any time — upserts into device_baselines.
    """
    db = get_database()
    cutoff = (
        datetime.utcnow() - timedelta(days=settings.UEBA_BASELINE_DAYS)
    ).isoformat()

    ip_list = await db.events.distinct("source_ip", {"timestamp": {"$gte": cutoff}})
    if not ip_list:
        logger.debug("UEBA: no active IPs to baseline")
        return

    logger.info(f"UEBA: recomputing baselines for {len(ip_list)} device(s) …")
    updated = 0
    for ip in ip_list:
        try:
            baseline = await _compute_device_baseline(db, ip)
            if baseline:
                await db.device_baselines.replace_one(
                    {"source_ip": ip}, baseline, upsert=True
                )
                updated += 1
        except Exception as exc:
            logger.error(f"UEBA baseline error [{ip}]: {exc}")

    logger.info(f"UEBA: {updated}/{len(ip_list)} baselines refreshed")


async def ueba_baseline_loop() -> None:
    """
    Background coroutine — recomputes device baselines on a fixed interval.
    Started once from main.py lifespan.  Runs a first pass 30 s after startup
    so the sniffer has time to send some initial events.
    """
    interval = settings.UEBA_RECOMPUTE_INTERVAL_SEC
    logger.info(f"UEBA engine started  (interval={interval}s)")

    await asyncio.sleep(30)
    try:
        await recompute_all_baselines()
    except Exception as exc:
        logger.error(f"UEBA startup pass error: {exc}")

    while True:
        await asyncio.sleep(interval)
        try:
            await recompute_all_baselines()
        except Exception as exc:
            logger.error(f"UEBA loop error: {exc}")


# ── Per-request helper ────────────────────────────────────────────────────────

async def get_device_baseline(source_ip: str) -> Optional[dict]:
    """
    Fetch the stored baseline for a device.
    Returns None if the device has never been baselined.
    """
    try:
        db = get_database()
        doc = await db.device_baselines.find_one({"source_ip": source_ip})
        return doc
    except Exception:
        return None
