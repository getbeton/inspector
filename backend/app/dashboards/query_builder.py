"""
HogQL Query Builder with reusable patterns and time window abstractions.

Provides building blocks for consistent, parameterized signal detection
and dashboard queries.
"""
from enum import Enum
from dataclasses import dataclass
from typing import Optional, List


class TimeWindow(Enum):
    """Standard time windows for queries."""
    WEEK = 7
    MONTH = 30
    QUARTER = 90
    HALF_YEAR = 180
    YEAR = 365


@dataclass
class QueryParams:
    """Parameterized query configuration."""
    window: TimeWindow = TimeWindow.MONTH
    comparison_window: TimeWindow = TimeWindow.WEEK
    backtest_lag: TimeWindow = TimeWindow.QUARTER
    group_type: int = 0
    min_baseline_events: int = 5
    growth_threshold: float = 1.5
    score_threshold: int = 60

    def current_period(self) -> str:
        """Filter for current period."""
        return f"timestamp >= now() - INTERVAL {self.window.value} DAY"

    def previous_period(self) -> str:
        """Filter for previous period for comparison."""
        total_days = self.window.value + self.comparison_window.value
        return f"""
            timestamp >= now() - INTERVAL {total_days} DAY
            AND timestamp < now() - INTERVAL {self.window.value} DAY
        """

    def backtest_period(self) -> str:
        """Filter for backtesting period (lagged to allow outcomes to settle)."""
        total_days = self.window.value + self.backtest_lag.value
        return f"""
            timestamp >= now() - INTERVAL {total_days} DAY
            AND timestamp < now() - INTERVAL {self.backtest_lag.value} DAY
        """


