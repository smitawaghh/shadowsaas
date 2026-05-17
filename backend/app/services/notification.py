"""
Push Notification Service.

Sends alerts via two channels when a critical event is ingested:
  • Email (SMTP)    — STARTTLS on port 587, disabled if SMTP_HOST is empty
  • Webhook (POST)  — Slack / Teams / generic JSON, disabled if WEBHOOK_URL is empty

Both channels are fire-and-forget asyncio Tasks started from the ingest pipeline.
Neither will ever raise — a notification failure must not abort ingestion.
"""

import asyncio
import logging
import smtplib
import ssl
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


# ── SMTP email ────────────────────────────────────────────────────────────────

def _send_smtp_sync(subject: str, html_body: str, recipients: list) -> None:
    """Blocking SMTP send — runs in a thread-pool executor."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = settings.SMTP_FROM
    msg["To"]      = ", ".join(recipients)
    msg.attach(MIMEText(html_body, "html"))

    ctx = ssl.create_default_context()
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
        smtp.ehlo()
        smtp.starttls(context=ctx)
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.sendmail(settings.SMTP_FROM, recipients, msg.as_string())


async def send_email_alert(event: dict) -> None:
    """Async wrapper — never raises."""
    if not settings.SMTP_HOST or not settings.ALERT_EMAIL_TO:
        return

    recipients = [r.strip() for r in settings.ALERT_EMAIL_TO.split(",") if r.strip()]
    if not recipients:
        return

    app   = event.get("app_name", "Unknown")
    ip    = event.get("source_ip", "?")
    risk  = event.get("risk_score", 0)
    ts    = event.get("timestamp", datetime.utcnow().isoformat())
    level = event.get("risk_level", "?")
    dev   = event.get("device_name") or "Unknown"

    reasons_html = "".join(
        f"<li>{r}</li>" for r in event.get("risk_reasons", [])
    ) or "<li>High-risk network event detected</li>"

    subject = f"[ShadowSaaS ALERT] {app} — Risk {risk:.0f}/100 from {ip}"

    html_body = f"""
<html><body style="font-family:Arial,sans-serif;color:#222;max-width:600px">
<div style="background:#c0392b;color:#fff;padding:16px;border-radius:6px 6px 0 0">
  <h2 style="margin:0">&#9888; ShadowSaaS Security Alert</h2>
</div>
<div style="border:1px solid #ddd;border-top:none;padding:16px;border-radius:0 0 6px 6px">
  <table cellpadding="8" style="border-collapse:collapse;width:100%">
    <tr style="background:#f8f8f8"><th style="text-align:left;width:140px">Field</th><th style="text-align:left">Value</th></tr>
    <tr><td><b>Application</b></td><td>{app}</td></tr>
    <tr style="background:#f8f8f8"><td><b>Source IP</b></td><td>{ip}</td></tr>
    <tr><td><b>Device</b></td><td>{dev}</td></tr>
    <tr style="background:#f8f8f8"><td><b>Risk Score</b></td><td style="color:#c0392b;font-weight:bold">{risk:.1f} / 100</td></tr>
    <tr><td><b>Risk Level</b></td><td>{level}</td></tr>
    <tr style="background:#f8f8f8"><td><b>Timestamp</b></td><td>{ts}</td></tr>
  </table>
  <h3 style="margin-top:20px">Risk Factors</h3>
  <ul style="margin:0 0 16px 0">{reasons_html}</ul>
  <p style="color:#aaa;font-size:11px;margin:0">Sent by ShadowSaaS Detection System &mdash; do not reply.</p>
</div>
</body></html>
"""

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send_smtp_sync, subject, html_body, recipients)
        logger.info(f"[NOTIFY] Email → {recipients}  risk={risk:.1f}")
    except Exception as exc:
        logger.warning(f"[NOTIFY] Email failed (non-fatal): {exc}")


# ── Webhook (Slack / Teams / generic) ────────────────────────────────────────

async def send_webhook_alert(event: dict) -> None:
    """POST a JSON alert payload to the configured webhook URL — never raises."""
    if not settings.WEBHOOK_URL:
        return

    app     = event.get("app_name", "Unknown")
    ip      = event.get("source_ip", "?")
    risk    = event.get("risk_score", 0)
    level   = event.get("risk_level", "?")
    reasons = ", ".join(event.get("risk_reasons", [])) or "High-risk activity"

    # Slack Block Kit payload (also understood by most generic webhooks)
    payload = {
        "text": f"[ShadowSaaS] {app} — Risk {risk:.0f}/100 from {ip}",
        "blocks": [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": "⚠️ ShadowSaaS Security Alert"},
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*App:*\n{app}"},
                    {"type": "mrkdwn", "text": f"*Source IP:*\n`{ip}`"},
                    {"type": "mrkdwn", "text": f"*Risk Score:*\n*{risk:.0f}/100*"},
                    {"type": "mrkdwn", "text": f"*Level:*\n{level}"},
                    {"type": "mrkdwn", "text": f"*Device:*\n{event.get('device_name') or 'Unknown'}"},
                    {"type": "mrkdwn", "text": f"*Timestamp:*\n{event.get('timestamp', '')}"},
                ],
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Risk Factors:*\n{reasons}"},
            },
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.post(settings.WEBHOOK_URL, json=payload)
            r.raise_for_status()
        logger.info(f"[NOTIFY] Webhook sent  risk={risk:.1f}")
    except Exception as exc:
        logger.warning(f"[NOTIFY] Webhook failed (non-fatal): {exc}")


# ── Public API ────────────────────────────────────────────────────────────────

def maybe_notify(event: dict) -> None:
    """
    Called from the ingest pipeline after risk scoring.

    Fires email + webhook as independent asyncio Tasks — they run concurrently
    in the background and never block or raise in the calling coroutine.
    Only fires when risk_score >= NOTIFY_THRESHOLD.
    """
    if event.get("risk_score", 0) < settings.NOTIFY_THRESHOLD:
        return
    asyncio.create_task(send_email_alert(event))
    asyncio.create_task(send_webhook_alert(event))
