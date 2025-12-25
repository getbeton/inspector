"""
Dashboard Provisioner Service.

Programmatically creates and manages PostHog dashboards for Beton.
Supports idempotent provisioning using tags for tracking.
"""
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models import DashboardRegistry, InsightRegistry
from app.integrations.posthog_query_client import PostHogQueryClient

logger = logging.getLogger(__name__)


@dataclass
class InsightSpec:
    """Specification for a PostHog insight."""
    name: str
    description: str
    query: str
    visualization: str = "BoldNumber"  # BoldNumber, ActionsPie, ActionsLineGraph, ActionsTable
    display_type: str = "single_stat"  # single_stat, pie, line, table


@dataclass
class DashboardSpec:
    """Specification for a PostHog dashboard."""
    beton_type: str  # Unique identifier for this dashboard type
    name: str
    description: str
    folder: str = "Beton"  # Dashboard folder/path
    tags: List[str] = field(default_factory=lambda: ["beton-managed"])
    insights: List[InsightSpec] = field(default_factory=list)
    schema_version: str = "1.0.0"


# ============================================
# Predefined Dashboard Specifications
# ============================================

SIGNALS_OVERVIEW_DASHBOARD = DashboardSpec(
    beton_type="signals_overview",
    name="Beton: Signals Overview",
    description="Overview of signal detection metrics and trends",
    folder="Beton/Signals",
    tags=["beton-managed", "signals", "beton-v1.0.0"],
    schema_version="1.0.0",
    insights=[
        InsightSpec(
            name="Total Signals (30d)",
            description="Total signals detected in the last 30 days",
            query="""
                SELECT COUNT(*) as total
                FROM events
                WHERE event = 'signal_detected'
                AND timestamp > now() - INTERVAL 30 DAY
            """,
            visualization="BoldNumber",
            display_type="single_stat"
        ),
        InsightSpec(
            name="Signals by Type",
            description="Distribution of signals by type",
            query="""
                SELECT
                    properties.signal_type as signal_type,
                    COUNT(*) as count
                FROM events
                WHERE event = 'signal_detected'
                AND timestamp > now() - INTERVAL 30 DAY
                GROUP BY properties.signal_type
                ORDER BY count DESC
            """,
            visualization="ActionsPie",
            display_type="pie"
        ),
        InsightSpec(
            name="Daily Signal Trend",
            description="Signal detection trend over time",
            query="""
                SELECT
                    toDate(timestamp) as date,
                    COUNT(*) as signals
                FROM events
                WHERE event = 'signal_detected'
                AND timestamp > now() - INTERVAL 30 DAY
                GROUP BY date
                ORDER BY date
            """,
            visualization="ActionsLineGraph",
            display_type="line"
        ),
        InsightSpec(
            name="Top Signal Sources",
            description="Sources generating the most signals",
            query="""
                SELECT
                    properties.source as source,
                    COUNT(*) as count
                FROM events
                WHERE event = 'signal_detected'
                AND timestamp > now() - INTERVAL 30 DAY
                GROUP BY properties.source
                ORDER BY count DESC
                LIMIT 10
            """,
            visualization="ActionsTable",
            display_type="table"
        )
    ]
)

ACCOUNT_HEALTH_DASHBOARD = DashboardSpec(
    beton_type="account_health",
    name="Beton: Account Health",
    description="Account health metrics and scores",
    folder="Beton/Accounts",
    tags=["beton-managed", "accounts", "health", "beton-v1.0.0"],
    schema_version="1.0.0",
    insights=[
        InsightSpec(
            name="Average Health Score",
            description="Average account health score",
            query="""
                SELECT AVG(properties.health_score) as avg_health
                FROM events
                WHERE event = 'account_scored'
                AND timestamp > now() - INTERVAL 7 DAY
            """,
            visualization="BoldNumber",
            display_type="single_stat"
        ),
        InsightSpec(
            name="Health Score Distribution",
            description="Distribution of account health scores",
            query="""
                SELECT
                    CASE
                        WHEN properties.health_score >= 80 THEN 'Excellent (80-100)'
                        WHEN properties.health_score >= 60 THEN 'Good (60-79)'
                        WHEN properties.health_score >= 40 THEN 'Fair (40-59)'
                        ELSE 'Poor (0-39)'
                    END as health_category,
                    COUNT(DISTINCT properties.account_id) as accounts
                FROM events
                WHERE event = 'account_scored'
                AND timestamp > now() - INTERVAL 7 DAY
                GROUP BY health_category
            """,
            visualization="ActionsPie",
            display_type="pie"
        )
    ]
)

