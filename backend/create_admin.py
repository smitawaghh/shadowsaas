import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.core.security import get_password_hash
from app.models.user import UserCreate
from datetime import datetime

async def create_admin():
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    
    # Check if admin exists
    existing = await db.users.find_one({"username": "admin@soc.local"})
    if existing:
        print("Admin user already exists!")
    else:
        # Create admin
        user_dict = {
            "username": "admin@soc.local",
            "email": "admin@soc.local",
            "full_name": "System Administrator",
            "department": "Security Operations",
            "hashed_password": get_password_hash("admin123"),
            "is_active": True,
            "is_admin": True,
            "created_at": datetime.utcnow()
        }
        await db.users.insert_one(user_dict)
        print("Successfully created default admin account (admin@soc.local / admin123)")
        
    client.close()

if __name__ == "__main__":
    asyncio.run(create_admin())
