from fastapi import APIRouter, Depends, HTTPException, Query, Header
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import logging
import time as _time

from app.core.database import get_database
from app.core.auth import get_current_user
from app.core.config import settings
from app.core.ws_manager import ws_manager
from app.ml.model import detector
from app.ml.risk_scoring import get_risk_engine
from app.ml.genai_dlp import get_genai_dlp_engine
from app.services.ueba import get_device_baseline, compute_deviation_score
from app.services.notification import maybe_notify

logger = logging.getLogger(__name__)
router = APIRouter()

# Tracks last successful ingest — lets the frontend show a live sniffer indicator
_last_ingest_time: float = 0.0


def _verify_sniffer_key(x_sniffer_key: Optional[str] = Header(default=None)) -> None:
    """
    Dependency for the /ingest endpoint.
    When SNIFFER_API_KEY is set in .env, the sniffer must send
    X-Sniffer-Key: <key> with every POST or the request is rejected.
    When the key is empty (default dev mode), the check is bypassed.
    """
    configured = settings.SNIFFER_API_KEY
    if configured and x_sniffer_key != configured:
        raise HTTPException(status_code=403, detail="Invalid or missing sniffer API key")


# Known SaaS catalog used to auto-populate app_profiles on first detection
_APP_CATALOG = {
    "Microsoft 365":               {"category": "Collaboration",       "trust_score": 90, "is_sanctioned": True},
    "Microsoft Teams":             {"category": "Collaboration",       "trust_score": 90, "is_sanctioned": True},
    "Microsoft Copilot (GenAI)":   {"category": "Generative AI",       "trust_score": 50, "is_sanctioned": None},
    "Microsoft Dynamics":          {"category": "CRM / ERP",           "trust_score": 88, "is_sanctioned": True},
    "Microsoft Azure":             {"category": "Cloud Platform",      "trust_score": 88, "is_sanctioned": True},
    "Google Workspace":            {"category": "Collaboration",       "trust_score": 90, "is_sanctioned": True},
    "Google Cloud":                {"category": "Cloud Platform",      "trust_score": 88, "is_sanctioned": True},
    "Gemini (GenAI)":              {"category": "Generative AI",       "trust_score": 40, "is_sanctioned": False},
    "Salesforce":                  {"category": "CRM",                 "trust_score": 88, "is_sanctioned": True},
    "Slack":                       {"category": "Collaboration",       "trust_score": 85, "is_sanctioned": True},
    "Zoom":                        {"category": "Video Conferencing",  "trust_score": 85, "is_sanctioned": True},
    "Webex":                       {"category": "Video Conferencing",  "trust_score": 85, "is_sanctioned": True},
    "Cisco / Webex":               {"category": "Video Conferencing",  "trust_score": 85, "is_sanctioned": True},
    "Okta":                        {"category": "Identity & Access",   "trust_score": 90, "is_sanctioned": True},
    "Workday":                     {"category": "HR / Finance",        "trust_score": 85, "is_sanctioned": True},
    "ServiceNow":                  {"category": "ITSM",                "trust_score": 85, "is_sanctioned": True},
    "Zendesk":                     {"category": "Customer Support",    "trust_score": 80, "is_sanctioned": True},
    "HubSpot":                     {"category": "Marketing CRM",       "trust_score": 78, "is_sanctioned": True},
    "Figma":                       {"category": "Design",              "trust_score": 82, "is_sanctioned": True},
    "GitHub":                      {"category": "Developer Tools",     "trust_score": 85, "is_sanctioned": True},
    "GitHub Copilot":              {"category": "Developer AI",        "trust_score": 60, "is_sanctioned": None},
    "GitLab":                      {"category": "Developer Tools",     "trust_score": 78, "is_sanctioned": None},
    "Atlassian":                   {"category": "Developer Tools",     "trust_score": 85, "is_sanctioned": True},
    "Atlassian / Jira":            {"category": "Project Management",  "trust_score": 85, "is_sanctioned": True},
    "Atlassian / Confluence":      {"category": "Knowledge Base",      "trust_score": 85, "is_sanctioned": True},
    "AWS":                         {"category": "Cloud Platform",      "trust_score": 80, "is_sanctioned": None},
    "AWS CloudFront":              {"category": "CDN",                 "trust_score": 80, "is_sanctioned": True},
    "Cloudflare CDN":              {"category": "CDN",                 "trust_score": 80, "is_sanctioned": True},
    "Cloudflare DNS":              {"category": "DNS / Infrastructure","trust_score": 90, "is_sanctioned": True},
    "Google DNS":                  {"category": "DNS / Infrastructure","trust_score": 90, "is_sanctioned": True},
    "Notion":                      {"category": "Productivity",        "trust_score": 65, "is_sanctioned": None},
    "Miro":                        {"category": "Collaboration",       "trust_score": 70, "is_sanctioned": None},
    "Canva":                       {"category": "Design",              "trust_score": 70, "is_sanctioned": None},
    "Box":                         {"category": "Cloud Storage",       "trust_score": 75, "is_sanctioned": None},
    "Apple iCloud":                {"category": "Cloud Storage",       "trust_score": 60, "is_sanctioned": None},
    "LinkedIn":                    {"category": "Social Network",      "trust_score": 60, "is_sanctioned": None},
    # Unsanctioned GenAI
    "ChatGPT (GenAI)":             {"category": "Generative AI",       "trust_score": 20, "is_sanctioned": False},
    "Claude (GenAI)":              {"category": "Generative AI",       "trust_score": 20, "is_sanctioned": False},
    "Perplexity (GenAI)":          {"category": "Generative AI",       "trust_score": 25, "is_sanctioned": False},
    "HuggingFace (GenAI)":         {"category": "Generative AI",       "trust_score": 30, "is_sanctioned": False},
    "Midjourney (GenAI)":          {"category": "Generative AI",       "trust_score": 25, "is_sanctioned": False},
    "Mistral (GenAI)":             {"category": "Generative AI",       "trust_score": 25, "is_sanctioned": False},
    "Groq (GenAI)":                {"category": "Generative AI",       "trust_score": 25, "is_sanctioned": False},
    # Shadow storage
    "Dropbox (Personal)":          {"category": "Cloud Storage",       "trust_score": 15, "is_sanctioned": False},
    "AWS S3 (Shadow)":             {"category": "IaaS / Storage",      "trust_score": 10, "is_sanctioned": False},
    "WeTransfer":                  {"category": "File Transfer",       "trust_score": 15, "is_sanctioned": False},
    "FileBin (Shadow)":            {"category": "File Transfer",       "trust_score": 5,  "is_sanctioned": False},
    "File.io (Shadow)":            {"category": "File Transfer",       "trust_score": 5,  "is_sanctioned": False},
    # Social / unsanctioned
    "Facebook (Unsanctioned)":     {"category": "Social Media",        "trust_score": 10, "is_sanctioned": False},
    "Instagram (Unsanctioned)":    {"category": "Social Media",        "trust_score": 10, "is_sanctioned": False},
    "Twitter/X (Unsanctioned)":    {"category": "Social Media",        "trust_score": 10, "is_sanctioned": False},
    "TikTok (Unsanctioned)":       {"category": "Social Media",        "trust_score": 5,  "is_sanctioned": False},
    "Reddit (Unsanctioned)":       {"category": "Social Media",        "trust_score": 15, "is_sanctioned": False},
    "YouTube (Unsanctioned)":      {"category": "Streaming",           "trust_score": 30, "is_sanctioned": None},
    "Discord (Unsanctioned)":      {"category": "Communication",       "trust_score": 10, "is_sanctioned": False},
    "WhatsApp (Unsanctioned)":     {"category": "Communication",       "trust_score": 10, "is_sanctioned": False},
    "Telegram (Unsanctioned)":     {"category": "Communication",       "trust_score": 5,  "is_sanctioned": False},
    # High risk
    "Pastebin (High Risk)":        {"category": "Code / Data Share",   "trust_score": 5,  "is_sanctioned": False},
    "NordVPN (Shadow IT)":         {"category": "VPN / Proxy",         "trust_score": 5,  "is_sanctioned": False},
    "ExpressVPN (Shadow IT)":      {"category": "VPN / Proxy",         "trust_score": 5,  "is_sanctioned": False},
    "Tor Browser (High Risk)":     {"category": "Anonymization",       "trust_score": 0,  "is_sanctioned": False},
}