# All available dashboard specs
DASHBOARD_SPECS = {
    "signals_overview": SIGNALS_OVERVIEW_DASHBOARD,
    "account_health": ACCOUNT_HEALTH_DASHBOARD,
}


@dataclass
class ProvisioningResult:
    """Result of a dashboard provisioning operation."""
    success: bool
    dashboard_id: Optional[str] = None
    dashboard_url: Optional[str] = None
    insights_created: int = 0
    message: str = ""
    error: Optional[str] = None


class DashboardProvisioner:
    """
    Provisions PostHog dashboards programmatically.

    Usage:
        provisioner = DashboardProvisioner(db, posthog_client)

        # Provision a specific dashboard
        result = provisioner.provision_dashboard("signals_overview")

        # Provision all dashboards
        results = provisioner.provision_all()
    """

    # Tag used to identify Beton-managed dashboards
    BETON_TAG = "beton-managed"

    def __init__(
        self,
        db: Session,
        posthog_client: PostHogQueryClient
    ):
        """
        Initialize dashboard provisioner.

        Args:
            db: Database session.
            posthog_client: PostHog query client for API calls.
        """
        self.db = db
        self.posthog = posthog_client

    def _get_registry_entry(self, beton_type: str) -> Optional[DashboardRegistry]:
        """Get existing registry entry for a dashboard type."""
        return self.db.query(DashboardRegistry).filter(
            DashboardRegistry.beton_dashboard_type == beton_type
        ).first()

    def _create_registry_entry(
        self,
        spec: DashboardSpec,
        posthog_id: str,
        posthog_uuid: Optional[str] = None,
        posthog_url: Optional[str] = None
    ) -> DashboardRegistry:
        """Create or update registry entry for a dashboard."""
        existing = self._get_registry_entry(spec.beton_type)

        if existing:
            existing.posthog_dashboard_id = posthog_id
            existing.posthog_dashboard_uuid = posthog_uuid
            existing.posthog_dashboard_url = posthog_url
            existing.folder_path = spec.folder
            existing.schema_version = spec.schema_version
            existing.insights_count = len(spec.insights)
            existing.last_synced_at = datetime.utcnow()
            self.db.commit()
            return existing

        entry = DashboardRegistry(
            beton_dashboard_type=spec.beton_type,
            posthog_dashboard_id=posthog_id,
            posthog_dashboard_uuid=posthog_uuid,
            posthog_dashboard_url=posthog_url,
            folder_path=spec.folder,
            schema_version=spec.schema_version,
            insights_count=len(spec.insights),
            created_at=datetime.utcnow(),
            last_synced_at=datetime.utcnow()
        )
        self.db.add(entry)
        self.db.commit()
        return entry

    def _find_existing_dashboard(self, spec: DashboardSpec) -> Optional[Dict[str, Any]]:
        """
        Find existing dashboard by tags.

        Uses beton-managed tag and specific dashboard type tag to identify
        dashboards that were previously created.
        """
        try:
            # Search for dashboards with our specific tag
            dashboards = self.posthog.list_dashboards()

            for dashboard in dashboards:
                tags = dashboard.get("tags", [])
                if self.BETON_TAG in tags and spec.beton_type in tags:
                    return dashboard

            return None
        except Exception as e:
            logger.warning(f"Failed to search for existing dashboard: {e}")
            return None

    def create_dashboard(self, spec: DashboardSpec) -> Dict[str, Any]:
        """
        Create a new PostHog dashboard.

        Args:
            spec: Dashboard specification.

        Returns:
            Created dashboard data from PostHog API.
        """
        # Build tags including dashboard type identifier
        tags = list(spec.tags)
        if spec.beton_type not in tags:
            tags.append(spec.beton_type)

        payload = {
            "name": spec.name,
            "description": spec.description,
            "tags": tags,
            "creation_mode": "template"
        }

        result = self.posthog.create_dashboard(payload)
        logger.info(f"Created dashboard: {spec.name} (ID: {result.get('id')})")
        return result

    def create_insight(
        self,
        dashboard_id: str,
        insight_spec: InsightSpec
    ) -> Dict[str, Any]:
        """
        Create an insight on a dashboard.

        Args:
            dashboard_id: PostHog dashboard ID.
            insight_spec: Insight specification.

        Returns:
            Created insight data from PostHog API.
        """
        payload = {
            "name": insight_spec.name,
            "description": insight_spec.description,
            "query": {
                "kind": "HogQLQuery",
                "query": insight_spec.query.strip()
            },
            "dashboards": [int(dashboard_id)],
        }

        result = self.posthog.create_insight(payload)
        logger.info(f"Created insight: {insight_spec.name} on dashboard {dashboard_id}")
        return result

    def provision_dashboard(
        self,
        dashboard_type: str,
        force_recreate: bool = False
    ) -> ProvisioningResult:
        """
        Provision a single dashboard idempotently.

        Args:
            dashboard_type: Type of dashboard to provision (e.g., "signals_overview").
            force_recreate: If True, recreate even if dashboard exists.

        Returns:
            ProvisioningResult with status and details.
        """
        spec = DASHBOARD_SPECS.get(dashboard_type)
        if not spec:
            return ProvisioningResult(
                success=False,
                error=f"Unknown dashboard type: {dashboard_type}"
            )

        try:
            # Check for existing dashboard
            if not force_recreate:
                existing = self._find_existing_dashboard(spec)
                if existing:
                    dashboard_id = str(existing.get("id", ""))
                    dashboard_url = existing.get("url")

                    # Update registry
                    self._create_registry_entry(
                        spec,
                        dashboard_id,
                        existing.get("uuid"),
                        dashboard_url
                    )

                    return ProvisioningResult(
                        success=True,
                        dashboard_id=dashboard_id,
                        dashboard_url=dashboard_url,
                        insights_created=0,
                        message=f"Dashboard already exists: {spec.name}"
                    )

            # Create new dashboard
            dashboard = self.create_dashboard(spec)
            dashboard_id = str(dashboard.get("id", ""))
            dashboard_uuid = dashboard.get("uuid")

            # Build dashboard URL
            project_id = self.posthog.project_id
            host = self.posthog.host or "https://app.posthog.com"
            dashboard_url = f"{host}/project/{project_id}/dashboard/{dashboard_id}"

            # Create insights
            insights_created = 0
            for insight_spec in spec.insights:
                try:
                    self.create_insight(dashboard_id, insight_spec)
                    insights_created += 1
                except Exception as e:
                    logger.error(f"Failed to create insight {insight_spec.name}: {e}")

            # Update registry
            self._create_registry_entry(
                spec,
                dashboard_id,
                dashboard_uuid,
                dashboard_url
            )

            return ProvisioningResult(
                success=True,
                dashboard_id=dashboard_id,
                dashboard_url=dashboard_url,
                insights_created=insights_created,
                message=f"Created dashboard: {spec.name}"
            )

        except Exception as e:
            logger.error(f"Failed to provision dashboard {dashboard_type}: {e}")
            return ProvisioningResult(
                success=False,
                error=str(e)
            )

    def provision_all(self, force_recreate: bool = False) -> Dict[str, ProvisioningResult]:
        """
        Provision all defined dashboards.

        Args:
            force_recreate: If True, recreate all dashboards.

        Returns:
            Dict mapping dashboard type to ProvisioningResult.
        """
        results = {}
        for dashboard_type in DASHBOARD_SPECS:
            results[dashboard_type] = self.provision_dashboard(
                dashboard_type,
                force_recreate
            )
        return results

    def get_registry(self) -> List[Dict[str, Any]]:
        """Get all registered dashboards."""
        entries = self.db.query(DashboardRegistry).all()
        return [
            {
                "beton_type": e.beton_dashboard_type,
                "posthog_id": e.posthog_dashboard_id,
                "url": e.posthog_dashboard_url,
                "folder": e.folder_path,
                "version": e.schema_version,
                "insights_count": e.insights_count,
                "created_at": e.created_at.isoformat() if e.created_at else None,
                "last_synced_at": e.last_synced_at.isoformat() if e.last_synced_at else None
            }
            for e in entries
        ]

    def delete_dashboard(self, dashboard_type: str) -> bool:
        """
        Delete a dashboard from PostHog and registry.

        Args:
            dashboard_type: Type of dashboard to delete.

        Returns:
            True if deleted successfully.
        """
        registry_entry = self._get_registry_entry(dashboard_type)
        if not registry_entry:
            return False

        try:
            # Delete from PostHog
            self.posthog.delete_dashboard(registry_entry.posthog_dashboard_id)

            # Delete from registry
            self.db.query(InsightRegistry).filter(
                InsightRegistry.dashboard_id == registry_entry.id
            ).delete()
            self.db.delete(registry_entry)
            self.db.commit()

            logger.info(f"Deleted dashboard: {dashboard_type}")
            return True

        except Exception as e:
            logger.error(f"Failed to delete dashboard {dashboard_type}: {e}")
            return False


def get_available_dashboard_types() -> List[str]:
    """Get list of available dashboard types."""
    return list(DASHBOARD_SPECS.keys())


def get_dashboard_spec(dashboard_type: str) -> Optional[DashboardSpec]:
    """Get specification for a dashboard type."""
    return DASHBOARD_SPECS.get(dashboard_type)
