"""
Admin API routes for user management, settings, and usage tracking.
"""

import hashlib
import json
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from database import (
    get_db, User, UsageLog, SystemSettings, CreditTransaction, LoginLog,
    get_setting, set_setting
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ── Pydantic Models ─────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    is_admin: bool = False
    credits: int = 10


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None
    credits: Optional[int] = None


class PasswordReset(BaseModel):
    new_password: str


class CreditAdjustment(BaseModel):
    amount: int
    description: Optional[str] = None


class SettingUpdate(BaseModel):
    value: str


class AdminLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_admin: bool
    is_active: bool
    credits: int
    total_credits_used: int
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


class UsageLogResponse(BaseModel):
    id: int
    user_id: int
    username: str
    action_type: str
    credits_used: int
    file_type: Optional[str]
    file_name: Optional[str]
    details: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class SettingResponse(BaseModel):
    id: int
    setting_key: str
    setting_value: Optional[str]
    setting_type: str
    description: Optional[str]
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Helper Functions ────────────────────────────────────────────

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def verify_admin(db: Session, username: str, password: str) -> Optional[User]:
    """Verify admin credentials."""
    user = db.query(User).filter(User.username == username).first()
    if user and user.is_admin and user.password_hash == hash_password(password):
        return user
    return None


# ── Admin Authentication ────────────────────────────────────────

@router.post("/login")
def admin_login(data: AdminLogin, db: Session = Depends(get_db)):
    """Admin login endpoint."""
    user = verify_admin(db, data.username, data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    
    user.last_login = datetime.utcnow()
    db.commit()
    
    return {
        "success": True,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_admin": user.is_admin,
        }
    }


# ── User Management ─────────────────────────────────────────────

@router.get("/users", response_model=List[UserResponse])
def list_users(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List all users with optional search."""
    query = db.query(User)
    if search:
        query = query.filter(
            (User.username.contains(search)) | (User.email.contains(search))
        )
    users = query.offset(skip).limit(limit).all()
    return users


@router.get("/users/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    """Get a specific user by ID."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/users", response_model=UserResponse)
def create_user(user_data: UserCreate, db: Session = Depends(get_db)):
    """Create a new user."""
    # Check if username or email already exists
    existing = db.query(User).filter(
        (User.username == user_data.username) | (User.email == user_data.email)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")
    
    user = User(
        username=user_data.username,
        email=user_data.email,
        password_hash=hash_password(user_data.password),
        is_admin=user_data.is_admin,
        credits=user_data.credits,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(user_id: int, user_data: UserUpdate, db: Session = Depends(get_db)):
    """Update user details."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user_data.email is not None:
        user.email = user_data.email
    if user_data.is_admin is not None:
        user.is_admin = user_data.is_admin
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
    if user_data.credits is not None:
        user.credits = user_data.credits
    
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    """Delete a user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.username == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete default admin user")
    
    db.delete(user)
    db.commit()
    return {"success": True, "message": "User deleted"}


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, data: PasswordReset, db: Session = Depends(get_db)):
    """Reset a user's password."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"success": True, "message": "Password reset successfully"}


# ── Credit Management ───────────────────────────────────────────

@router.post("/users/{user_id}/credits")
def adjust_credits(
    user_id: int,
    data: CreditAdjustment,
    admin_id: int = Query(..., description="Admin user ID performing the action"),
    db: Session = Depends(get_db)
):
    """Add or deduct credits for a user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update user credits
    user.credits += data.amount
    if user.credits < 0:
        user.credits = 0
    
    # Log the transaction
    transaction = CreditTransaction(
        user_id=user_id,
        amount=data.amount,
        transaction_type="admin_add" if data.amount > 0 else "admin_deduct",
        description=data.description or f"Admin adjustment: {data.amount} credits",
        performed_by=admin_id,
    )
    db.add(transaction)
    db.commit()
    
    return {
        "success": True,
        "new_balance": user.credits,
        "adjustment": data.amount,
    }


@router.get("/users/{user_id}/credits/history")
def get_credit_history(user_id: int, db: Session = Depends(get_db)):
    """Get credit transaction history for a user."""
    transactions = db.query(CreditTransaction).filter(
        CreditTransaction.user_id == user_id
    ).order_by(desc(CreditTransaction.created_at)).limit(100).all()
    
    return [
        {
            "id": t.id,
            "amount": t.amount,
            "type": t.transaction_type,
            "description": t.description,
            "created_at": t.created_at,
        }
        for t in transactions
    ]


# ── Usage Tracking ──────────────────────────────────────────────

@router.get("/usage")
def get_usage_logs(
    skip: int = 0,
    limit: int = 100,
    user_id: Optional[int] = None,
    action_type: Optional[str] = None,
    days: int = 30,
    db: Session = Depends(get_db)
):
    """Get usage logs with filters."""
    query = db.query(UsageLog, User.username).join(User)
    
    # Filter by date range
    start_date = datetime.utcnow() - timedelta(days=days)
    query = query.filter(UsageLog.created_at >= start_date)
    
    if user_id:
        query = query.filter(UsageLog.user_id == user_id)
    if action_type:
        query = query.filter(UsageLog.action_type == action_type)
    
    results = query.order_by(desc(UsageLog.created_at)).offset(skip).limit(limit).all()
    
    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "username": username,
            "action_type": log.action_type,
            "credits_used": log.credits_used,
            "file_type": log.file_type,
            "file_name": log.file_name,
            "details": log.details,
            "created_at": log.created_at,
        }
        for log, username in results
    ]


