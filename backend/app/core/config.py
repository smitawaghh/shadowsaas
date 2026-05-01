from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Shadow SaaS Detection System"
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "shadowsaas"
    
    class Config:
        env_file = ".env"

settings = Settings()