class EventCreate(BaseModel):
    source_ip: str
    destination_ip: str
    source_port: int
    destination_port: int
    protocol: str
    app_name: str
    bytes_sent: int = 0
    bytes_received: int = 0
    upload_download_ratio: float = 0.0
    packet_size_variance: float = 0.0
    inter_arrival_time: float = 0.0
    is_anomalous: Optional[bool] = None
    risk_score: Optional[float] = None
    # Device identity fields — populated by the sniffer's ARP/NetBIOS discovery
    device_name: Optional[str] = None   # e.g. "DESKTOP-ABC123" or MAC OUI
    mac_address: Optional[str] = None   # e.g. "00:1A:2B:3C:4D:5E"


@router.post("/ingest", dependencies=[Depends(_verify_sniffer_key)])
async def ingest_event(event: EventCreate, db=Depends(get_database)):
    """
    Ingest network event from packet_sniffer.py or mock_traffic_generator.py.

    Pipeline:
      1. Isolation Forest (3-feature: upload_ratio, pkt_variance, IAT)
      2. GenAI DLP heuristic check (bulk-paste detection)
      3. Multi-factor risk scoring (traffic + app + behavioral)
      4. Persist to MongoDB, update IP risk profile
    """
    try:
        # ── Step 1: Isolation Forest anomaly detection ──────────────────────
        is_anomalous, ml_risk_score = detector.predict(
            event.upload_download_ratio,
            event.packet_size_variance,
            event.inter_arrival_time,
        )

        anomaly_info = {
            "is_anomalous": is_anomalous,
            "anomaly_score": -(ml_risk_score / 100.0),  # Approximate decision_function range
            "confidence": ml_risk_score / 100.0,
        }

        # ── Step 2: GenAI DLP check ─────────────────────────────────────────
        genai_engine = get_genai_dlp_engine()
        dlp_result = genai_engine.analyze_event(event.model_dump())

        # ── Step 3: Multi-factor risk scoring ───────────────────────────────
        risk_engine = get_risk_engine(db)
        event_dict = event.model_dump()
        event_dict["timestamp"] = datetime.utcnow().isoformat()
        risk_result = await risk_engine.calculate_risk(event_dict, anomaly_info)

        final_risk: float = risk_result["score"]
        risk_level: str = risk_result["level"]
        risk_reasons: list = list(risk_result.get("reasons", []))

        # Merge GenAI DLP findings
        if dlp_result["is_genai_exfiltration"]:
            final_risk = max(final_risk, dlp_result["genai_risk_score"])
            risk_level = "CRITICAL"
            risk_reasons.append("Bulk Data Paste to GenAI Detected")
            risk_reasons.extend(dlp_result["genai_tags"])

        # ── Step 3b: UEBA behavioral deviation check ─────────────────────────
        # Compare this event against the device's stored behavioral baseline.
        # Deviation adds a proportional risk penalty so new/unusual behaviour
        # is surfaced even when the raw traffic metrics look normal.
        ueba_flags: list = []
        baseline = await get_device_baseline(event.source_ip)
        if baseline:
            ueba = compute_deviation_score(
                {**event.model_dump(), "risk_score": final_risk},
                baseline,
            )
            if ueba["deviation_score"] > 0:
                # Cap additive penalty at 30 % of remaining headroom
                penalty = ueba["deviation_score"] * 0.3
                final_risk = min(100.0, final_risk + penalty)
                ueba_flags = ueba["ueba_flags"]
                risk_reasons.extend(ueba_flags)

        # ── Step 4: Store event in MongoDB ──────────────────────────────────
        now_iso = datetime.utcnow().isoformat()
        event_doc = {
            "timestamp": now_iso,
            "source_ip": event.source_ip,
            "destination_ip": event.destination_ip,
            "source_port": event.source_port,
            "destination_port": event.destination_port,
            "protocol": event.protocol,
            "app_name": event.app_name,
            "bytes_sent": event.bytes_sent,
            "bytes_received": event.bytes_received,
            "upload_download_ratio": event.upload_download_ratio,
            "packet_size_variance": event.packet_size_variance,
            "inter_arrival_time": event.inter_arrival_time,
            "is_anomalous": is_anomalous,
            "risk_score": round(final_risk, 2),
            "risk_level": risk_level,
            "risk_reasons": list(set(risk_reasons)),
            "is_genai_exfiltration": dlp_result["is_genai_exfiltration"],
            # Device identity — None when sniffer doesn't resolve it yet
            "device_name":  event.device_name,
            "mac_address":  event.mac_address,
            # UEBA deviation flags (empty list when no baseline exists yet)
            "ueba_flags":   ueba_flags,
        }

        result = await db.events.insert_one(event_doc)
        event_doc["_id"] = str(result.inserted_id)

        # Mark sniffer as online (used by /events/sniffer-status)
        global _last_ingest_time
        _last_ingest_time = _time.time()

        # Broadcast to all live dashboard WebSocket clients
        await ws_manager.broadcast({"type": "event", "data": event_doc})

        # Fire push notifications if risk exceeds threshold (background tasks,
        # never blocks or raises)
        maybe_notify(event_doc)

        # ── Step 5: Update IP-based behavioral risk profile ─────────────────
        profile_update = {
            "$set": {"last_seen": now_iso},
            "$inc": {
                "total_events": 1,
                "anomaly_count": 1 if is_anomalous else 0,
            },
            "$max": {"peak_risk": round(final_risk, 2)},
        }
        if is_anomalous:
            # Bump dynamic risk score (stored; decays over time in analytics)
            profile_update["$set"].update({
                "dynamic_risk_score": round(final_risk, 2),
                "risk_updated_at": now_iso,
            })

        await db.user_profiles.update_one(
            {"source_ip": event.source_ip},
            profile_update,
            upsert=True,
        )

        # ── Step 6: Auto-create app profile on first detection ──────────────
        app_meta = _APP_CATALOG.get(event.app_name)
        await db.app_profiles.update_one(
            {"name": event.app_name},
            {
                "$setOnInsert": {
                    "name": event.app_name,
                    "category": app_meta["category"] if app_meta else "Unknown SaaS",
                    "trust_score": app_meta["trust_score"] if app_meta else 50.0,
                    "is_sanctioned": app_meta["is_sanctioned"] if app_meta else None,
                    "first_detected": now_iso,
                    "known_vulnerabilities": [],
                    "tags": [],
                },
                "$set": {"last_detected": now_iso},
                "$inc": {"event_count": 1},
                "$max": {"peak_risk": round(final_risk, 2)},
            },
            upsert=True,
        )

        logger.info(
            f"Ingested: {event.app_name} | risk={final_risk:.1f} ({risk_level}) | anomaly={is_anomalous}"
        )
        return event_doc

    except Exception as e:
        logger.error(f"Ingest error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def get_events(
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    risk_min: float = Query(0, ge=0, le=100),
    risk_max: float = Query(100, ge=0, le=100),
    app_name: Optional[str] = None,
    source_ip: Optional[str] = None,
    db=Depends(get_database),
):
    """Fetch events with filtering and pagination. source_ip enables per-device investigation."""
    try:
        query: dict = {"risk_score": {"$gte": risk_min, "$lte": risk_max}}
        if app_name:
            query["app_name"] = {"$regex": app_name, "$options": "i"}
        if source_ip:
            query["source_ip"] = source_ip

        total = await db.events.count_documents(query)
        events = (
            await db.events.find(query)
            .sort("timestamp", -1)
            .skip(offset)
            .limit(limit)
            .to_list(length=limit)
        )

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + limit) < total,
            "data": [{**e, "_id": str(e["_id"])} for e in events],
        }
    except Exception as e:
        logger.error(f"Error fetching events: {e}")
        raise HTTPException(status_code=500)


