from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    username: str
    department: Optional[str] = None
    overall_risk_score: float = 0.0
    last_active: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(UserBase):
    pass

class UserInDB(UserBase):
    id: str = Field(alias="_id")

    class Config:
        populate_by_name = True
