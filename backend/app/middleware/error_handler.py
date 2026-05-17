# backend/app/middleware/error_handler.py
import logging
from fastapi import Request
from starlette.responses import JSONResponse
from datetime import datetime

logger = logging.getLogger(__name__)

async def error_handler_middleware(request: Request, call_next):
    """Global error handling middleware"""
    try:
        # Add request ID
        request.state.request_id = request.headers.get("X-Request-ID", str(datetime.utcnow().timestamp()))
        
        response = await call_next(request)
        
        # Add security headers
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["X-Process-Time"] = str(response.headers.get("x-process-time", "N/A"))
        
        return response
        
    except Exception as e:
        logger.error(f"Request error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error",
                "request_id": request.state.request_id
            }
        )