@router.get("/stats")
async def get_stats(
    hours: int = Query(24, ge=1, le=2160),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database),
):
    """Dashboard statistics for the given time window."""
    from datetime import timedelta

    cutoff = datetime.utcnow() - timedelta(hours=hours)

    events = await db.events.find(
        {"timestamp": {"$gte": cutoff.isoformat()}}
    ).to_list(length=10000)

    if not events:
        return {
            "total": 0, "anomalies": 0, "anomaly_rate": 0,
            "avg_risk": 0, "critical": 0, "elevated": 0, "normal": 0,
            "top_apps": [], "risk_distribution": {}, "top_risky_ips": [],
        }

    total = len(events)
    anomalies = sum(1 for e in events if e.get("is_anomalous"))
    critical = sum(1 for e in events if e.get("risk_score", 0) >= 70)
    elevated = sum(1 for e in events if 40 <= e.get("risk_score", 0) < 70)
    avg_risk = sum(e.get("risk_score", 0) for e in events) / total

    # Top apps by event count
    app_stats: dict = {}
    for e in events:
        app = e.get("app_name", "Unknown")
        if app not in app_stats:
            app_stats[app] = {"count": 0, "risk_sum": 0}
        app_stats[app]["count"] += 1
        app_stats[app]["risk_sum"] += e.get("risk_score", 0)

    top_apps = sorted(
        [
            {
                "name": k,
                "count": v["count"],
                "avg_risk": round(v["risk_sum"] / v["count"], 1),
            }
            for k, v in app_stats.items()
        ],
        key=lambda x: x["count"],
        reverse=True,
    )[:25]

    # Top risky IPs
    ip_risk: dict = {}
    for e in events:
        ip = e.get("source_ip", "unknown")
        if ip not in ip_risk:
            ip_risk[ip] = {"count": 0, "risk_sum": 0}
        ip_risk[ip]["count"] += 1
        ip_risk[ip]["risk_sum"] += e.get("risk_score", 0)

    top_risky_ips = sorted(
        [
            {"ip": k, "count": v["count"], "avg_risk": round(v["risk_sum"] / v["count"], 1)}
            for k, v in ip_risk.items()
        ],
        key=lambda x: x["avg_risk"],
        reverse=True,
    )[:10]

    return {
        "total": total,
        "anomalies": anomalies,
        "anomaly_rate": round(anomalies / total * 100, 1) if total > 0 else 0,
        "avg_risk": round(avg_risk, 1),
        "critical": critical,
        "elevated": elevated,
        "normal": total - critical - elevated,
        "top_apps": top_apps,
        "risk_distribution": {"critical": critical, "elevated": elevated, "normal": total - critical - elevated},
        "top_risky_ips": top_risky_ips,
    }


