"""
Base signal detector class that all specific signal detectors inherit from.
"""
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime

from app.models import Signal, Account
from ..utils import load_scoring_config


class BaseSignalDetector(ABC):
    """
    Abstract base class for all signal detectors.
    Each detector implements logic to identify a specific signal condition.
    """
    
    # Subclasses must define these class attributes
    signal_name: str = None  # e.g., "usage_spike"
    signal_category: str = None  # e.g., "expansion", "churn_risk"
    
    def __init__(self, db_session: Session, config: Dict = None):
        """
        Initialize signal detector.
        
        Args:
            db_session: Database session
            config: Optional scoring configuration
        """
        if self.signal_name is None:
            raise ValueError(f"{self.__class__.__name__} must define signal_name")
        if self.signal_category is None:
            raise ValueError(f"{self.__class__.__name__} must define signal_category")
        
        self.db = db_session
        self.config = config or load_scoring_config()
        self.signal_config = self.config['signals'].get(self.signal_name, {})
    
    @abstractmethod
    def detect(self, account_id: int) -> Optional[Signal]:
        """
        Detect if signal condition is present for the account.
        
        Args:
            account_id: Account ID to check
        
        Returns:
            Signal instance if detected, None otherwise
        """
        pass
    
    def get_weight(self) -> float:
        """
        Get signal weight from configuration.
        
        Returns:
            Signal weight (can be positive or negative)
        """
        return self.signal_config.get('weight', 0.0)
    
    def get_description(self) -> str:
        """
        Get signal description from configuration.
        
        Returns:
            Description string
        """
        return self.signal_config.get('description', '')
    
    def create_signal(
        self,
        account_id: int,
        value: Optional[float] = None,
        details: Optional[Dict[str, Any]] = None,
        source: str = "heuristics"
    ) -> Signal:
        """
        Create and persist a signal record.
        
        Args:
            account_id: Account ID
            value: Quantitative value if applicable
            details: Additional context as JSON
            source: Signal source identifier
        
        Returns:
            Created Signal instance
        """
        signal = Signal(
            account_id=account_id,
            type=self.signal_name,
            value=value,
            details=details or {},
            timestamp=datetime.utcnow(),
            source=source
        )
        
        self.db.add(signal)
        self.db.commit()
        
        return signal
    
    def signal_exists(self, account_id: int, lookback_days: int = 1) -> bool:
        """
        Check if signal already exists for account within lookback period.
        Prevents duplicate signal creation.
        
        Args:
            account_id: Account ID
            lookback_days: How many days to look back
        
        Returns:
            True if signal already exists
        """
        from datetime import timedelta
        
        cutoff_time = datetime.utcnow() - timedelta(days=lookback_days)
        
        existing = self.db.query(Signal).filter(
            Signal.account_id == account_id,
            Signal.type == self.signal_name,
            Signal.timestamp >= cutoff_time
        ).first()
        
        return existing is not None
    
    def get_account(self, account_id: int) -> Optional[Account]:
        """
        Get account by ID.
        
        Args:
            account_id: Account ID
        
        Returns:
            Account instance or None
        """
        return self.db.query(Account).filter(Account.id == account_id).first()
