import time
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Query

from app.core.config import settings
from app.core.database import get_database

router = APIRouter()
_start_time = time.time()


@router.get("")
async def health_check():
    db = get_database()

    # DB ping
    try:
        await db.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "error"

    # ML model status
    try:
        from app.ml.model import detector
        ml_status = "loaded" if detector is not None else "not_loaded"
    except Exception:
        ml_status = "error"

    # Sniffer activity (online if event received in last 30s)
    try:
        from app.api.routes.events import _last_ingest_time
        sniffer_online = _last_ingest_time > 0 and (time.time() - _last_ingest_time) < 30
    except Exception:
        sniffer_online = False

    # Active alert count
    try:
        alert_count = await db.alerts.count_documents({"status": "open"})
    except Exception:
        alert_count = 0

    uptime_sec = int(time.time() - _start_time)
    hours, remainder = divmod(uptime_sec, 3600)
    minutes, seconds = divmod(remainder, 60)

    all_ok = db_status == "connected" and ml_status == "loaded"

    return {
        "status": "healthy" if all_ok else "degraded",
        "project": settings.PROJECT_NAME,
        "uptime_seconds": uptime_sec,
        "uptime_human": f"{hours}h {minutes}m {seconds}s",
        "open_alerts": alert_count,
        "components": {
            "database":  {"status": db_status,                          "ok": db_status == "connected"},
            "ml_engine": {"status": ml_status,                          "ok": ml_status == "loaded"},
            "sniffer":   {"status": "active" if sniffer_online else "offline", "ok": sniffer_online},
            "api":       {"status": "healthy",                          "ok": True},
        },
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/logs")
async def get_recent_logs(lines: int = Query(100, ge=1, le=500)):
    log_path = Path(__file__).parent.parent.parent.parent / "logs" / "shadowsaas.log"
    if not log_path.exists():
        return {"total_lines": 0, "returned": 0, "lines": [],
                "message": "No log file yet — appears after first backend event"}

    with open(log_path, "r", encoding="utf-8", errors="replace") as f:
        all_lines = f.readlines()

    recent = all_lines[-lines:]
    return {
        "total_lines": len(all_lines),
        "returned": len(recent),
        "lines": [ln.rstrip() for ln in recent],
    }
