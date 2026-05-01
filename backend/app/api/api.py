from fastapi import APIRouter
from app.api.routes import events, apps

api_router = APIRouter()

api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(apps.router, prefix="/apps", tags=["apps"])
