import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

async def setup_database():
    print(f"Connecting to MongoDB at {settings.MONGODB_URL} to run setup...")
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    
    collections = await db.list_collection_names()
    
    # Required collections based on specifications
    target_collections = ["events", "users", "apps", "policies"]
    
    # 1. Ensure capped collection for audit_logs exists
    if "audit_logs" not in collections:
        print("Creating capped collection for audit_logs (size: 50MB)...")
        # 50MB capped collection
        await db.create_collection("audit_logs", capped=True, size=52428800)
        print("Successfully created capped collection: audit_logs")
    else:
        print("Collection 'audit_logs' already exists.")
        
    # 2. Ensure standard collections exist
    for col in target_collections:
        if col not in collections:
            print(f"Creating standard collection: {col}...")
            await db.create_collection(col)
            print(f"Successfully created collection: {col}")
        else:
            print(f"Collection '{col}' already exists.")
            
    print("Database setup complete.")
    client.close()

if __name__ == "__main__":
    asyncio.run(setup_database())