@router.get("/sniffer-status")
async def get_sniffer_status():
    """
    Returns whether the packet sniffer is actively sending data.
    'online' is true if an event was received in the last 30 seconds.
    The frontend dashboard uses this to show a live/offline indicator.
    """
    if _last_ingest_time == 0:
        return {"online": False, "last_event_ago": None,
                "message": "No events received since backend started"}
    elapsed = round(_time.time() - _last_ingest_time)
    return {
        "online": elapsed < 30,
        "last_event_ago": elapsed,
        "message": f"Last event {elapsed}s ago" if elapsed < 30 else f"Sniffer silent for {elapsed}s",
    }


@router.get("/high-risk")
async def get_high_risk(
    limit: int = Query(10, ge=1, le=100),
    db=Depends(get_database),
):
    """Get highest-risk events sorted by risk_score descending."""
    events = (
        await db.events.find({"risk_score": {"$gte": 70}})
        .sort("timestamp", -1)
        .limit(limit)
        .to_list(length=limit)
    )
    return [{**e, "_id": str(e["_id"])} for e in events]


@router.get("/timeline/{source_ip}")
async def get_ip_timeline(
    source_ip: str,
    limit: int = Query(60, ge=1, le=500),
    db=Depends(get_database),
):
    """
    Return event timeline for a specific device IP — used by the investigation panel.
    Includes per-event risk scores for timeline charting plus top apps used.
    """
    events = (
        await db.events.find({"source_ip": source_ip})
        .sort("timestamp", -1)
        .limit(limit)
        .to_list(length=limit)
    )
    events = [{**e, "_id": str(e["_id"])} for e in events]

    # Aggregate top apps for this IP
    app_map: dict = {}
    for e in events:
        app = e.get("app_name", "Unknown")
        app_map.setdefault(app, {"count": 0, "risk_sum": 0, "upload": 0})
        app_map[app]["count"] += 1
        app_map[app]["risk_sum"] += e.get("risk_score", 0)
        app_map[app]["upload"] += e.get("bytes_sent", 0)

    top_apps = sorted(
        [
            {
                "name": k,
                "count": v["count"],
                "avg_risk": round(v["risk_sum"] / v["count"], 1),
                "upload_mb": round(v["upload"] / 1048576, 2),
            }
            for k, v in app_map.items()
        ],
        key=lambda x: x["count"],
        reverse=True,
    )[:25]

    return {
        "source_ip": source_ip,
        "event_count": len(events),
        "events": events,
        "top_apps": top_apps,
    }


