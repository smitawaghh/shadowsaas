import asyncio
import httpx
from app.main import app
from app.core.database import connect_to_mongo, close_mongo_connection

async def test_login():
    await connect_to_mongo()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        try:
            response = await ac.post("/api/auth/token", data={"username": "admin@soc.local", "password": "admin123"}, headers={"Content-Type": "application/x-www-form-urlencoded"})
            print("STATUS:", response.status_code)
            print("BODY:", response.text)
        except Exception as e:
            import traceback
            traceback.print_exc()
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(test_login())
