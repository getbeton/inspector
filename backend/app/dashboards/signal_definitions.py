"""
Signal type definitions and detection queries.

Defines the 8 signal types Beton detects, their base scores,
and the HogQL queries used for detection.
"""
from dataclasses import dataclass
from typing import Dict, Optional


@dataclass
class SignalDefinition:
    """Definition of a detectable signal type."""
    signal_type: str
    description: str
    base_score: int
    query_key: str
    requires_data_sources: list[str] = None

    def __post_init__(self):
        if self.requires_data_sources is None:
            self.requires_data_sources = []


# Signal Definitions
SIGNAL_DEFINITIONS: Dict[str, SignalDefinition] = {
    "usage_spike": SignalDefinition(
        signal_type="usage_spike",
        description="Account activity increased >50% week-over-week",
        base_score=25,
        query_key="usage_spike_detection",
        requires_data_sources=["events"]
    ),
    "pricing_intent": SignalDefinition(
        signal_type="pricing_intent",
        description="User visited pricing/upgrade pages multiple times",
        base_score=30,
        query_key="pricing_page_visits",
        requires_data_sources=["events"]
    ),
    "feature_adoption": SignalDefinition(
        signal_type="feature_adoption",
        description="Account adopted 3+ new features this week",
        base_score=20,
        query_key="feature_adoption_velocity",
        requires_data_sources=["events"]
    ),
    "limit_approaching": SignalDefinition(
        signal_type="limit_approaching",
        description="Account at >80% of plan usage limits",
        base_score=35,
        query_key="limit_proximity",
        requires_data_sources=["events"]
    ),
    "trial_expiring": SignalDefinition(
        signal_type="trial_expiring",
        description="Trial ending within 7 days with active usage",
        base_score=30,
        query_key="trial_expiration",
        requires_data_sources=["events"]
    ),
    "team_growth": SignalDefinition(
        signal_type="team_growth",
        description="New users added to account this week",
        base_score=25,
        query_key="team_expansion",
        requires_data_sources=["events"]
    ),
    "support_engagement": SignalDefinition(
        signal_type="support_engagement",
        description="Multiple support interactions (buying signal for complex products)",
        base_score=15,
        query_key="intercom_engagement",
        requires_data_sources=["intercom"]
    ),
    "billing_intent": SignalDefinition(
        signal_type="billing_intent",
        description="User attempted to upgrade via Stripe",
        base_score=40,
        query_key="stripe_upgrade_intent",
        requires_data_sources=["stripe"]
    ),
}