@router.delete("/clear-all")
async def clear_all_events(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Delete ALL events, user_profiles, and app_profiles from MongoDB.
    Admin only. Use to flush mock/test data before a live demo.
    """
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    r_ev  = await db.events.delete_many({})
    r_up  = await db.user_profiles.delete_many({})
    r_ap  = await db.app_profiles.delete_many({})
    logger.warning(
        f"Database cleared by {current_user.get('username')}: "
        f"{r_ev.deleted_count} events, {r_up.deleted_count} profiles, {r_ap.deleted_count} app profiles"
    )
    return {
        "deleted_events": r_ev.deleted_count,
        "deleted_profiles": r_up.deleted_count,
        "deleted_app_profiles": r_ap.deleted_count,
    }


@router.get("/alerts")
async def get_alerts(
    limit: int = Query(50, ge=1, le=200),
    min_risk: float = Query(60.0, ge=0, le=100),
    db=Depends(get_database),
):
    """
    Return unacknowledged high-risk events as the active alert queue.
    Frontend AlertCenter uses this as the primary data source.
    """
    events = (
        await db.events.find({
            "risk_score": {"$gte": min_risk},
            "acknowledged": {"$ne": True},
        })
        .sort("risk_score", -1)
        .limit(limit)
        .to_list(length=limit)
    )
    return [{**e, "_id": str(e["_id"])} for e in events]


@router.post("/{event_id}/acknowledge")
async def acknowledge_event(
    event_id: str,
    db=Depends(get_database),
):
    """Mark an alert event as acknowledged by the admin."""
    from bson import ObjectId
    try:
        oid = ObjectId(event_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid event ID")

    from datetime import timezone
    result = await db.events.update_one(
        {"_id": oid},
        {"$set": {
            "acknowledged": True,
            "acknowledged_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"ok": True, "event_id": event_id}
