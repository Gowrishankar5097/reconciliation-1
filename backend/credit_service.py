"""
Credit and Usage Service for tracking reconciliation and LLM usage.
Integrates with the reconciliation engine to deduct credits.
"""

import json
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from database import (
    get_db, User, UsageLog, CreditTransaction, SystemSettings, get_setting
)


class CreditService:
    """Service for managing user credits and usage tracking."""

    def __init__(self, db: Session):
        self.db = db

    def get_user(self, user_id: int) -> Optional[User]:
        """Get user by ID."""
        return self.db.query(User).filter(User.id == user_id).first()

    def check_credits(self, user_id: int, required: int = 1) -> bool:
        """Check if user has enough credits."""
        user = self.get_user(user_id)
        if not user:
            return False
        return user.credits >= required

    def deduct_credits(
        self,
        user_id: int,
        amount: int,
        action_type: str,
        file_type: str = None,
        file_name: str = None,
        details: dict = None
    ) -> bool:
        """
        Deduct credits from user and log the usage.
        Returns True if successful, False if insufficient credits.
        """
        user = self.get_user(user_id)
        if not user or user.credits < amount:
            return False

        # Deduct credits
        user.credits -= amount
        user.total_credits_used += amount

        # Log usage
        usage_log = UsageLog(
            user_id=user_id,
            action_type=action_type,
            credits_used=amount,
            file_type=file_type,
            file_name=file_name,
            details=json.dumps(details) if details else None,
        )
        self.db.add(usage_log)

        # Log credit transaction
        transaction = CreditTransaction(
            user_id=user_id,
            amount=-amount,
            transaction_type="usage",
            description=f"{action_type}: {file_name or 'N/A'}",
        )
        self.db.add(transaction)

        self.db.commit()
        return True

    def add_credits(
        self,
        user_id: int,
        amount: int,
        transaction_type: str = "admin_add",
        description: str = None,
        performed_by: int = None
    ) -> bool:
        """Add credits to user account."""
        user = self.get_user(user_id)
        if not user:
            return False

        user.credits += amount

        transaction = CreditTransaction(
            user_id=user_id,
            amount=amount,
            transaction_type=transaction_type,
            description=description or f"Added {amount} credits",
            performed_by=performed_by,
        )
        self.db.add(transaction)
        self.db.commit()
        return True

    def get_credits_per_reconciliation(self) -> int:
        """Get credits required per reconciliation from settings."""
        value = get_setting(self.db, "credits_per_reconciliation")
        return int(value) if value else 1

    def get_credits_per_llm_call(self) -> int:
        """Get credits required per LLM call from settings."""
        value = get_setting(self.db, "credits_per_llm_call")
        return int(value) if value else 1

    def log_reconciliation_usage(
        self,
        user_id: int,
        file_a_name: str = None,
        file_b_name: str = None,
        rows_a: int = 0,
        rows_b: int = 0,
        matched_count: int = 0,
        exception_count: int = 0
    ) -> bool:
        """Log a reconciliation run and deduct credits."""
        credits_required = self.get_credits_per_reconciliation()
        
        details = {
            "file_a": file_a_name,
            "file_b": file_b_name,
            "rows_a": rows_a,
            "rows_b": rows_b,
            "matched": matched_count,
            "exceptions": exception_count,
        }

        return self.deduct_credits(
            user_id=user_id,
            amount=credits_required,
            action_type="reconciliation",
            file_type="ledger",
            file_name=f"{file_a_name} + {file_b_name}",
            details=details,
        )

    def log_llm_extraction(
        self,
        user_id: int,
        file_name: str,
        file_type: str,
        pages: int = 1,
        rows_extracted: int = 0
    ) -> bool:
        """Log an LLM extraction call and deduct credits."""
        credits_required = self.get_credits_per_llm_call()
        
        details = {
            "pages": pages,
            "rows_extracted": rows_extracted,
        }

        return self.deduct_credits(
            user_id=user_id,
            amount=credits_required,
            action_type="llm_extraction",
            file_type=file_type,
            file_name=file_name,
            details=details,
        )


def get_openai_key(db: Session) -> Optional[str]:
    """Get OpenAI API key from database settings."""
    return get_setting(db, "openai_api_key")


def get_extraction_prompt(db: Session) -> Optional[str]:
    """Get extraction prompt from database settings."""
    return get_setting(db, "extraction_prompt")


def get_openai_model(db: Session) -> str:
    """Get OpenAI model name from database settings."""
    return get_setting(db, "openai_model") or "gpt-4o-mini"
