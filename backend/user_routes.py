"""
User API routes for authentication, dashboard, and usage tracking.
"""

import hashlib
import json
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from database import (
    get_db, User, UsageLog, CreditTransaction, LoginLog, get_setting
)

router = APIRouter(prefix="/api/user", tags=["user"])


# ── Pydantic Models ─────────────────────────────────────────────

class UserLogin(BaseModel):
    username: str
    password: str
    ip: Optional[str] = None
    mac_address: Optional[str] = None
    machine_id: Optional[str] = None


class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class UserProfileResponse(BaseModel):
    id: int
    username: str
    email: str
    credits: int
    total_credits_used: int
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


# ── Helper Functions ────────────────────────────────────────────

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def verify_user(db: Session, username: str, password: str) -> Optional[User]:
    """Verify user credentials."""
    user = db.query(User).filter(User.username == username).first()
    if user and user.is_active and user.password_hash == hash_password(password):
        return user
    return None


def log_login_attempt(db: Session, username: str, user_id: int = None, 
                      success: bool = False, ip: str = None, 
                      mac_address: str = None, machine_id: str = None):
    """Log a login attempt."""
    log = LoginLog(
        user_id=user_id,
        username=username,
        ip_address=ip,
        mac_address=mac_address,
        machine_id=machine_id,
        success=success,
    )
    db.add(log)
    db.commit()


# ── Authentication ──────────────────────────────────────────────

@router.post("/login")
def user_login(data: UserLogin, db: Session = Depends(get_db)):
    """User login endpoint."""
    user = verify_user(db, data.username, data.password)
    
    if not user:
        # Log failed attempt
        log_login_attempt(db, data.username, success=False, 
                         ip=data.ip, mac_address=data.mac_address, 
                         machine_id=data.machine_id)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Log successful login
    log_login_attempt(db, data.username, user_id=user.id, success=True,
                     ip=data.ip, mac_address=data.mac_address,
                     machine_id=data.machine_id)
    
    user.last_login = datetime.utcnow()
    db.commit()
    
    return {
        "success": True,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_admin": user.is_admin,
            "credits": user.credits,
        }
    }


@router.post("/register")
def user_register(data: UserRegister, db: Session = Depends(get_db)):
    """User registration endpoint."""
    # Check if username or email already exists
    existing = db.query(User).filter(
        (User.username == data.username) | (User.email == data.email)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")
    
    # Get default credits from settings
    default_credits = int(get_setting(db, "default_user_credits") or "10")
    
    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        credits=default_credits,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return {
        "success": True,
        "message": "Registration successful",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "credits": user.credits,
        }
    }


# ── User Profile ────────────────────────────────────────────────

@router.get("/profile/{user_id}")
def get_profile(user_id: int, db: Session = Depends(get_db)):
    """Get user profile."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "credits": user.credits,
        "total_credits_used": user.total_credits_used,
        "created_at": user.created_at,
        "last_login": user.last_login,
    }


@router.post("/profile/{user_id}/change-password")
def change_password(user_id: int, data: PasswordChange, db: Session = Depends(get_db)):
    """Change user password."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.password_hash != hash_password(data.current_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    user.password_hash = hash_password(data.new_password)
    db.commit()
    
    return {"success": True, "message": "Password changed successfully"}


# ── User Dashboard ──────────────────────────────────────────────

@router.get("/dashboard/{user_id}")
def get_user_dashboard(user_id: int, db: Session = Depends(get_db)):
    """Get user dashboard data."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Usage stats (last 30 days)
    start_date = datetime.utcnow() - timedelta(days=30)
    
    recent_usage = db.query(func.sum(UsageLog.credits_used)).filter(
        UsageLog.user_id == user_id,
        UsageLog.created_at >= start_date
    ).scalar() or 0
    
    reconciliation_count = db.query(func.count(UsageLog.id)).filter(
        UsageLog.user_id == user_id,
        UsageLog.action_type == "reconciliation",
        UsageLog.created_at >= start_date
    ).scalar()
    
    llm_calls = db.query(func.count(UsageLog.id)).filter(
        UsageLog.user_id == user_id,
        UsageLog.action_type == "llm_extraction",
        UsageLog.created_at >= start_date
    ).scalar()
    
    # Daily usage trend
    daily_usage = db.query(
        func.date(UsageLog.created_at).label("date"),
        func.sum(UsageLog.credits_used).label("credits")
    ).filter(
        UsageLog.user_id == user_id,
        UsageLog.created_at >= start_date
    ).group_by(func.date(UsageLog.created_at)).all()
    
    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "credits": user.credits,
            "total_credits_used": user.total_credits_used,
        },
        "usage_30d": {
            "reconciliations": reconciliation_count,
            "llm_calls": llm_calls,
            "total_credits": recent_usage,
        },
        "daily_usage": [
            {"date": str(d), "credits": c or 0}
            for d, c in daily_usage
        ],
    }


@router.get("/usage/{user_id}")
def get_user_usage(
    user_id: int,
    skip: int = 0,
    limit: int = 50,
    days: int = 30,
    db: Session = Depends(get_db)
):
    """Get user's usage history."""
    start_date = datetime.utcnow() - timedelta(days=days)
    
    logs = db.query(UsageLog).filter(
        UsageLog.user_id == user_id,
        UsageLog.created_at >= start_date
    ).order_by(desc(UsageLog.created_at)).offset(skip).limit(limit).all()
    
    return [
        {
            "id": log.id,
            "action_type": log.action_type,
            "credits_used": log.credits_used,
            "file_type": log.file_type,
            "file_name": log.file_name,
            "details": log.details,
            "created_at": log.created_at,
        }
        for log in logs
    ]


@router.get("/credits/{user_id}")
def get_user_credits(user_id: int, db: Session = Depends(get_db)):
    """Get user's credit balance and recent transactions."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Recent credit transactions
    transactions = db.query(CreditTransaction).filter(
        CreditTransaction.user_id == user_id
    ).order_by(desc(CreditTransaction.created_at)).limit(20).all()
    
    return {
        "balance": user.credits,
        "total_used": user.total_credits_used,
        "transactions": [
            {
                "id": t.id,
                "amount": t.amount,
                "type": t.transaction_type,
                "description": t.description,
                "created_at": t.created_at,
            }
            for t in transactions
        ]
    }


# ── Credit Check ────────────────────────────────────────────────

@router.get("/check-credits/{user_id}")
def check_credits(user_id: int, required: int = 1, db: Session = Depends(get_db)):
    """Check if user has enough credits."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    has_credits = user.credits >= required
    
    return {
        "has_credits": has_credits,
        "balance": user.credits,
        "required": required,
    }
