from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime

class AppProfileBase(BaseModel):
    name: str
    category: Optional[str] = None
    trust_score: float = 100.0
    is_sanctioned: bool = False
    known_vulnerabilities: List[str] = []
    last_detected: datetime = Field(default_factory=datetime.utcnow)

class AppProfileCreate(AppProfileBase):
    pass

class AppProfileInDB(AppProfileBase):
    model_config = ConfigDict(populate_by_name=True)
    id: str = Field(alias="_id")
