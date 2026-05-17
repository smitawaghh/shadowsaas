# backend/app/api/routes/policies.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime
import logging

from app.core.auth import get_current_user
from app.core.database import get_database

logger = logging.getLogger(__name__)
router = APIRouter()

class PolicyCreate(BaseModel):
    name: str
    description: str
    conditions: dict
    action: str  # alert, block, quarantine, log_only

@router.post("/policies")
async def create_policy(
    policy: PolicyCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create new security policy"""
    if not current_user.get('is_admin'):
        raise HTTPException(status_code=403)
    
    try:
        db = get_database()
        
        policy_doc = {
            'name': policy.name,
            'description': policy.description,
            'conditions': policy.conditions,
            'action': policy.action,
            'is_active': True,
            'created_by': current_user['username'],
            'created_at': datetime.utcnow()
        }
        
        result = await db.policies.insert_one(policy_doc)

        return {
            'id': str(result.inserted_id),
            'name': policy_doc['name'],
            'description': policy_doc['description'],
            'conditions': policy_doc['conditions'],
            'action': policy_doc['action'],
            'is_active': policy_doc['is_active'],
            'created_by': policy_doc['created_by'],
        }
        
    except Exception as e:
        logger.error(f"Policy creation error: {e}")
        raise HTTPException(status_code=500)

@router.get("/policies")
async def list_policies(current_user: dict = Depends(get_current_user)):
    """List all policies"""
    try:
        db = get_database()
        policies = await db.policies.find({'is_active': True}).to_list(length=None)
        for p in policies:
            p['_id'] = str(p['_id'])
        return policies
    except Exception as e:
        logger.error(f"Error listing policies: {e}")
        raise HTTPException(status_code=500)