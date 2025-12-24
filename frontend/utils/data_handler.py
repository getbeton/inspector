"""
Global data handler for mock/real data mode switching.
Used across all pages to determine data source and handle API calls.
"""

import streamlit as st
import requests
from typing import Optional, Dict, Any
from functools import wraps
import os

API_URL = os.getenv("API_URL", "http://localhost:8000")

def is_mock_mode() -> bool:
    """Check if app is currently in mock data mode."""
    return st.session_state.get("use_mock_data", True)

def set_mock_mode(enabled: bool) -> None:
    """Set the mock data mode."""
    st.session_state.use_mock_data = enabled

def get_data_mode_label() -> str:
    """Get label for current data mode."""
    return "⚙️ Mock Data" if is_mock_mode() else "🔗 Real Data"

def render_data_mode_toggle(location="top"):
    """
    Render a data mode toggle widget.
    Location can be "top", "sidebar", or "custom".
    """
    if location == "top":
        col1, col2 = st.columns([0.9, 0.1])
        with col2:
            use_mock = st.checkbox(
                "Mock",
                value=is_mock_mode(),
                key=f"data_toggle_{id(st)}",
                label_visibility="collapsed"
            )
            if use_mock != is_mock_mode():
                set_mock_mode(use_mock)
                st.toast(f"Switched to {'Mock' if use_mock else 'Real'} Data")
                st.rerun()

    elif location == "sidebar":
        st.sidebar.markdown("---")
        use_mock = st.sidebar.checkbox(
            "Use Mock Data",
            value=is_mock_mode(),
            key=f"sidebar_data_toggle_{id(st)}"
        )
        if use_mock != is_mock_mode():
            set_mock_mode(use_mock)
            st.toast(f"Switched to {'Mock' if use_mock else 'Real'} Data")

def get_api_data(endpoint: str, method: str = "GET", json_data: Optional[Dict] = None, use_mock_override: Optional[bool] = None) -> Optional[Dict[str, Any]]:
    """
    Fetch data from API, using mock data if in mock mode.

    Args:
        endpoint: API endpoint path (e.g., "/api/signals/list")
        method: HTTP method (GET, POST, etc.)
        json_data: JSON data for POST requests
        use_mock_override: Override mock mode detection (for testing)

    Returns:
        Response data or None if failed
    """
    use_mock = use_mock_override if use_mock_override is not None else is_mock_mode()

    # Add mock_mode parameter to all requests
    try:
        if method.upper() == "GET":
            response = requests.get(
                f"{API_URL}{endpoint}",
                params={"mock_mode": use_mock}
            )
        elif method.upper() == "POST":
            response = requests.post(
                f"{API_URL}{endpoint}",
                json=json_data or {},
                params={"mock_mode": use_mock}
            )
        else:
            return None

        if response.status_code == 200:
            return response.json()
        else:
            st.error(f"API Error ({response.status_code}): {response.text}")
            return None

    except requests.exceptions.ConnectionError:
        if use_mock:
            st.warning("Cannot reach backend, but mock data is available")
            return {"mock": True, "error": "connection"}
        else:
            st.error("Cannot connect to backend. Try switching to mock data mode.")
            return None
    except Exception as e:
        st.error(f"Error fetching data: {str(e)}")
        return None

def show_mock_data_banner():
    """Show a banner indicating mock data is active."""
    if is_mock_mode():
        st.info(
            "⚙️ Using Mock Data - Switch to Real Data mode in Setup to connect your integrations",
            icon="ℹ️"
        )

def show_empty_state_with_cta(title: str, message: str, cta_text: str = "← Back to Setup", go_to_setup: bool = True):
    """
    Show an empty state with call-to-action.

    Args:
        title: Empty state title
        message: Empty state message
        cta_text: Call-to-action button text
        go_to_setup: If True, button navigates to setup page
    """
    col1, col2, col3 = st.columns([0.2, 0.6, 0.2])

    with col2:
        st.markdown(f"### {title}")
        st.markdown(message)

        if go_to_setup:
            if st.button(cta_text, use_container_width=True):
                st.switch_page("Home.py")
        else:
            st.info("Please configure your integrations or switch to mock data mode.")

def show_no_real_data_state(component_name: str = "data"):
    """Show state when real mode is ON but no data is available."""
    st.warning(
        f"📊 No {component_name} available\n\n"
        f"We haven't received data yet. This may take a moment.\n\n"
        f"**Options:**\n"
        f"- [← Return to Setup](./Home.py) to check integrations\n"
        f"- Toggle to Mock Data mode above to explore sample data",
        icon="⚠️"
    )

