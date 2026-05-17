from fastapi import APIRouter, Depends, HTTPException, Request
import logging

from app.core.auth import get_current_user
from app.core.database import get_database
from app.core.audit import write_audit, get_admin_ip
from app.core.config import settings
from app.ml.anomaly_detection import get_anomaly_engine
from app.ml.model import detector

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/ml/model-info")
async def get_model_info(_: dict = Depends(get_current_user)):
    """Return metadata about the active pre-trained Isolation Forest model."""
    try:
        engine = get_anomaly_engine()
        info = engine.get_model_info()
        info["active_model"] = "isolation_forest.joblib"
        info["features"] = ["upload_download_ratio", "packet_size_variance", "inter_arrival_time"]
        info["model_ready"] = detector.model is not None
        return {"model": info}
    except Exception as e:
        logger.error(f"Model info error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ml/train")
async def train_anomaly_detector(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_database),
):
    """
    Retrain the Isolation Forest on all events in MongoDB and hot-reload.
    Admin only. Minimum events threshold is ML_MIN_EVENTS_TO_TRAIN (default 50).
    """
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")

    try:
        events = await db.events.find({}).to_list(length=None)
        n = len(events)

        if n < settings.ML_MIN_EVENTS_TO_TRAIN:
            raise HTTPException(
                status_code=400,
                detail=f"Need {settings.ML_MIN_EVENTS_TO_TRAIN}+ events to train, got {n}. "
                       "Run mock_traffic_generator.py first.",
            )

        import numpy as np
        from sklearn.ensemble import IsolationForest
        import joblib
        from pathlib import Path

        X = np.array([
            [
                e.get("upload_download_ratio", 0.0),
                e.get("packet_size_variance", 0.0),
                e.get("inter_arrival_time", 0.0),
            ]
            for e in events
        ], dtype=float)

        logger.info(f"Training Isolation Forest on {n} events...")
        model = IsolationForest(contamination=0.1, random_state=42, n_estimators=150)
        model.fit(X)

        # Save to canonical path and hot-reload
        model_path = (Path(__file__).resolve().parent.parent.parent / "ml" / "isolation_forest.joblib")
        model_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(model, model_path)
        detector.model = model

        await write_audit(
            db,
            admin=current_user.get("username", "unknown"),
            admin_ip=get_admin_ip(request),
            action="MODEL_RETRAIN",
            resource_type="MODEL",
            resource_id="isolation_forest.joblib",
            after={"samples": n, "estimators": 150},
            outcome="SUCCESS",
            detail=f"Manual retrain on {n} events via /ml/train",
        )

        return {
            "status": "success",
            "samples_used": n,
            "model_path": str(model_path),
            "message": f"Isolation Forest retrained on {n} events and hot-reloaded.",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Training error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
