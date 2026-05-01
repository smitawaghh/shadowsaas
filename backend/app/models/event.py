from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class EventBase(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    source_ip: str
    destination_ip: str
    source_port: Optional[int] = None
    destination_port: Optional[int] = None
    protocol: str = Field(..., description="e.g., TCP, UDP")
    app_name: Optional[str] = None
    bytes_sent: int = 0
    bytes_received: int = 0
    risk_score: float = 0.0

class EventCreate(EventBase):
    pass

class EventInDB(EventBase):
    id: str = Field(alias="_id")

    class Config:
        populate_by_name = True
