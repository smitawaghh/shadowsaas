from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.core.database import connect_to_mongo, close_mongo_connection
from app.core.config import settings
from app.api.api import api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup event
    await connect_to_mongo()
    yield
    # Shutdown event
    await close_mongo_connection()

app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "project": settings.PROJECT_NAME}

app.include_router(api_router, prefix="/api")
