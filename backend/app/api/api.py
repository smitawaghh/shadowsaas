from fastapi import APIRouter
from app.api.routes import events, apps, auth, users, analytics, ml, policies, export, response, audit

api_router = APIRouter()

api_router.include_router(auth.router,     tags=["authentication"])
api_router.include_router(users.router,    tags=["user-management"])
api_router.include_router(events.router,   prefix="/events",  tags=["events"])
api_router.include_router(apps.router,     prefix="/apps",    tags=["apps"])
api_router.include_router(analytics.router,                   tags=["analytics"])
api_router.include_router(ml.router,                          tags=["ml"])
api_router.include_router(policies.router,                    tags=["policies"])
api_router.include_router(export.router,                      tags=["export"])
api_router.include_router(response.router,                    tags=["response"])
api_router.include_router(audit.router,                       tags=["audit"])