def with_data_mode_fallback(fallback_data: Optional[Dict] = None):
    """
    Decorator to provide fallback mock data when real data fetch fails.

    Usage:
        @with_data_mode_fallback(fallback_data={"signals": []})
        def my_function():
            return get_api_data("/api/signals/list")
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                result = func(*args, **kwargs)
                return result
            except Exception as e:
                if is_mock_mode():
                    st.warning(f"Using fallback data: {str(e)}")
                    return fallback_data
                else:
                    raise
        return wrapper
    return decorator

# Mock data collections with full comparison metrics
MOCK_SIGNALS = [
    {
        "id": "sig_001",
        "name": "Onboarding completed within 3 days",
        "status": "active",
        "lift": 4.2,
        "confidence": 0.997,
        "leads_per_month": 47,
        "estimated_arr": 378000,
        "source": "Beton-Discovered",
        "trend_30d": "+12%",
        # Comparison data
        "sample_with": 1456,
        "sample_without": 8725,
        "conversion_with": 0.143,
        "conversion_without": 0.034,
        # Sparkline data (last 7 days)
        "trend_data": [3.9, 4.0, 4.1, 4.3, 4.2, 4.4, 4.2],
        "accuracy_trend": [0.85, 0.87, 0.89, 0.91, 0.90, 0.88, 0.90]
    },
    {
        "id": "sig_002",
        "name": "Invited 2+ teammates",
        "status": "active",
        "lift": 3.8,
        "confidence": 0.99,
        "leads_per_month": 31,
        "estimated_arr": 249000,
        "source": "Beton-Discovered",
        "trend_30d": "+8%",
        "sample_with": 982,
        "sample_without": 9198,
        "conversion_with": 0.129,
        "conversion_without": 0.034,
        "trend_data": [3.5, 3.6, 3.7, 3.8, 3.9, 3.7, 3.8],
        "accuracy_trend": [0.82, 0.84, 0.86, 0.88, 0.87, 0.86, 0.88]
    },
    {
        "id": "sig_003",
        "name": "Pricing page visited 2+ times",
        "status": "active",
        "lift": 3.1,
        "confidence": 0.95,
        "leads_per_month": 23,
        "estimated_arr": 185000,
        "source": "Beton-Discovered",
        "trend_30d": "-3%",
        "sample_with": 743,
        "sample_without": 9437,
        "conversion_with": 0.105,
        "conversion_without": 0.034,
        "trend_data": [3.3, 3.2, 3.1, 3.0, 3.1, 3.2, 3.1],
        "accuracy_trend": [0.78, 0.79, 0.77, 0.76, 0.78, 0.79, 0.78]
    },
    {
        "id": "sig_004",
        "name": "API key created",
        "status": "active",
        "lift": 2.9,
        "confidence": 0.98,
        "leads_per_month": 19,
        "estimated_arr": 153000,
        "source": "Beton-Discovered",
        "trend_30d": "+5%",
        "sample_with": 621,
        "sample_without": 9559,
        "conversion_with": 0.099,
        "conversion_without": 0.034,
        "trend_data": [2.7, 2.8, 2.8, 2.9, 2.9, 2.8, 2.9],
        "accuracy_trend": [0.80, 0.81, 0.83, 0.85, 0.84, 0.83, 0.85]
    },
    {
        "id": "sig_005",
        "name": "Dashboard created",
        "status": "draft",
        "lift": 2.4,
        "confidence": 0.94,
        "leads_per_month": 28,
        "estimated_arr": 225000,
        "source": "User-Defined",
        "trend_30d": "+2%",
        "sample_with": 891,
        "sample_without": 9289,
        "conversion_with": 0.082,
        "conversion_without": 0.034,
        "trend_data": [2.3, 2.3, 2.4, 2.4, 2.5, 2.4, 2.4],
        "accuracy_trend": [0.75, 0.76, 0.78, 0.79, 0.78, 0.77, 0.79]
    }
]

MOCK_DATA_SOURCES = {
    "posthog": {
        "name": "PostHog",
        "type": "CDP",
        "status": "connected",
        "last_sync": "2 hours ago",
        "events_count": 1847293,
        "users_count": 34521,
        "date_range": "Jan 2024 - Dec 2024"
    },
    "attio": {
        "name": "Attio",
        "type": "CRM",
        "status": "connected",
        "last_sync": "1 hour ago",
        "deals_count": 847,
        "contacts_count": 12456,
        "date_range": "Jan 2024 - Dec 2024"
    },
    "stripe": {
        "name": "Stripe",
        "type": "Billing",
        "status": "not_connected"
    }
}

def get_mock_signals():
    """Get mock signals data."""
    return MOCK_SIGNALS

def get_mock_data_sources():
    """Get mock data sources status."""
    return MOCK_DATA_SOURCES
