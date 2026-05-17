"""
ML Auto-Training Service.

Schedules periodic re-training of the Isolation Forest on real event data
accumulated in MongoDB.  The updated model is hot-reloaded into the running
process so new predictions benefit from the latest traffic patterns immediately.

Configuration (.env / config.py):
  ML_AUTO_TRAIN           = true      # set false to disable
  ML_TRAIN_INTERVAL_SEC   = 86400     # 24 h between training runs
  ML_MIN_EVENTS_TO_TRAIN  = 50        # skip if fewer events exist
"""

import asyncio
import logging
from datetime import datetime
from pathlib import Path

from app.core.config import settings
from app.core.database import get_database

logger = logging.getLogger(__name__)

# Canonical model path shared with ml/model.py and the manual /ml/train endpoint
_MODEL_PATH = Path(__file__).resolve().parent.parent / "ml" / "isolation_forest.joblib"


async def _run_training() -> dict:
    """Pull all events from MongoDB, train, persist, and hot-reload."""
    import numpy as np
    from sklearn.ensemble import IsolationForest
    import joblib

    # Import the shared global detector instance
    from app.ml.model import detector

    db = get_database()
    events = await db.events.find({}).to_list(length=None)
    n = len(events)

    if n < settings.ML_MIN_EVENTS_TO_TRAIN:
        logger.info(
            f"[ML] Auto-train skipped — {n} events available, "
            f"need {settings.ML_MIN_EVENTS_TO_TRAIN}"
        )
        return {"skipped": True, "events": n, "threshold": settings.ML_MIN_EVENTS_TO_TRAIN}

    # Extract the 3 features used by the lightweight detector (ml/model.py)
    X = np.array(
        [
            [
                e.get("upload_download_ratio", 0.0),
                e.get("packet_size_variance", 0.0),
                e.get("inter_arrival_time", 0.0),
            ]
            for e in events
        ],
        dtype=float,
    )

    logger.info(f"[ML] Training IsolationForest on {n} events …")
    model = IsolationForest(contamination=0.1, random_state=42, n_estimators=150)
    model.fit(X)

    # Persist to disk
    _MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, _MODEL_PATH)

    # Hot-reload the in-process detector
    detector.model = model
    logger.info(f"[ML] Model saved and hot-reloaded  path={_MODEL_PATH}")

    # Also retrain the 5-feature AnomalyDetectionEngine if available
    try:
        from app.ml.anomaly_detection import get_anomaly_engine
        engine = get_anomaly_engine()
        success = await engine.fit(events, force=True)
        if success:
            logger.info("[ML] AnomalyDetectionEngine also retrained successfully")
    except Exception as exc:
        logger.debug(f"[ML] AnomalyEngine secondary retrain skipped: {exc}")

    return {
        "skipped":    False,
        "events":     n,
        "model_path": str(_MODEL_PATH),
        "trained_at": datetime.utcnow().isoformat(),
    }


async def ml_auto_train_loop() -> None:
    """
    Background coroutine — retrains the model on a fixed interval.
    Started once from main.py lifespan.

    Performs an initial training pass 60 s after startup (allowing the sniffer
    to deliver some events), then repeats every ML_TRAIN_INTERVAL_SEC.
    """
    if not settings.ML_AUTO_TRAIN:
        logger.info("[ML] Auto-training disabled (ML_AUTO_TRAIN=false)")
        return

    interval = settings.ML_TRAIN_INTERVAL_SEC
    logger.info(f"[ML] Auto-train loop started  (interval={interval}s)")

    # Initial pass after grace period
    await asyncio.sleep(60)
    try:
        result = await _run_training()
        logger.info(f"[ML] Startup training: {result}")
    except Exception as exc:
        logger.error(f"[ML] Startup training error: {exc}")

    while True:
        await asyncio.sleep(interval)
        try:
            result = await _run_training()
            logger.info(f"[ML] Scheduled training: {result}")
        except Exception as exc:
            logger.error(f"[ML] Auto-train error: {exc}")
