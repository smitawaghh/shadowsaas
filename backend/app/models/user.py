"""
User Model - Phase 4 OAuth2 + Phase 3 dynamic_risk_score with exponential decay.
Location: backend/app/models/user.py
"""

import math
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict, computed_field


class UserBase(BaseModel):
    username: str
    email: str
    department: Optional[str] = None
    is_admin: bool = False

    model_config = ConfigDict(str_strip_whitespace=True)


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class UserInDB(UserBase):
    model_config = ConfigDict(populate_by_name=True, extra='ignore')

    id: Optional[str] = Field(None, alias="_id")
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

    # Phase 3: Risk scoring fields
    risk_score: float = Field(
        default=0.0, ge=0.0, le=100.0,
        description="Stored risk score (0-100). Decays over time via dynamic_risk_score."
    )
    risk_last_updated: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp when risk_score was last updated by ML pipeline"
    )
    anomaly_count: int = Field(default=0, ge=0, description="Cumulative anomalous events")
    normal_event_count: int = Field(default=0, ge=0, description="Cumulative normal events")
    last_seen: Optional[datetime] = None

    # Phase 4: OAuth fields
    oauth_provider: Optional[str] = None
    oauth_id: Optional[str] = None
    refresh_token: Optional[str] = None

    @computed_field
    @property
    def dynamic_risk_score(self) -> float:
        """
        Risk score with exponential time decay.
        Half-life ≈ 7 days (λ=0.1/day).
        A user with risk=80 who behaves normally for 7 days drops to ~44.
        """
        days_elapsed = (datetime.utcnow() - self.risk_last_updated).total_seconds() / 86400.0
        decay_factor = math.exp(-0.1 * days_elapsed)
        return round(max(0.0, self.risk_score * decay_factor), 2)


class UserResponse(UserBase):
    model_config = ConfigDict(populate_by_name=True, extra='ignore')

    id: Optional[str] = Field(None, alias="_id")
    is_active: bool
    created_at: datetime
    department: Optional[str] = None
    is_admin: bool


class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int = 3600


class TokenData(BaseModel):
    username: Optional[str] = None
    user_id: Optional[str] = None
    is_admin: bool = False
    department: Optional[str] = None
