from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class EventCreate(BaseModel):
    source_ip: str
    destination_ip: str
    source_port: int
    destination_port: int
    protocol: str
    app_name: str

    bytes_sent: int = Field(default=0, description="Total bytes uploaded")
    bytes_received: int = Field(default=0, description="Total bytes downloaded")

    # ETA novelty features — computed by sniffer from flow analysis
    upload_download_ratio: float = Field(default=0.0, description="bytes_sent / bytes_received")
    packet_size_variance: float = Field(default=0.0, description="Variance in packet sizes within flow")
    inter_arrival_time: float = Field(default=0.0, description="Average time (s) between packets")

    # Pre-labeled by sniffer (optional override) — model re-evaluates on ingest
    is_anomalous: Optional[bool] = Field(default=None)
    risk_score: Optional[float] = Field(default=None, ge=0.0, le=100.0)


class EventInDB(EventCreate):
    model_config = ConfigDict(populate_by_name=True, extra='ignore')

    id: Optional[str] = Field(None, alias="_id")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    user_id: Optional[str] = None
    risk_level: Optional[str] = None
    risk_reasons: Optional[list] = None
    is_genai_exfiltration: bool = False
