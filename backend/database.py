"""
Database configuration and models for Ledger Reconciliation System.
Uses MySQL database: Ledger_Reconsile
"""

import os
import base64
from datetime import datetime
from urllib.parse import quote_plus
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

# Database configuration
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = os.environ.get("DB_PORT", "3306")
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_NAME = os.environ.get("DB_NAME", "Ledger_Reconsile")

# Use SQLite if DB_HOST is empty or 'sqlite', otherwise use MySQL
if not DB_HOST or DB_HOST.lower() == "sqlite":
    # SQLite fallback for local development/testing
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'ledger_reconcile.db')}"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # MySQL connection - URL encode password to handle special characters like @
    encoded_password = quote_plus(DB_PASSWORD)
    DATABASE_URL = f"mysql+pymysql://{DB_USER}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=3600)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ── Models ──────────────────────────────────────────────────────

class User(Base):
    """User model for authentication and credit tracking."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    encrypted_password = Column(String(500), nullable=True)  # Base64-encoded password for admin retrieval
    is_admin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    credits = Column(Integer, default=10)  # Default 10 credits for new users
    total_credits_used = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    # Relationships
    usage_logs = relationship("UsageLog", back_populates="user")


class UsageLog(Base):
    """Track each reconciliation/LLM usage."""
    __tablename__ = "usage_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action_type = Column(String(50), nullable=False)  # 'reconciliation', 'llm_extraction'
    credits_used = Column(Integer, default=1)
    file_type = Column(String(20), nullable=True)  # 'excel', 'pdf', 'image'
    file_name = Column(String(255), nullable=True)
    details = Column(Text, nullable=True)  # JSON string with additional info
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="usage_logs")


class SystemSettings(Base):
    """System-wide settings including OpenAI key and prompts."""
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    setting_key = Column(String(100), unique=True, index=True, nullable=False)
    setting_value = Column(Text, nullable=True)
    setting_type = Column(String(20), default="string")  # 'string', 'number', 'boolean', 'json'
    description = Column(String(500), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)


class CreditTransaction(Base):
    """Track credit additions and deductions."""
    __tablename__ = "credit_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(Integer, nullable=False)  # Positive for add, negative for deduct
    transaction_type = Column(String(50), nullable=False)  # 'admin_add', 'usage', 'refund', 'purchase'
    description = Column(String(500), nullable=True)
    performed_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # Admin who performed action
    created_at = Column(DateTime, default=datetime.utcnow)


class LoginLog(Base):
    """Track login attempts."""
    __tablename__ = "login_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    username = Column(String(100), nullable=False)
    ip_address = Column(String(50), nullable=True)
    mac_address = Column(String(50), nullable=True)
    machine_id = Column(String(255), nullable=True)
    success = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── Database Initialization ─────────────────────────────────────

def init_db():
    """Create all tables and initialize default settings."""
    Base.metadata.create_all(bind=engine)
    
    # Migrate: add encrypted_password column if it doesn't exist
    try:
        with engine.connect() as conn:
            from sqlalchemy import text, inspect
            inspector = inspect(engine)
            columns = [col['name'] for col in inspector.get_columns('users')]
            if 'encrypted_password' not in columns:
                if 'sqlite' in DATABASE_URL:
                    conn.execute(text("ALTER TABLE users ADD COLUMN encrypted_password VARCHAR(500)"))
                else:
                    conn.execute(text("ALTER TABLE users ADD COLUMN encrypted_password VARCHAR(500) NULL"))
                conn.commit()
                print("Migration: Added encrypted_password column to users table")
    except Exception as e:
        print(f"Migration check (encrypted_password): {e}")
    
    db = SessionLocal()
    try:
        # Check if admin user exists
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            # Create default admin user (password: admin123)
            import hashlib
            password_hash = hashlib.sha256("admin123".encode()).hexdigest()
            admin = User(
                username="admin",
                email="admin@ledgerreconcile.com",
                password_hash=password_hash,
                encrypted_password=base64.b64encode("admin123".encode()).decode(),
                is_admin=True,
                credits=999999,
            )
            db.add(admin)
            db.commit()
            print("Created default admin user: admin / admin123")

        # Initialize default system settings
        default_settings = [
            {
                "setting_key": "openai_api_key",
                "setting_value": "",
                "setting_type": "string",
                "description": "OpenAI API Key for GPT-4o-mini Vision"
            },
            {
                "setting_key": "extraction_prompt",
                "setting_value": """You are a financial data extraction expert. Analyze this image of a financial ledger, statement, or report and extract ALL data into a structured JSON format.

CRITICAL: Extract EVERY single row with 100% accuracy. Do NOT miss any transaction.

The document may be structured or unstructured, in any format (Tally, SAP, bank statement, handwritten, scanned, etc.).

Return a JSON object with this EXACT structure:
{
    "headers": ["column1", "column2", ...],
    "rows": [
        ["value1", "value2", ...],
        ["value1", "value2", ...]
    ]
}

Rules:
1. Identify ALL columns visible in the table/document (Date, Particulars, Voucher Type, Voucher No, Debit, Credit, Balance, etc.)
2. Extract EVERY data row - do not skip any transaction
3. Preserve exact values: numbers (with or without commas), dates, text exactly as shown
4. If a cell is empty, use empty string ""
5. Do NOT include summary/total rows or opening/closing balance rows in the data rows
6. If data spans multiple sections or tables, combine all transaction rows using a unified column set
7. For amounts, keep the original number format - do not modify values
8. If the document has no clear table structure, still extract all financial data into logical columns

Return ONLY the JSON object, no other text or explanation.""",
                "setting_type": "text",
                "description": "Prompt sent to OpenAI for PDF/Image extraction"
            },
            {
                "setting_key": "credits_per_reconciliation",
                "setting_value": "1",
                "setting_type": "number",
                "description": "Credits deducted per reconciliation run"
            },
            {
                "setting_key": "credits_per_llm_call",
                "setting_value": "1",
                "setting_type": "number",
                "description": "Credits deducted per LLM/AI extraction call"
            },
            {
                "setting_key": "default_user_credits",
                "setting_value": "10",
                "setting_type": "number",
                "description": "Default credits for new users"
            },
            {
                "setting_key": "openai_model",
                "setting_value": "gpt-4o-mini",
                "setting_type": "string",
                "description": "OpenAI model to use for extraction"
            },
        ]

        for setting in default_settings:
            existing = db.query(SystemSettings).filter(
                SystemSettings.setting_key == setting["setting_key"]
            ).first()
            if not existing:
                db.add(SystemSettings(**setting))
        
        db.commit()
        print("Database initialized successfully!")
        
    except Exception as e:
        print(f"Error initializing database: {e}")
        db.rollback()
    finally:
        db.close()


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_setting(db, key: str) -> Optional[str]:
    """Get a system setting value by key."""
    setting = db.query(SystemSettings).filter(SystemSettings.setting_key == key).first()
    return setting.setting_value if setting else None


def set_setting(db, key: str, value: str, updated_by: int = None):
    """Set a system setting value."""
    setting = db.query(SystemSettings).filter(SystemSettings.setting_key == key).first()
    if setting:
        setting.setting_value = value
        setting.updated_by = updated_by
    else:
        setting = SystemSettings(setting_key=key, setting_value=value, updated_by=updated_by)
        db.add(setting)
    db.commit()
    return setting


if __name__ == "__main__":
    print("Initializing database...")
    init_db()
