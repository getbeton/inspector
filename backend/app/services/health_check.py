"""
Health check service for monitoring integration status.
Aggregates health from PostHog, Attio, and other integrations.
"""
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.config_manager import ConfigManager
from app.core.rate_limiter import get_rate_limiter

logger = logging.getLogger(__name__)


@dataclass
class IntegrationHealth:
    """Health status for a single integration."""
    name: str
    status: str  # "healthy", "unhealthy", "degraded", "unconfigured"
    connected: bool
    message: str
    last_checked: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SystemHealth:
    """Overall system health status."""
    status: str  # "healthy", "degraded", "unhealthy", "unconfigured"
    integrations: Dict[str, IntegrationHealth] = field(default_factory=dict)
    rate_limit_status: Dict[str, Any] = field(default_factory=dict)
    cache_status: Dict[str, Any] = field(default_factory=dict)
    last_checked: str = ""


class HealthCheckService:
    """
    Service for checking health of all integrations and system components.

    Usage:
        health_service = HealthCheckService(db)
        system_health = await health_service.check_all()
    """

    def __init__(self, db: Session, config_manager: Optional[ConfigManager] = None):
        """
        Initialize health check service.

        Args:
            db: Database session.
            config_manager: ConfigManager instance (creates one if not provided).
        """
        self.db = db
        self.config_manager = config_manager or ConfigManager(db)

    async def check_all(self) -> SystemHealth:
        """
        Run health checks on all integrations.

        Returns:
            SystemHealth with overall and per-integration status.
        """
        integrations = {}

        # Check PostHog
        posthog_health = await self.check_posthog()
        integrations["posthog"] = posthog_health

        # Check Attio
        attio_health = await self.check_attio()
        integrations["attio"] = attio_health

        # Check Stripe (optional)
        stripe_health = await self.check_stripe()
        if stripe_health.status != "unconfigured":
            integrations["stripe"] = stripe_health

        # Get rate limit status
        rate_limiter = get_rate_limiter(self.db, "posthog")
        rate_limit_status = rate_limiter.get_status()

        # Determine overall status
        statuses = [h.status for h in integrations.values()]

        if all(s == "unconfigured" for s in statuses):
            overall_status = "unconfigured"
        elif all(s in ("healthy", "unconfigured") for s in statuses):
            overall_status = "healthy"
        elif any(s == "unhealthy" for s in statuses):
            overall_status = "degraded"
        else:
            overall_status = "degraded"

        return SystemHealth(
            status=overall_status,
            integrations=integrations,
            rate_limit_status=rate_limit_status,
            last_checked=datetime.utcnow().isoformat()
        )

    async def check_posthog(self) -> IntegrationHealth:
        """Check PostHog connection health."""
        config = self.config_manager.get_integration("posthog", include_api_key=True)

        if not config or not config.get("api_key"):
            return IntegrationHealth(
                name="posthog",
                status="unconfigured",
                connected=False,
                message="PostHog not configured"
            )

        # Use stored validation status if recent
        stored_status = config.get("status")
        last_validated = config.get("last_validated_at")

        if stored_status == "connected":
            return IntegrationHealth(
                name="posthog",
                status="healthy",
                connected=True,
                message="Connected",
                last_checked=last_validated,
                details={
                    "project_id": config.get("project_id"),
                    "host": config.get("host")
                }
            )

        # Test connection
        import requests
        api_key = config.get("api_key")
        host = config.get("host", "https://app.posthog.com")

        try:
            response = requests.get(
                f"{host}/api/users/@me/",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10
            )

            if response.status_code == 200:
                user_data = response.json()
                # Update status in database
                self.config_manager.update_validation_status("posthog", is_valid=True)

                return IntegrationHealth(
                    name="posthog",
                    status="healthy",
                    connected=True,
                    message=f"Connected as {user_data.get('email', 'unknown')}",
                    last_checked=datetime.utcnow().isoformat(),
                    details={
                        "email": user_data.get("email"),
                        "project_id": config.get("project_id")
                    }
                )
            else:
                self.config_manager.update_validation_status("posthog", is_valid=False)
                return IntegrationHealth(
                    name="posthog",
                    status="unhealthy",
                    connected=False,
                    message=f"Connection failed: {response.status_code}"
                )

        except requests.Timeout:
            return IntegrationHealth(
                name="posthog",
                status="unhealthy",
                connected=False,
                message="Connection timed out"
            )
        except Exception as e:
            return IntegrationHealth(
                name="posthog",
                status="unhealthy",
                connected=False,
                message=f"Connection error: {str(e)}"
            )

    async def check_attio(self) -> IntegrationHealth:
        """Check Attio connection health."""
        config = self.config_manager.get_integration("attio", include_api_key=True)

        if not config or not config.get("api_key"):
            return IntegrationHealth(
                name="attio",
                status="unconfigured",
                connected=False,
                message="Attio not configured"
            )

        # Use stored validation status if recent
        stored_status = config.get("status")
        last_validated = config.get("last_validated_at")

        if stored_status == "connected":
            return IntegrationHealth(
                name="attio",
                status="healthy",
                connected=True,
                message="Connected",
                last_checked=last_validated,
                details={
                    "workspace_id": config.get("workspace_id")
                }
            )

        # Test connection
        import requests
        api_key = config.get("api_key")

        try:
            response = requests.get(
                "https://api.attio.com/v2/self",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10
            )

            if response.status_code == 200:
                data = response.json().get("data", {})
                workspace = data.get("workspace", {})
                self.config_manager.update_validation_status("attio", is_valid=True)

                return IntegrationHealth(
                    name="attio",
                    status="healthy",
                    connected=True,
                    message=f"Connected to {workspace.get('workspace_name', 'workspace')}",
                    last_checked=datetime.utcnow().isoformat(),
                    details={
                        "workspace_id": workspace.get("workspace_id"),
                        "workspace_name": workspace.get("workspace_name")
                    }
                )
            else:
                self.config_manager.update_validation_status("attio", is_valid=False)
                return IntegrationHealth(
                    name="attio",
                    status="unhealthy",
                    connected=False,
                    message=f"Connection failed: {response.status_code}"
                )

        except requests.Timeout:
            return IntegrationHealth(
                name="attio",
                status="unhealthy",
                connected=False,
                message="Connection timed out"
            )
        except Exception as e:
            return IntegrationHealth(
                name="attio",
                status="unhealthy",
                connected=False,
                message=f"Connection error: {str(e)}"
            )

    async def check_stripe(self) -> IntegrationHealth:
        """Check Stripe connection health."""
        config = self.config_manager.get_integration("stripe", include_api_key=True)

        if not config or not config.get("api_key"):
            return IntegrationHealth(
                name="stripe",
                status="unconfigured",
                connected=False,
                message="Stripe not configured"
            )

        stored_status = config.get("status")
        if stored_status == "connected":
            return IntegrationHealth(
                name="stripe",
                status="healthy",
                connected=True,
                message="Connected",
                last_checked=config.get("last_validated_at")
            )

        # Test connection
        import requests
        api_key = config.get("api_key")

        try:
            response = requests.get(
                "https://api.stripe.com/v1/balance",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10
            )

            if response.status_code == 200:
                self.config_manager.update_validation_status("stripe", is_valid=True)
                return IntegrationHealth(
                    name="stripe",
                    status="healthy",
                    connected=True,
                    message="Connected",
                    last_checked=datetime.utcnow().isoformat()
                )
            else:
                self.config_manager.update_validation_status("stripe", is_valid=False)
                return IntegrationHealth(
                    name="stripe",
                    status="unhealthy",
                    connected=False,
                    message=f"Connection failed: {response.status_code}"
                )

        except Exception as e:
            return IntegrationHealth(
                name="stripe",
                status="unhealthy",
                connected=False,
                message=f"Connection error: {str(e)}"
            )

    def get_rate_limit_summary(self) -> Dict[str, Any]:
        """Get rate limit summary for all integrations."""
        posthog_limiter = get_rate_limiter(self.db, "posthog")

        return {
            "posthog": posthog_limiter.get_status()
        }


def get_health_check_service(db: Session) -> HealthCheckService:
    """
    Factory function to create a health check service.

    Args:
        db: Database session.

    Returns:
        Configured HealthCheckService instance.
    """
    return HealthCheckService(db)
