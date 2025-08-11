from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os

app = FastAPI(title="GuardDog AI Scoring API", version="1.0.0")

class ScoringRequest(BaseModel):
    shop: str
    topic: str
    webhook_id: str
    api_version: str
    triggered_at: str
    correlation_id: str
    order_id: Optional[str] = None
    placed_at: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    email_hash: Optional[str] = None
    device_hash: Optional[str] = None
    browser_ip: Optional[str] = None
    billing_country: Optional[str] = None
    shipping_country: Optional[str] = None
    bin: Optional[str] = None
    avs: Optional[str] = None
    cvv: Optional[str] = None
    line_count: Optional[int] = None

class ScoringResponse(BaseModel):
    risk: int
    advice: str
    psd2: dict
    reasons: List[str]
    degraded: bool
    ts: str

@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}

@app.post("/score", response_model=ScoringResponse)
async def score_order(request: ScoringRequest):
    # TODO: Implement actual scoring logic
    return ScoringResponse(
        risk=34,
        advice="REVIEW",
        psd2={"tra_candidate": True, "why": ["low_amount", "low_velocity"]},
        reasons=["IP_BIN_COUNTRY_MISMATCH", "VELOCITY_1H=3"],
        degraded=False,
        ts=request.triggered_at
    )
