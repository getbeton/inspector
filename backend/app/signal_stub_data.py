"""
Stub data for Beton Signal Discovery MVP
Provides realistic mock data for signals, backtesting, and analytics
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any
import random

# Company Settings
COMPANY_SETTINGS = {
    "avg_acv": 27000,
    "baseline_conversion": 0.034,
    "sales_cycle_days": 45,
    "currency": "USD",
    "min_confidence": 0.90,
    "min_sample_size": 30,
    "min_lift": 1.5,
}

# Discovered Signals with full backtest data
DISCOVERED_SIGNALS = [
    {
        "id": "sig_001",
        "name": "Onboarding completed within 3 days",
        "description": "Users who complete the onboarding checklist within 3 days of signup",
        "source": "PostHog",
        "event": "onboarding_completed",
        "condition": "days_since_signup <= 3",
        "lift": 4.2,
        "confidence": 0.997,
        "p_value": 0.001,
        "sample_with": 1247,
        "sample_without": 8934,
        "conversion_with": 0.142,
        "conversion_without": 0.034,
        "leads_per_month": 47,
        "status": "enabled",
        "health": "healthy",
        "accuracy_trend": [0.88, 0.91, 0.89, 0.92, 0.90, 0.91],
        "ci_lower": 3.8,
        "ci_upper": 4.6,
    },
    {
        "id": "sig_002",
        "name": "Invited 2+ teammates",
        "description": "Users who invite at least 2 team members",
        "source": "PostHog",
        "event": "teammate_invited",
        "condition": "count >= 2",
        "lift": 3.8,
        "confidence": 0.994,
        "p_value": 0.002,
        "sample_with": 823,
        "sample_without": 9358,
        "conversion_with": 0.129,
        "conversion_without": 0.034,
        "leads_per_month": 31,
        "status": "enabled",
        "health": "healthy",
        "accuracy_trend": [0.87, 0.89, 0.88, 0.90, 0.88, 0.89],
        "ci_lower": 3.4,
        "ci_upper": 4.2,
    },
    {
        "id": "sig_003",
        "name": "Pricing page visited 2+ times",
        "description": "Users who visit pricing page multiple times",
        "source": "PostHog",
        "event": "pageview",
        "condition": "page = '/pricing' AND count >= 2",
        "lift": 3.1,
        "confidence": 0.951,
        "p_value": 0.015,
        "sample_with": 654,
        "sample_without": 9527,
        "conversion_with": 0.105,
        "conversion_without": 0.034,
        "leads_per_month": 23,
        "status": "enabled",
        "health": "degrading",
        "accuracy_trend": [0.89, 0.87, 0.82, 0.78, 0.75, 0.72],
        "ci_lower": 2.8,
        "ci_upper": 3.4,
    },
    {
        "id": "sig_004",
        "name": "API key created",
        "description": "Users who create an API key",
        "source": "PostHog",
        "event": "api_key_created",
        "condition": "event exists",
        "lift": 2.9,
        "confidence": 0.982,
        "p_value": 0.005,
        "sample_with": 512,
        "sample_without": 9669,
        "conversion_with": 0.099,
        "conversion_without": 0.034,
        "leads_per_month": 19,
        "status": "enabled",
        "health": "healthy",
        "accuracy_trend": [0.84, 0.85, 0.86, 0.85, 0.87, 0.85],
        "ci_lower": 2.6,
        "ci_upper": 3.2,
    },
    {
        "id": "sig_005",
        "name": "Dashboard created",
        "description": "Users who create their first dashboard",
        "source": "PostHog",
        "event": "dashboard_created",
        "condition": "event exists",
        "lift": 2.4,
        "confidence": 0.945,
        "p_value": 0.018,
        "sample_with": 892,
        "sample_without": 9289,
        "conversion_with": 0.082,
        "conversion_without": 0.034,
        "leads_per_month": 28,
        "status": "enabled",
        "health": "healthy",
        "accuracy_trend": [0.83, 0.84, 0.85, 0.84, 0.86, 0.84],
        "ci_lower": 2.2,
        "ci_upper": 2.6,
    },
    {
        "id": "sig_006",
        "name": "Weekly active 3+ weeks",
        "description": "Users active at least once per week for 3+ weeks",
        "source": "PostHog",
        "event": "session_start",
        "condition": "weekly_active_weeks >= 3",
        "lift": 2.1,
        "confidence": 0.912,
        "p_value": 0.028,
        "sample_with": 1156,
        "sample_without": 9025,
        "conversion_with": 0.071,
        "conversion_without": 0.034,
        "leads_per_month": 34,
        "status": "enabled",
        "health": "healthy",
        "accuracy_trend": [0.81, 0.82, 0.83, 0.81, 0.82, 0.81],
        "ci_lower": 1.9,
        "ci_upper": 2.3,
    },
    {
        "id": "sig_007",
        "name": "Company size 50-500 employees",
        "description": "Users from mid-market companies (50-500 employees)",
        "source": "Attio",
        "event": "company_enriched",
        "condition": "employee_count BETWEEN 50 AND 500",
        "lift": 1.9,
        "confidence": 0.934,
        "p_value": 0.021,
        "sample_with": 1432,
        "sample_without": 8749,
        "conversion_with": 0.065,
        "conversion_without": 0.034,
        "leads_per_month": 52,
        "status": "enabled",
        "health": "healthy",
        "accuracy_trend": [0.82, 0.83, 0.84, 0.83, 0.85, 0.83],
        "ci_lower": 1.7,
        "ci_upper": 2.1,
    },
    {
        "id": "sig_008",
        "name": "Used 3+ core features",
        "description": "Users who engage with 3 or more core product features",
        "source": "PostHog",
        "event": "feature_used",
        "condition": "distinct_features >= 3",
        "lift": 2.7,
        "confidence": 0.968,
        "p_value": 0.009,
        "sample_with": 734,
        "sample_without": 9447,
        "conversion_with": 0.092,
        "conversion_without": 0.034,
        "leads_per_month": 26,
        "status": "enabled",
        "health": "healthy",
        "accuracy_trend": [0.85, 0.86, 0.87, 0.86, 0.88, 0.86],
        "ci_lower": 2.4,
        "ci_upper": 3.0,
    },
    {
        "id": "sig_009",
        "name": "Connected integration",
        "description": "Users who connect at least one third-party integration",
        "source": "PostHog",
        "event": "integration_connected",
        "condition": "event exists",
        "lift": 3.3,
        "confidence": 0.978,
        "p_value": 0.006,
        "sample_with": 445,
        "sample_without": 9736,
        "conversion_with": 0.112,
        "conversion_without": 0.034,
        "leads_per_month": 17,
        "status": "enabled",
        "health": "healthy",
        "accuracy_trend": [0.86, 0.87, 0.88, 0.87, 0.89, 0.87],
        "ci_lower": 3.0,
        "ci_upper": 3.6,
    },
    {
        "id": "sig_010",
        "name": "Documentation visited 5+ times",
        "description": "Users who visit documentation multiple times (power users)",
        "source": "PostHog",
        "event": "pageview",
        "condition": "page LIKE '/docs/%' AND count >= 5",
        "lift": 1.8,
        "confidence": 0.903,
        "p_value": 0.032,
        "sample_with": 567,
        "sample_without": 9614,
        "conversion_with": 0.061,
        "conversion_without": 0.034,
        "leads_per_month": 21,
        "status": "disabled",
        "health": "healthy",
        "accuracy_trend": [0.80, 0.81, 0.82, 0.81, 0.83, 0.81],
        "ci_lower": 1.6,
        "ci_upper": 2.0,
    },
]

# Data Sources
DATA_SOURCES = {
    "posthog": {
        "name": "PostHog",
        "type": "Behavioral",
        "status": "connected",
        "last_sync": "2 hours ago",
        "events_count": 1_847_293,
        "users_count": 34_521,
        "date_range": "Jan 2024 - Dec 2024",
        "health": "healthy"
    },
    "attio": {
        "name": "Attio",
        "type": "CRM",
        "status": "connected",
        "last_sync": "1 hour ago",
        "deals_count": 847,
        "contacts_count": 12_456,
        "date_range": "Jan 2024 - Dec 2024",
        "health": "healthy"
    },
    "stripe": {
        "name": "Stripe",
        "type": "Billing",
        "status": "not_connected",
    },
    "intercom": {
        "name": "Intercom",
        "type": "Support",
        "status": "not_connected",
    }
}

# Recent Leads (for dashboard)
RECENT_LEADS = [
    {
        "company": "Acme Corp",
        "signal": "Onboarding completed within 3 days",
        "score": 94,
        "status": "new",
        "email": "jane@acme.com",
        "last_seen": datetime.now() - timedelta(hours=2)
    },
    {
        "company": "TechStart Inc",
        "signal": "Invited 2+ teammates",
        "score": 87,
        "status": "contacted",
        "email": "john@techstart.io",
        "last_seen": datetime.now() - timedelta(hours=5)
    },
    {
        "company": "DataFlow Solutions",
        "signal": "API key created",
        "score": 82,
        "status": "new",
        "email": "sarah@dataflow.com",
        "last_seen": datetime.now() - timedelta(hours=12)
    },
    {
        "company": "CloudNine Systems",
        "signal": "Connected integration",
        "score": 79,
        "status": "qualified",
        "email": "mike@cloudnine.co",
        "last_seen": datetime.now() - timedelta(days=1)
    },
]

# PostHog Events (for backtest builder)
POSTHOG_EVENTS = [
    {"event": "user_signed_up", "count": 34521},
    {"event": "onboarding_started", "count": 31245},
    {"event": "onboarding_completed", "count": 18734},
    {"event": "pageview", "count": 1847293},
    {"event": "feature_used", "count": 892341},
    {"event": "dashboard_created", "count": 12456},
    {"event": "api_key_created", "count": 2341},
    {"event": "teammate_invited", "count": 4532},
    {"event": "integration_connected", "count": 1876},
    {"event": "session_start", "count": 456789},
    {"event": "project_created", "count": 8934},
    {"event": "export_data", "count": 3421},
]

# PostHog Properties
POSTHOG_PROPERTIES = [
    {"property": "days_since_signup", "type": "number"},
    {"property": "company_name", "type": "string"},
    {"property": "company_size", "type": "number"},
    {"property": "plan", "type": "string"},
    {"property": "page_path", "type": "string"},
    {"property": "feature_name", "type": "string"},
    {"property": "user_role", "type": "string"},
    {"property": "employee_count", "type": "number"},
]

# Playbooks
PLAYBOOKS = [
    {
        "id": "pb_001",
        "name": "High-Intent PQL Alert",
        "description": "Alert sales when high-intent product qualified leads appear",
        "conditions": [
            {"signal_id": "sig_001", "operator": "AND"},
            {"signal_id": "sig_007", "operator": None},
        ],
        "actions": ["slack_alert", "attio_update"],
        "status": "active",
        "leads_per_month": 23,
        "conversion_rate": 0.187,
    },
    {
        "id": "pb_002",
        "name": "Developer Interest",
        "description": "Track developers showing API/integration interest",
        "conditions": [
            {"signal_id": "sig_004", "operator": "OR"},
            {"signal_id": "sig_010", "operator": None},
        ],
        "actions": ["attio_update"],
        "status": "active",
        "leads_per_month": 34,
        "conversion_rate": 0.124,
    },
    {
        "id": "pb_003",
        "name": "Expansion Ready",
        "description": "Accounts showing signs of expansion opportunity",
        "conditions": [
            {"signal_id": "sig_002", "operator": "AND"},
            {"signal_id": "sig_006", "operator": None},
        ],
        "actions": ["slack_alert", "attio_update", "email_sequence"],
        "status": "paused",
        "leads_per_month": 18,
        "conversion_rate": 0.156,
    },
]

# Attio Field Mapping
ATTIO_FIELDS = [
    {"attio_field": "Lead Score", "type": "number", "beton_field": "signal_score", "mapped": True},
    {"attio_field": "Top Signal", "type": "text", "beton_field": "top_signal_name", "mapped": True},
    {"attio_field": "Signal Count", "type": "number", "beton_field": "signal_count", "mapped": True},
    {"attio_field": "Last Signal Date", "type": "date", "beton_field": "last_signal_timestamp", "mapped": True},
    {"attio_field": "Beton Link", "type": "url", "beton_field": "beton_profile_url", "mapped": True},
    {"attio_field": "Conversion Probability", "type": "number", "beton_field": "conversion_prob", "mapped": False},
    {"attio_field": "Revenue Potential", "type": "currency", "beton_field": "revenue_potential", "mapped": False},
]


def calculate_estimated_arr(signal: Dict[str, Any]) -> float:
    """Calculate projected annual revenue impact from a signal."""
    leads_per_month = signal["leads_per_month"]
    lift = signal["lift"]
    baseline_conversion = COMPANY_SETTINGS["baseline_conversion"]
    avg_acv = COMPANY_SETTINGS["avg_acv"]

    # Lift-adjusted conversion rate
    adjusted_conversion = baseline_conversion * lift

    # Monthly conversions from this signal
    monthly_conversions = leads_per_month * adjusted_conversion

    # Incremental conversions (above baseline)
    baseline_conversions = leads_per_month * baseline_conversion
    incremental_conversions = monthly_conversions - baseline_conversions

    # Annual impact
    annual_arr = incremental_conversions * 12 * avg_acv

    return round(annual_arr, 0)


def get_signal_health(accuracy_trend: List[float]) -> str:
    """Determine if signal is healthy or degrading based on accuracy trend."""
    if len(accuracy_trend) < 3:
        return "healthy"

    recent = accuracy_trend[-3:]  # Last 3 data points
    older = accuracy_trend[:-3]   # Older data points

    recent_avg = sum(recent) / len(recent)
    older_avg = sum(older) / len(older) if older else recent_avg

    # If accuracy dropped more than 10%, it's degrading
    if recent_avg < older_avg - 0.10:
        return "degrading"

    return "healthy"


def simulate_backtest(signal_definition: Dict[str, Any]) -> Dict[str, Any]:
    """Simulate backtest results for a user-defined signal."""
    base_lift = random.uniform(1.5, 4.5)
    base_confidence = random.uniform(0.85, 0.99)

    sample_with = random.randint(200, 2000)
    sample_without = random.randint(5000, 15000)

    baseline_conversion = COMPANY_SETTINGS["baseline_conversion"]
    signal_conversion = baseline_conversion * base_lift

    is_significant = base_confidence > 0.90 and base_lift > 1.5

    converted_with = int(sample_with * signal_conversion)
    converted_without = int(sample_without * baseline_conversion)

    # Calculate monthly matches (rough estimate)
    total_users = 34521
    match_rate = sample_with / (sample_with + sample_without)
    monthly_growth = 500
    monthly_matches = int(monthly_growth * match_rate)

    return {
        "lift": round(base_lift, 1),
        "confidence": round(base_confidence, 3),
        "p_value": round(1 - base_confidence, 3),
        "sample_with": sample_with,
        "sample_without": sample_without,
        "converted_with": converted_with,
        "converted_without": converted_without,
        "conversion_with": round(signal_conversion, 3),
        "conversion_without": round(baseline_conversion, 3),
        "is_significant": is_significant,
        "recommendation": "Enable" if is_significant else "Review",
        "monthly_matches": monthly_matches,
        "ci_lower": round(base_lift * 0.85, 1),
        "ci_upper": round(base_lift * 1.15, 1),
    }
