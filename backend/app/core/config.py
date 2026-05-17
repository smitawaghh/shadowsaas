from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "ShadowSaaS Detection System"
    MONGODB_URL:  str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "shadowsaas"

    # JWT
    SECRET_KEY: str = "shadow-saas-change-me-in-production-abc123xyz"
    ALGORITHM:  str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # ── Sniffer authentication ─────────────────────────────────────────────
    # Shared secret between packet_sniffer.py and the backend.
    # Set SNIFFER_API_KEY in .env to a random 32-char string.
    # If left empty, the ingest endpoint is UNAUTHENTICATED (dev only).
    SNIFFER_API_KEY: str = ""

    # ── Data retention ─────────────────────────────────────────────────────
    # Events older than this are automatically deleted by MongoDB TTL index.
    EVENT_RETENTION_DAYS: int = 90

    # ── Push notifications ─────────────────────────────────────────────────
    # Email (SMTP)
    SMTP_HOST:     str = ""
    SMTP_PORT:     int = 587
    SMTP_USER:     str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM:     str = "shadowsaas@yourdomain.com"
    ALERT_EMAIL_TO: str = ""   # comma-separated list of recipient addresses

    # Slack / generic webhook  (POST JSON payload)
    WEBHOOK_URL:   str = ""    # e.g. https://hooks.slack.com/services/xxx/yyy/zzz

    # Minimum risk score that triggers a push notification
    NOTIFY_THRESHOLD: float = 75.0

    # ── Policy engine ──────────────────────────────────────────────────────
    POLICY_EVAL_INTERVAL_SECONDS: int = 60

    # ── UEBA baseline ──────────────────────────────────────────────────────
    UEBA_BASELINE_DAYS:          int   = 14   # days of history to build baseline
    UEBA_DEVIATION_THRESHOLD:    float = 2.5  # sigma before raising UEBA alert
    UEBA_RECOMPUTE_INTERVAL_SEC: int   = 3600 # recompute baselines every hour

    # ── ML auto-training ──────────────────────────────────────────────────
    ML_AUTO_TRAIN:               bool  = True
    ML_TRAIN_INTERVAL_SEC:       int   = 86400  # 24 h
    ML_MIN_EVENTS_TO_TRAIN:      int   = 50

    # CORS — set CORS_ORIGINS env var as JSON list to add production URLs
    # e.g. '["https://shadowsaas.vercel.app","http://localhost:5173"]'
    CORS_ORIGINS: list = ["http://localhost:3000", "http://localhost:5173"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
