"""
Sliding window rate limiter for API query budget management.
Stores rate limit state in database for persistence across restarts.
"""
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import RateLimitTracking

logger = logging.getLogger(__name__)


class RateLimitExceeded(Exception):
    """Raised when rate limit is exceeded."""
    def __init__(self, message: str, retry_after_seconds: int = 0):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class RateLimiter:
    """
    Sliding window rate limiter with database persistence.

    Tracks API calls per integration within a configurable time window.
    Uses hourly buckets for efficient aggregation.
    Default: 2000 queries per hour (conservative below PostHog's 2400 limit).

    Usage:
        rate_limiter = RateLimiter(db, integration="posthog", limit=2000, window_seconds=3600)

        # Check before making request
        if rate_limiter.can_proceed():
            rate_limiter.record_request()
            # make API call
        else:
            # wait or skip
    """

    def __init__(
        self,
        db: Session,
        integration: str = "posthog",
        limit: int = 2000,
        window_seconds: int = 3600
    ):
        """
        Initialize rate limiter.

        Args:
            db: Database session.
            integration: Integration name (e.g., "posthog", "attio").
            limit: Maximum requests allowed in the window.
            window_seconds: Time window in seconds (default: 1 hour).
        """
        self.db = db
        self.integration = integration
        self.limit = limit
        self.window_seconds = window_seconds

    def _get_current_window_start(self) -> datetime:
        """Get the start of the current hour window."""
        now = datetime.utcnow()
        return now.replace(minute=0, second=0, microsecond=0)

    def _get_sliding_window_start(self) -> datetime:
        """Get the start of the sliding window (1 hour ago)."""
        return datetime.utcnow() - timedelta(seconds=self.window_seconds)

    def _cleanup_old_entries(self) -> None:
        """Remove entries outside the sliding window."""
        cutoff = self._get_sliding_window_start()
        self.db.query(RateLimitTracking).filter(
            RateLimitTracking.integration_name == self.integration,
            RateLimitTracking.window_start < cutoff
        ).delete(synchronize_session=False)
        self.db.commit()

    def get_current_count(self) -> int:
        """Get number of requests in the sliding window."""
        self._cleanup_old_entries()

        window_start = self._get_sliding_window_start()

        # Sum all query counts in the window
        result = self.db.query(func.sum(RateLimitTracking.query_count)).filter(
            RateLimitTracking.integration_name == self.integration,
            RateLimitTracking.window_start >= window_start
        ).scalar()

        return result or 0

    def get_remaining(self) -> int:
        """Get remaining requests in current window."""
        return max(0, self.limit - self.get_current_count())

    def can_proceed(self, cost: int = 1) -> bool:
        """
        Check if a request can proceed without exceeding limit.

        Args:
            cost: Number of "units" this request costs (default: 1).

        Returns:
            True if request can proceed, False if limit exceeded.
        """
        return self.get_remaining() >= cost

    def record_request(self, cost: int = 1) -> None:
        """
        Record a request against the rate limit.

        Args:
            cost: Number of units to record (default: 1).
        """
        window_start = self._get_current_window_start()

        # Try to find existing entry for this window
        existing = self.db.query(RateLimitTracking).filter(
            RateLimitTracking.integration_name == self.integration,
            RateLimitTracking.window_start == window_start
        ).first()

        if existing:
            existing.query_count = (existing.query_count or 0) + cost
            existing.updated_at = datetime.utcnow()
        else:
            entry = RateLimitTracking(
                integration_name=self.integration,
                window_start=window_start,
                query_count=cost,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            self.db.add(entry)

        self.db.commit()

        logger.debug(
            f"Rate limit: {self.integration} - recorded {cost} request(s), "
            f"{self.get_remaining()} remaining"
        )

    def check_and_record(self, cost: int = 1) -> None:
        """
        Check rate limit and record request, raising exception if exceeded.

        Args:
            cost: Number of units for this request.

        Raises:
            RateLimitExceeded: If limit would be exceeded.
        """
        if not self.can_proceed(cost):
            # Calculate approximate retry time
            retry_after = 60  # Default to 1 minute

            raise RateLimitExceeded(
                f"Rate limit exceeded for {self.integration}. "
                f"Limit: {self.limit} per {self.window_seconds}s. "
                f"Retry after {retry_after}s.",
                retry_after_seconds=retry_after
            )

        self.record_request(cost)

    def get_status(self) -> dict:
        """
        Get current rate limit status.

        Returns:
            Dict with limit info and usage.
        """
        current = self.get_current_count()
        remaining = self.limit - current

        return {
            "integration": self.integration,
            "limit": self.limit,
            "window_seconds": self.window_seconds,
            "current_usage": current,
            "remaining": remaining,
            "usage_percent": round((current / self.limit) * 100, 1) if self.limit > 0 else 0,
            "reset_in_seconds": self.window_seconds,  # Approximate
        }


def get_rate_limiter(
    db: Session,
    integration: str = "posthog",
    limit: Optional[int] = None,
    window_seconds: int = 3600
) -> RateLimiter:
    """
    Factory function to create a rate limiter.

    Args:
        db: Database session.
        integration: Integration name.
        limit: Rate limit (uses default from settings if not specified).
        window_seconds: Time window.

    Returns:
        Configured RateLimiter instance.
    """
    if limit is None:
        from app.config import settings
        limit = settings.posthog_query_budget

    return RateLimiter(db, integration, limit, window_seconds)
