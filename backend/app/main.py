import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import connect_to_mongo, close_mongo_connection, create_indices
from app.core.ws_manager import ws_manager
from app.api.api import api_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # ── Database ───────────────────────────────────────────────────────────────
    await connect_to_mongo()
    await create_indices()

    # ── Background services ────────────────────────────────────────────────────
    from app.services.policy_engine  import policy_enforcement_loop
    from app.services.ueba           import ueba_baseline_loop
    from app.services.ml_auto_train  import ml_auto_train_loop

    tasks = [
        asyncio.create_task(policy_enforcement_loop(), name="policy-engine"),
        asyncio.create_task(ueba_baseline_loop(),      name="ueba-baseline"),
        asyncio.create_task(ml_auto_train_loop(),      name="ml-auto-train"),
    ]
    logger.info("ShadowSaaS backend ready — WebSocket at /ws/events")

    yield

    # ── Shutdown ───────────────────────────────────────────────────────────────
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    await close_mongo_connection()


app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=lifespan,
    description=(
        "ML-powered Shadow IT & GenAI DLP detection — "
        "real-time WebSocket streaming, UEBA baselines, policy enforcement"
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "project": settings.PROJECT_NAME}


@app.websocket("/ws/events")
async def websocket_events(ws: WebSocket):
    """
    Real-time event stream.  Connect with:
        const ws = new WebSocket('ws://localhost:8000/ws/events');
    Each message is JSON: { type: "event" | "policy_alert", data: { ... } }
    """
    await ws_manager.connect(ws)
    try:
        while True:
            await ws.receive_text()   # keep alive; client sends pings
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)


app.include_router(api_router, prefix="/api")