# HogQL Queries for Signal Detection
SIGNAL_QUERIES: Dict[str, str] = {
    "usage_spike_detection": """
        WITH this_week AS (
            SELECT
                properties.$group_0 as company_id,
                count() as events,
                count(DISTINCT person_id) as users
            FROM events
            WHERE timestamp >= now() - INTERVAL 7 DAY
            AND properties.$group_0 IS NOT NULL
            GROUP BY company_id
            HAVING events >= 10
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
            t.events as current_events,
            t.users as current_users,
            l.events as previous_events,
            round((t.events - l.events) / nullIf(l.events, 0) * 100, 1) as growth_pct
        FROM this_week t
        INNER JOIN last_week l ON t.company_id = l.company_id
        WHERE l.events >= 5
        AND t.events >= l.events * 1.5
        ORDER BY growth_pct DESC
        LIMIT 100
    """,

    "pricing_page_visits": """
        SELECT
            properties.$group_0 as company_id,
            count() as pricing_views,
            count(DISTINCT person_id) as unique_viewers,
            max(timestamp) as last_view
        FROM events
        WHERE event = '$pageview'
        AND timestamp >= now() - INTERVAL 7 DAY
        AND properties.$group_0 IS NOT NULL
        AND (
            properties.$current_url LIKE '%pricing%'
            OR properties.$current_url LIKE '%upgrade%'
            OR properties.$current_url LIKE '%plans%'
            OR properties.$current_url LIKE '%billing%'
        )
        GROUP BY company_id
        HAVING pricing_views >= 2
        ORDER BY pricing_views DESC
        LIMIT 100
    """,

    "feature_adoption_velocity": """
        WITH recent_features AS (
            SELECT
                properties.$group_0 as company_id,
                event as feature,
                min(timestamp) as first_used
            FROM events
            WHERE timestamp >= now() - INTERVAL 7 DAY
            AND properties.$group_0 IS NOT NULL
            AND event NOT LIKE '$%'
            GROUP BY company_id, feature
        ),
        new_features AS (
            SELECT
                r.company_id,
                count() as new_feature_count
            FROM recent_features r
            LEFT JOIN (
                SELECT DISTINCT
                    properties.$group_0 as company_id,
                    event as feature
                FROM events
                WHERE timestamp < now() - INTERVAL 7 DAY
                AND timestamp >= now() - INTERVAL 60 DAY
            ) old ON r.company_id = old.company_id AND r.feature = old.feature
            WHERE old.feature IS NULL
            GROUP BY r.company_id
        )
        SELECT
            company_id,
            new_feature_count
        FROM new_features
        WHERE new_feature_count >= 3
        ORDER BY new_feature_count DESC
        LIMIT 100
    """,

    "limit_proximity": """
        SELECT
            properties.$group_0 as company_id,
            properties.plan_tier as plan,
            properties.usage_count as current_usage,
            properties.usage_limit as plan_limit,
            round(properties.usage_count / nullIf(properties.usage_limit, 0) * 100, 1) as usage_pct
        FROM events
        WHERE event = 'usage_tracked'
        AND timestamp >= now() - INTERVAL 1 DAY
        AND properties.usage_count / nullIf(properties.usage_limit, 1) >= 0.8
        ORDER BY usage_pct DESC
        LIMIT 100
    """,

    "trial_expiration": """
        SELECT
            properties.$group_0 as company_id,
            person_id,
            properties.trial_end_date as trial_ends,
            dateDiff('day', now(), toDateTime(properties.trial_end_date)) as days_remaining,
            count() as recent_events
        FROM events
        WHERE timestamp >= now() - INTERVAL 7 DAY
        AND properties.trial_end_date IS NOT NULL
        AND toDateTime(properties.trial_end_date) BETWEEN now() AND now() + INTERVAL 7 DAY
        GROUP BY company_id, person_id, trial_ends
        ORDER BY trial_ends ASC
    """,

    "team_expansion": """
        WITH new_users AS (
            SELECT
                properties.$group_0 as company_id,
                person_id,
                min(timestamp) as first_seen
            FROM events
            WHERE timestamp >= now() - INTERVAL 7 DAY
            AND properties.$group_0 IS NOT NULL
            GROUP BY company_id, person_id
        ),
        previous_users AS (
            SELECT DISTINCT
                properties.$group_0 as company_id,
                person_id
            FROM events
            WHERE timestamp < now() - INTERVAL 7 DAY
            AND timestamp >= now() - INTERVAL 90 DAY
            AND properties.$group_0 IS NOT NULL
        )
        SELECT
            n.company_id,
            count() as new_users_count
        FROM new_users n
        LEFT JOIN previous_users p
            ON n.company_id = p.company_id
            AND n.person_id = p.person_id
        WHERE p.person_id IS NULL
        GROUP BY n.company_id
        HAVING new_users_count >= 2
        ORDER BY new_users_count DESC
        LIMIT 100
    """,

    "intercom_engagement": """
        SELECT
            properties.$group_0 as company_id,
            count() as support_events,
            countIf(event = 'conversation_started') as conversations,
            countIf(event = 'help_article_viewed') as articles_viewed
        FROM events
        WHERE timestamp >= now() - INTERVAL 14 DAY
        AND properties.$group_0 IS NOT NULL
        AND event IN ('conversation_started', 'conversation_rated', 'help_article_viewed')
        GROUP BY company_id
        HAVING support_events >= 3
        ORDER BY support_events DESC
        LIMIT 100
    """,

    "stripe_upgrade_intent": """
        SELECT
            properties.$group_0 as company_id,
            countIf(event LIKE '%checkout%') as checkout_events,
            countIf(event = 'subscription_updated') as subscription_updates,
            max(timestamp) as last_billing_activity
        FROM events
        WHERE timestamp >= now() - INTERVAL 7 DAY
        AND properties.$group_0 IS NOT NULL
        AND (
            event LIKE '%checkout%'
            OR event LIKE '%subscription%'
            OR event LIKE '%upgrade%'
            OR event = 'invoice_paid'
        )
        GROUP BY company_id
        HAVING checkout_events >= 1 OR subscription_updates >= 1
        ORDER BY checkout_events DESC
        LIMIT 100
    """,
}


def get_signal_definition(signal_type: str) -> Optional[SignalDefinition]:
    """Get definition for a signal type."""
    return SIGNAL_DEFINITIONS.get(signal_type)


def get_signal_query(query_key: str) -> Optional[str]:
    """Get HogQL query for a signal."""
    return SIGNAL_QUERIES.get(query_key)


def list_signal_types() -> list[str]:
    """Get all available signal types."""
    return list(SIGNAL_DEFINITIONS.keys())