@router.get("/usage/stats")
def get_usage_stats(days: int = 30, db: Session = Depends(get_db)):
    """Get aggregated usage statistics."""
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Total usage
    total_usage = db.query(func.sum(UsageLog.credits_used)).filter(
        UsageLog.created_at >= start_date
    ).scalar() or 0
    
    # Usage by action type
    usage_by_type = db.query(
        UsageLog.action_type,
        func.count(UsageLog.id).label("count"),
        func.sum(UsageLog.credits_used).label("credits")
    ).filter(
        UsageLog.created_at >= start_date
    ).group_by(UsageLog.action_type).all()
    
    # Top users by usage
    top_users = db.query(
        User.username,
        func.sum(UsageLog.credits_used).label("credits")
    ).join(UsageLog).filter(
        UsageLog.created_at >= start_date
    ).group_by(User.id).order_by(desc("credits")).limit(10).all()
    
    # Daily usage trend
    daily_usage = db.query(
        func.date(UsageLog.created_at).label("date"),
        func.sum(UsageLog.credits_used).label("credits")
    ).filter(
        UsageLog.created_at >= start_date
    ).group_by(func.date(UsageLog.created_at)).all()
    
    # Total users
    total_users = db.query(func.count(User.id)).scalar()
    active_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar()
    
    return {
        "total_credits_used": total_usage,
        "usage_by_type": [
            {"type": t, "count": c, "credits": cr or 0}
            for t, c, cr in usage_by_type
        ],
        "top_users": [
            {"username": u, "credits": c or 0}
            for u, c in top_users
        ],
        "daily_usage": [
            {"date": str(d), "credits": c or 0}
            for d, c in daily_usage
        ],
        "total_users": total_users,
        "active_users": active_users,
    }


# ── System Settings ─────────────────────────────────────────────

@router.get("/settings")
def list_settings(db: Session = Depends(get_db)):
    """List all system settings."""
    settings = db.query(SystemSettings).all()
    return [
        {
            "id": s.id,
            "key": s.setting_key,
            "value": s.setting_value if s.setting_key != "openai_api_key" else "***" + (s.setting_value[-4:] if s.setting_value else ""),
            "type": s.setting_type,
            "description": s.description,
            "updated_at": s.updated_at,
        }
        for s in settings
    ]


