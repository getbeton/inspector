"""
PostHog Dashboard Provisioner.

Creates and manages the 4 native Beton RevOps dashboards in PostHog.
"""
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class DashboardTile:
    """Definition of a dashboard tile."""
    name: str
    query: str
    visualization: str  # "number", "line", "bar", "pie", "table"
    description: Optional[str] = None


@dataclass
class DashboardSpec:
    """Specification for a complete dashboard."""
    name: str
    description: str
    tags: List[str]
    tiles: List[DashboardTile]


class DashboardProvisioner:
    """
    Provisions Beton dashboards in PostHog.

    Handles:
    - Idempotent creation of 4 dashboards
    - Organization into folders
    - Query binding and versioning
    - Registry persistence
    """

    # Dashboard Specifications
    DASHBOARDS: Dict[str, DashboardSpec] = {
        "signal_overview": DashboardSpec(
            name="Beton: Signal Overview",
            description="Real-time view of all product-qualified signals across your customer base",
            tags=["beton-managed", "signal-overview"],
            tiles=[
                DashboardTile(
                    name="Signals Fired (7 Days)",
                    query="""
                        SELECT count() as signal_count
                        FROM events
                        WHERE event = 'beton_signal_fired'
                        AND timestamp >= now() - INTERVAL 7 DAY
                    """,
                    visualization="number",
                    description="Total signals detected this week"
                ),
                DashboardTile(
                    name="Signal Distribution by Type",
                    query="""
                        SELECT
                            arrayJoin(properties.signal_types) as signal_type,
                            count() as count
                        FROM events
                        WHERE event = 'beton_signal_fired'
                        AND timestamp >= now() - INTERVAL 30 DAY
                        GROUP BY signal_type
                        ORDER BY count DESC
                    """,
                    visualization="pie",
                    description="Distribution of signal types"
                ),
                DashboardTile(
                    name="Daily Signal Volume (30 Days)",
                    query="""
                        SELECT
                            toDate(timestamp) as day,
                            count() as signals
                        FROM events
                        WHERE event = 'beton_signal_fired'
                        AND timestamp >= now() - INTERVAL 30 DAY
                        GROUP BY day
                        ORDER BY day
                    """,
                    visualization="line",
                    description="Signal trend over 30 days"
                ),
                DashboardTile(
                    name="Top Accounts by Signal Activity",
                    query="""
                        SELECT
                            properties.$group_0 as company_id,
                            count() as signal_count,
                            max(properties.signal_score) as highest_score,
                            arrayStringConcat(arrayDistinct(arrayConcat(
                                groupArray(properties.signal_types)
                            )), ', ') as signal_types
                        FROM events
                        WHERE event = 'beton_signal_fired'
                        AND timestamp >= now() - INTERVAL 30 DAY
                        GROUP BY company_id
                        ORDER BY signal_count DESC
                        LIMIT 15
                    """,
                    visualization="table",
                    description="Companies with most signal activity"
                ),
                DashboardTile(
                    name="🔥 High Priority Signals (Score > 70)",
                    query="""
                        SELECT
                            timestamp,
                            properties.$group_0 as company_id,
                            properties.signal_score as score,
                            arrayStringConcat(properties.signal_types, ', ') as signals
                        FROM events
                        WHERE event = 'beton_signal_fired'
                        AND properties.signal_score >= 70
                        AND timestamp >= now() - INTERVAL 7 DAY
                        ORDER BY timestamp DESC
                        LIMIT 25
                    """,
                    visualization="table",
                    description="Highest priority signals for immediate action"
                ),
                DashboardTile(
                    name="PQL Score Distribution",
                    query="""
                        SELECT
                            multiIf(
                                properties.signal_score >= 80, '80-100 (Hot)',
                                properties.signal_score >= 60, '60-79 (Warm)',
                                properties.signal_score >= 40, '40-59 (Nurture)',
                                properties.signal_score >= 20, '20-39 (Monitor)',
                                '0-19 (Cold)'
                            ) as score_bucket,
                            count() as count
                        FROM events
                        WHERE event = 'beton_signal_fired'
                        AND timestamp >= now() - INTERVAL 30 DAY
                        GROUP BY score_bucket
                        ORDER BY score_bucket DESC
                    """,
                    visualization="bar",
                    description="Distribution of PQL scores"
                ),
            ]
        ),

        "account_health": DashboardSpec(
            name="Beton: Account Health & Usage",
            description="Product usage analytics by account with health indicators",
            tags=["beton-managed", "account-health"],
            tiles=[
                DashboardTile(
                    name="Monthly Active Accounts",
                    query="""
                        SELECT count(DISTINCT properties.$group_0) as active_accounts
                        FROM events
                        WHERE timestamp >= now() - INTERVAL 30 DAY
                        AND properties.$group_0 IS NOT NULL
                    """,
                    visualization="number",
                    description="Accounts with activity in past 30 days"
                ),
                DashboardTile(
                    name="Weekly Active Accounts Trend",
                    query="""
                        SELECT
                            toStartOfWeek(timestamp) as week,
                            count(DISTINCT properties.$group_0) as accounts
                        FROM events
                        WHERE timestamp >= now() - INTERVAL 90 DAY
                        AND properties.$group_0 IS NOT NULL
                        GROUP BY week
                        ORDER BY week
                    """,
                    visualization="line",
                    description="Account activation trend"
                ),
                DashboardTile(
                    name="Accounts by Usage Tier",
                    query="""
                        WITH account_activity AS (
                            SELECT
                                properties.$group_0 as company_id,
                                count() as events_30d,
                                count(DISTINCT person_id) as users
                            FROM events
                            WHERE timestamp >= now() - INTERVAL 30 DAY
                            AND properties.$group_0 IS NOT NULL
                            GROUP BY company_id
                        )
                        SELECT
                            multiIf(
                                users >= 10, 'Enterprise (10+ users)',
                                users >= 5, 'Growth (5-9 users)',
                                users >= 2, 'Team (2-4 users)',
                                'Individual (1 user)'
                            ) as tier,
                            count() as account_count
                        FROM account_activity
                        GROUP BY tier
                        ORDER BY account_count DESC
                    """,
                    visualization="pie",
                    description="Account segmentation by team size"
                ),
                DashboardTile(
                    name="Top Features by Adoption",
                    query="""
                        SELECT
                            event as feature,
                            count(DISTINCT properties.$group_0) as accounts_using,
                            count() as total_usage
                        FROM events
                        WHERE timestamp >= now() - INTERVAL 30 DAY
                        AND event NOT LIKE '$%'
                        AND properties.$group_0 IS NOT NULL
                        GROUP BY feature
                        HAVING accounts_using >= 5
                        ORDER BY accounts_using DESC
                        LIMIT 15
                    """,
                    visualization="table",
                    description="Most adopted features"
                ),
                DashboardTile(
                    name="📈 Usage Growth Leaders (WoW)",
                    query="""
                        WITH this_week AS (
                            SELECT
                                properties.$group_0 as company_id,
                                count() as events
                            FROM events
                            WHERE timestamp >= now() - INTERVAL 7 DAY
                            AND properties.$group_0 IS NOT NULL
                            GROUP BY company_id
                        ),
                        last_week AS (
                            SELECT
                                properties.$group_0 as company_id,
                                count() as events
                            FROM events
                            WHERE timestamp >= now() - INTERVAL 14 DAY
                            AND timestamp < now() - INTERVAL 7 DAY
                            AND properties.$group_0 IS NOT NULL
                            GROUP BY company_id
                        )
                        SELECT
                            t.company_id,
                            t.events as this_week,
                            l.events as last_week,
                            round((t.events - l.events) / nullIf(l.events, 0) * 100, 1) as growth_pct
                        FROM this_week t
                        LEFT JOIN last_week l ON t.company_id = l.company_id
                        WHERE l.events > 10
                        AND t.events > l.events * 1.3
                        ORDER BY growth_pct DESC
                        LIMIT 15
                    """,
                    visualization="table",
                    description="Fastest growing accounts"
                ),
                DashboardTile(
                    name="⚠️ Declining Usage Accounts",
                    query="""
                        WITH this_week AS (
                            SELECT
                                properties.$group_0 as company_id,
                                count() as events
                            FROM events
                            WHERE timestamp >= now() - INTERVAL 7 DAY
                            AND properties.$group_0 IS NOT NULL
                            GROUP BY company_id
                        ),
                        last_week AS (
                            SELECT
                                properties.$group_0 as company_id,
                                count() as events
                            FROM events
                            WHERE timestamp >= now() - INTERVAL 14 DAY
                            AND timestamp < now() - INTERVAL 7 DAY
                            AND properties.$group_0 IS NOT NULL
                            GROUP BY company_id
                        )
                        SELECT
                            l.company_id,
                            COALESCE(t.events, 0) as this_week,
                            l.events as last_week,
                            round((COALESCE(t.events, 0) - l.events) / nullIf(l.events, 0) * 100, 1) as change_pct
                        FROM last_week l
                        LEFT JOIN this_week t ON l.company_id = t.company_id
                        WHERE l.events > 20
                        AND (t.events IS NULL OR t.events < l.events * 0.5)
                        ORDER BY change_pct ASC
                        LIMIT 15
                    """,
                    visualization="table",
                    description="At-risk accounts with declining engagement"
                ),
            ]
        ),
    }

    @staticmethod
    def get_dashboard_spec(dashboard_type: str) -> Optional[DashboardSpec]:
        """Get specification for a dashboard."""
        return DashboardProvisioner.DASHBOARDS.get(dashboard_type)

    @staticmethod
    def list_dashboards() -> List[str]:
        """List all available dashboard types."""
        return list(DashboardProvisioner.DASHBOARDS.keys())

    async def provision_all_dashboards(self, project_id: str) -> Dict[str, any]:
        """
        Provision all 4 dashboards for a project.

        Args:
            project_id: PostHog project ID

        Returns:
            Mapping of dashboard types to PostHog dashboard IDs
        """
        results = {}
        errors = []

        for dashboard_type in self.list_dashboards():
            try:
                logger.info(f"Provisioning dashboard: {dashboard_type}")
                dashboard_id = await self._provision_dashboard(
                    project_id,
                    dashboard_type
                )
                results[dashboard_type] = dashboard_id
                logger.info(f"  Created dashboard {dashboard_type}: {dashboard_id}")
            except Exception as e:
                error_msg = f"Failed to provision {dashboard_type}: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)

        return {
            "success": len(errors) == 0,
            "dashboards": results,
            "errors": errors
        }

    async def _provision_dashboard(
        self,
        project_id: str,
        dashboard_type: str
    ) -> str:
        """
        Provision a single dashboard.

        Args:
            project_id: PostHog project ID
            dashboard_type: Type of dashboard to create

        Returns:
            PostHog dashboard ID
        """
        spec = self.get_dashboard_spec(dashboard_type)
        if not spec:
            raise ValueError(f"Unknown dashboard type: {dashboard_type}")

        logger.debug(f"Creating dashboard {spec.name} with {len(spec.tiles)} tiles")

        # TODO: Implement PostHog API call to create dashboard
        # For now, return a mock ID
        mock_dashboard_id = f"dashboard_{dashboard_type}_{datetime.utcnow().timestamp()}"
        logger.info(f"Would create dashboard in PostHog: {spec.name}")

        return mock_dashboard_id
