"""
WebSocket connection manager — singleton shared across the FastAPI app.
Import `ws_manager` and call `await ws_manager.broadcast(data)` from any route.
"""
import logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self._connections: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.add(ws)
        logger.info(f"WS client connected ({len(self._connections)} total)")

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.discard(ws)
        logger.info(f"WS client disconnected ({len(self._connections)} remaining)")

    async def broadcast(self, data: dict) -> None:
        """Send JSON to all connected clients; silently drop dead connections."""
        dead: set[WebSocket] = set()
        for ws in self._connections:
            try:
                await ws.send_json(data)
            except Exception:
                dead.add(ws)
        self._connections -= dead


ws_manager = ConnectionManager()