@router.get("/settings/{key}")
def get_setting_value(key: str, db: Session = Depends(get_db)):
    """Get a specific setting value."""
    setting = db.query(SystemSettings).filter(SystemSettings.setting_key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    # Mask API key
    value = setting.setting_value
    if key == "openai_api_key" and value:
        value = "***" + value[-4:]
    
    return {
        "key": setting.setting_key,
        "value": value,
        "type": setting.setting_type,
        "description": setting.description,
    }


@router.put("/settings/{key}")
def update_setting(
    key: str,
    data: SettingUpdate,
    admin_id: int = Query(..., description="Admin user ID"),
    db: Session = Depends(get_db)
):
    """Update a system setting."""
    setting = db.query(SystemSettings).filter(SystemSettings.setting_key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    setting.setting_value = data.value
    setting.updated_by = admin_id
    setting.updated_at = datetime.utcnow()
    db.commit()
    
    return {"success": True, "message": f"Setting '{key}' updated"}


@router.post("/settings")
def create_setting(
    key: str,
    value: str,
    setting_type: str = "string",
    description: str = "",
    admin_id: int = Query(...),
    db: Session = Depends(get_db)
):
    """Create a new system setting."""
    existing = db.query(SystemSettings).filter(SystemSettings.setting_key == key).first()
    if existing:
        raise HTTPException(status_code=400, detail="Setting already exists")
    
    setting = SystemSettings(
        setting_key=key,
        setting_value=value,
        setting_type=setting_type,
        description=description,
        updated_by=admin_id,
    )
    db.add(setting)
    db.commit()
    
    return {"success": True, "message": f"Setting '{key}' created"}


# ── Login Logs ──────────────────────────────────────────────────

@router.get("/login-logs")
def get_login_logs(
    skip: int = 0,
    limit: int = 100,
    days: int = 7,
    db: Session = Depends(get_db)
):
    """Get login attempt logs."""
    start_date = datetime.utcnow() - timedelta(days=days)
    
    logs = db.query(LoginLog).filter(
        LoginLog.created_at >= start_date
    ).order_by(desc(LoginLog.created_at)).offset(skip).limit(limit).all()
    
    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "username": log.username,
            "ip_address": log.ip_address,
            "success": log.success,
            "created_at": log.created_at,
        }
        for log in logs
    ]


# ── Dashboard Stats ─────────────────────────────────────────────

@router.get("/dashboard")
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get admin dashboard overview stats."""
    # User stats
    total_users = db.query(func.count(User.id)).scalar()
    active_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar()
    admin_users = db.query(func.count(User.id)).filter(User.is_admin == True).scalar()
    
    # Credit stats
    total_credits_available = db.query(func.sum(User.credits)).scalar() or 0
    total_credits_used = db.query(func.sum(User.total_credits_used)).scalar() or 0
    
    # Usage stats (last 30 days)
    start_date = datetime.utcnow() - timedelta(days=30)
    recent_usage = db.query(func.sum(UsageLog.credits_used)).filter(
        UsageLog.created_at >= start_date
    ).scalar() or 0
    
    reconciliation_count = db.query(func.count(UsageLog.id)).filter(
        UsageLog.action_type == "reconciliation",
        UsageLog.created_at >= start_date
    ).scalar()
    
    llm_calls = db.query(func.count(UsageLog.id)).filter(
        UsageLog.action_type == "llm_extraction",
        UsageLog.created_at >= start_date
    ).scalar()
    
    # Recent logins
    recent_logins = db.query(func.count(LoginLog.id)).filter(
        LoginLog.created_at >= start_date,
        LoginLog.success == True
    ).scalar()
    
    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "admins": admin_users,
        },
        "credits": {
            "available": total_credits_available,
            "used_total": total_credits_used,
            "used_30d": recent_usage,
        },
        "usage_30d": {
            "reconciliations": reconciliation_count,
            "llm_calls": llm_calls,
            "total_credits": recent_usage,
        },
        "logins_30d": recent_logins,
    }