class QueryBuilder:
    """
    Builder for HogQL queries with reusable CTEs and patterns.

    Handles:
    - Company context identification
    - Time window filtering
    - Period-over-period comparisons
    - Score bucketing
    - Outcomes tracking for backtesting
    """

    COMPANY_CONTEXT_CTE = """
    company_context AS (
        SELECT
            properties.$group_{group_type} as company_id,
            groups.properties.name as company_name,
            groups.properties.domain as company_domain,
            count() as event_count,
            count(DISTINCT person_id) as user_count,
            min(timestamp) as first_seen,
            max(timestamp) as last_seen
        FROM events
        LEFT JOIN groups ON events.properties.$group_{group_type} = groups.group_key
            AND groups.group_type_index = {group_type}
        WHERE properties.$group_{group_type} IS NOT NULL
        AND {time_filter}
        GROUP BY company_id, company_name, company_domain
        HAVING event_count >= {min_events}
    )
    """

    SCORE_BUCKETS = [
        (80, 100, "Hot", "🔥"),
        (60, 79, "Warm", "🔥"),
        (40, 59, "Nurture", "📱"),
        (20, 39, "Monitor", "👀"),
        (0, 19, "Cold", "❄️"),
    ]

    @staticmethod
    def company_context_cte(
        group_type: int = 0,
        time_filter: str = "timestamp >= now() - INTERVAL 30 DAY",
        min_events: int = 1
    ) -> str:
        """
        CTE for company context with usage metrics.

        Args:
            group_type: PostHog group type index (default: 0 for company)
            time_filter: WHERE clause for time window
            min_events: Minimum event count to include company

        Returns:
            HogQL CTE string
        """
        return QueryBuilder.COMPANY_CONTEXT_CTE.format(
            group_type=group_type,
            time_filter=time_filter,
            min_events=min_events
        )

    @staticmethod
    def period_comparison_cte(
        metric_expr: str,
        group_by: str,
        current_period: str,
        previous_period: str,
        min_baseline: int = 5,
        growth_threshold: float = 1.5
    ) -> tuple[str, str]:
        """
        CTEs for comparing metrics across periods (e.g., WoW growth).

        Args:
            metric_expr: Metric to calculate (e.g., "count()")
            group_by: Column to group by (e.g., "properties.$group_0")
            current_period: Filter for current period
            previous_period: Filter for previous period
            min_baseline: Minimum baseline value required
            growth_threshold: Multiplier to trigger as growth (e.g., 1.5 = 50% growth)

        Returns:
            Tuple of (current_period_cte, previous_period_cte)
        """
        current_cte = f"""
        current_period AS (
            SELECT
                {group_by} as entity_id,
                {metric_expr} as current_value
            FROM events
            WHERE {current_period}
            AND properties.$group_0 IS NOT NULL
            GROUP BY entity_id
        )
        """

        previous_cte = f"""
        previous_period AS (
            SELECT
                {group_by} as entity_id,
                {metric_expr} as previous_value
            FROM events
            WHERE {previous_period}
            AND properties.$group_0 IS NOT NULL
            GROUP BY entity_id
        )
        """

        return current_cte, previous_cte

    @staticmethod
    def outcomes_cte(
        time_filter: str,
        include_revenue: bool = False,
        include_cycle_time: bool = False
    ) -> str:
        """
        CTE for deal outcomes (for backtesting).

        Args:
            time_filter: WHERE clause for time window
            include_revenue: Include revenue metrics
            include_cycle_time: Include sales cycle duration

        Returns:
            HogQL CTE string
        """
        extra_fields = ""
        if include_revenue:
            extra_fields += """
            ,
            sum(CASE WHEN outcome = 'won' THEN deal_value ELSE 0 END) as won_revenue
            """
        if include_cycle_time:
            extra_fields += """
            ,
            avg(CASE WHEN outcome = 'won' THEN dateDiff('day', created_at, closed_at) END) as avg_cycle_days
            """

        return f"""
        outcomes AS (
            SELECT
                company_id,
                max(CASE WHEN outcome = 'won' THEN 1 ELSE 0 END) as converted,
                countIf(outcome = 'won') as won_count,
                countIf(outcome = 'lost') as lost_count,
                countIf(outcome IS NULL) as open_count{extra_fields}
            FROM attio_deals
            WHERE {time_filter}
            GROUP BY company_id
        )
        """

    @staticmethod
    def score_bucket_sql(score_field: str, include_emoji: bool = True) -> str:
        """
        Bucketing logic for PQL scores.

        Args:
            score_field: Field name containing score
            include_emoji: Include emoji in bucket labels

        Returns:
            HogQL multiIf expression
        """
        conditions = []
        for min_score, max_score, label, emoji in QueryBuilder.SCORE_BUCKETS:
            display = f"{emoji} {label}" if include_emoji else f"{min_score}-{max_score}"
            conditions.append(f"{score_field} >= {min_score}, '{display}'")

        return f"multiIf({', '.join(conditions)}, '❄️ Cold')"

    @staticmethod
    def safe_division(numerator: str, denominator: str) -> str:
        """
        Safe division that handles zero denominators.

        Args:
            numerator: Numerator expression
            denominator: Denominator expression

        Returns:
            HogQL expression with nullIf protection
        """
        return f"{numerator} / nullIf({denominator}, 0)"

    @staticmethod
    def wow_comparison_query(
        metric_field: str = "count()",
        group_field: str = "properties.$group_0",
        min_baseline: int = 5,
        growth_threshold: float = 1.5,
        lookback_weeks: int = 2
    ) -> str:
        """
        Generic week-over-week comparison query.

        Args:
            metric_field: Metric to compare
            group_field: Field to group by
            min_baseline: Minimum previous period value
            growth_threshold: Growth multiplier threshold
            lookback_weeks: How many weeks to look back

        Returns:
            Complete HogQL query
        """
        days = lookback_weeks * 7
        return f"""
        WITH this_week AS (
            SELECT
                {group_field} as entity_id,
                {metric_field} as current_value
            FROM events
            WHERE timestamp >= now() - INTERVAL {days} DAY
            AND properties.$group_0 IS NOT NULL
            GROUP BY entity_id
        ),
        last_week AS (
            SELECT
                {group_field} as entity_id,
                {metric_field} as previous_value
            FROM events
            WHERE timestamp >= now() - INTERVAL {days * 2} DAY
            AND timestamp < now() - INTERVAL {days} DAY
            AND properties.$group_0 IS NOT NULL
            GROUP BY entity_id
        )
        SELECT
            t.entity_id as company_id,
            t.current_value as current,
            l.previous_value as previous,
            round((t.current_value - l.previous_value) / nullIf(l.previous_value, 0) * 100, 1) as change_pct,
            CASE
                WHEN t.current_value >= l.previous_value * {growth_threshold} THEN 'growth'
                WHEN t.current_value <= l.previous_value * {1/growth_threshold} THEN 'decline'
                ELSE 'stable'
            END as trend
        FROM this_week t
        LEFT JOIN last_week l ON t.entity_id = l.entity_id
        WHERE l.previous_value >= {min_baseline}
        ORDER BY change_pct DESC
        """
