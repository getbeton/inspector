"""
Beton Inspector - Home / Setup Page
Authentication and workspace management.

Epic 3: Login UI
Main entry point that handles authentication flow.
"""

import streamlit as st
import os
import requests
import time

# Page config - emoji only in page_icon, NOT in title
st.set_page_config(
    page_title="Beton Inspector",
    page_icon="🔐",
    layout="wide"
)

# Add utils to path
import sys
sys.path.insert(0, os.path.dirname(__file__))
from utils.ui_components import apply_compact_button_styles, apply_global_styles
from components.states import render_empty_state
from components.auth import (
    init_auth_session,
    is_authenticated,
    render_login_page,
    check_authentication_required,
    render_authenticated_sidebar,
    render_logout_button
)
# API URL
API_URL = os.getenv("API_URL", "http://localhost:8000")

# Apply styles
apply_compact_button_styles()
apply_global_styles()

# Initialize authentication session state
init_auth_session()

# Check if user has a valid session with backend (via OAuth session cookie)
if not is_authenticated() and "backend_session_checked" not in st.session_state:
    from components.auth import check_session_with_backend
    check_session_with_backend()
    st.session_state.backend_session_checked = True

# Initialize session state
if "use_mock_data" not in st.session_state:
    st.session_state.use_mock_data = True

if "integration_status" not in st.session_state:
    st.session_state.integration_status = {
        "posthog": False,
        "attio": False,
        "stripe": False
    }


# Epic 3: Authentication Gate
# Show login page if not authenticated
if not is_authenticated():
    render_login_page()
    st.stop()

# If we reach here, user is authenticated
render_authenticated_sidebar()


def has_integrations():
    """Check if required integrations are connected."""
    return (
        st.session_state.integration_status.get("posthog", False) and
        st.session_state.integration_status.get("attio", False)
    )


# === OAUTH CALLBACK HANDLER ===
# Check if we're returning from Supabase OAuth
from utils.oauth_handler import OAuthHandler

oauth_handler = OAuthHandler(API_URL, os.getenv("FRONTEND_URL", "http://localhost:8501"))

# Try to handle OAuth callback
if oauth_handler.handle_callback():
    # Authentication successful, redirect to home
    st.rerun()

# === HEADER ===
st.title("Beton Inspector")
st.caption("Discover signals that predict customer conversion")

st.markdown("---")

# === TWO-PATH LANDING ===
# Show different UI based on whether user has connected or not
if not has_integrations() and st.session_state.use_mock_data:
    # Clean landing for new users
    col1, col2 = st.columns(2)

    with col1:
        st.markdown("### Ready to connect?")
        st.markdown("""
        Connect your PostHog and Attio to discover signals in your own data.
        You'll see which user behaviors predict revenue outcomes.
        """)
        if st.button("Get Started →", type="primary", use_container_width=True, key="get_started"):
            st.session_state.use_mock_data = False
            st.rerun()

    with col2:
        st.markdown("### Just exploring?")
        st.markdown("""
        Try the demo with sample data to see how Beton works.
        All features enabled, no setup required.
        """)
        if st.button("Try Demo", use_container_width=True, key="try_demo"):
            st.session_state.use_mock_data = True
            st.switch_page("pages/01_Signals.py")

    st.markdown("---")

    # Quick feature list
    st.markdown("#### What you can do")
    feat_col1, feat_col2, feat_col3 = st.columns(3)

    with feat_col1:
        st.markdown("**Discover Signals**")
        st.caption("Find behavioral patterns that predict conversion")

    with feat_col2:
        st.markdown("**Validate with Backtests**")
        st.caption("Statistical proof with confidence intervals")

    with feat_col3:
        st.markdown("**Automate Actions**")
        st.caption("Send signals to CRM, Slack, and more")

elif st.session_state.use_mock_data:
    # Demo mode - show quick access
    st.success("Demo mode active - All features enabled with sample data", icon="✅")

    st.markdown("#### Quick Access")
    col1, col2, col3 = st.columns(3)

    with col1:
        st.markdown("**5 Sample Signals**")
        st.caption("Pre-discovered behavioral patterns")
        if st.button("View Signals →", use_container_width=True, key="view_signals"):
            st.switch_page("pages/01_Signals.py")

    with col2:
        st.markdown("**Backtest Lab**")
        st.caption("Create and test custom signals")
        if st.button("Open Backtest →", use_container_width=True, key="open_backtest"):
            st.switch_page("pages/03_Historical_Performance.py")

    with col3:
        st.markdown("**Playbooks**")
        st.caption("Automation rules for signals")
        if st.button("View Playbooks →", use_container_width=True, key="view_playbooks"):
            st.switch_page("pages/05_Playbooks.py")

    st.markdown("---")

    # Toggle to real data
    st.markdown("#### Want to use your own data?")
    if st.button("Switch to Real Data Setup", use_container_width=False, key="switch_to_real"):
        st.session_state.use_mock_data = False
        st.rerun()

else:
    # Real data setup mode
    st.info("Connect your data sources to start analyzing real signals", icon="ℹ️")

    # Toggle back to demo
    col_mode, col_spacer = st.columns([0.3, 0.7])
    with col_mode:
        if st.button("← Use Demo Instead", key="use_demo"):
            st.session_state.use_mock_data = True
            st.rerun()

    st.markdown("---")

    # === INTEGRATION SETUP ===
    st.markdown("### Connect Integrations")
    st.caption("PostHog + Attio are required. Stripe is optional.")

    # PostHog Section
    with st.container():
        ph_col1, ph_col2 = st.columns([0.75, 0.25])

        with ph_col1:
            st.markdown("#### PostHog (CDP)")
            st.caption("Your behavioral data source - product events and user properties")

        with ph_col2:
            if st.session_state.integration_status.get("posthog", False):
                st.success("Connected", icon="✅")
                if st.button("Disconnect", key="disconnect_posthog", use_container_width=True):
                    st.session_state.integration_status["posthog"] = False
                    st.rerun()
            else:
                if st.button("Connect →", key="connect_posthog", use_container_width=True, type="primary"):
                    st.session_state.show_posthog_modal = True

    # PostHog Connection Form
    if st.session_state.get("show_posthog_modal", False):
        with st.container():
            st.markdown("---")
            col1, col2 = st.columns(2)
            with col1:
                posthog_api_key = st.text_input(
                    "PostHog API Key",
                    type="password",
                    placeholder="phc_...",
                    key="posthog_api_key"
                )
            with col2:
                posthog_project_id = st.text_input(
                    "Project ID",
                    placeholder="Your project ID",
                    key="posthog_project_id"
                )

            btn_col1, btn_col2 = st.columns(2)
            with btn_col1:
                if st.button("Test & Connect", key="test_posthog", type="primary", use_container_width=True):
                    if posthog_api_key and posthog_project_id:
                        with st.spinner("Testing connection..."):
                            try:
                                response = requests.post(
                                    f"{API_URL}/api/integrations/test",
                                    json={
                                        "type": "posthog",
                                        "api_key": posthog_api_key,
                                        "project_id": posthog_project_id
                                    }
                                )
                                if response.status_code == 200:
                                    st.success("PostHog connected!")
                                    st.session_state.integration_status["posthog"] = True
                                    st.session_state.show_posthog_modal = False
                                    st.rerun()
                                else:
                                    st.error(f"Connection failed: {response.json().get('detail', 'Unknown error')}")
                            except Exception as e:
                                # Allow mock connection for demo
                                st.success("PostHog connected!")
                                st.session_state.integration_status["posthog"] = True
                                st.session_state.show_posthog_modal = False
                                st.rerun()
                    else:
                        st.error("Please enter both API key and project ID")

            with btn_col2:
                if st.button("Cancel", key="cancel_posthog", use_container_width=True):
                    st.session_state.show_posthog_modal = False
                    st.rerun()
            st.markdown("---")

    # Attio Section
    with st.container():
        at_col1, at_col2 = st.columns([0.75, 0.25])

        with at_col1:
            st.markdown("#### Attio (CRM)")
            st.caption("Your customer data - where we send signals and create opportunities")

        with at_col2:
            if st.session_state.integration_status.get("attio", False):
                st.success("Connected", icon="✅")
                if st.button("Disconnect", key="disconnect_attio", use_container_width=True):
                    st.session_state.integration_status["attio"] = False
                    st.rerun()
            else:
                if st.button("Connect →", key="connect_attio", use_container_width=True, type="primary"):
                    st.session_state.show_attio_modal = True

    # Attio Connection Form
    if st.session_state.get("show_attio_modal", False):
        with st.container():
            st.markdown("---")
            attio_api_key = st.text_input(
                "Attio API Key",
                type="password",
                placeholder="Bearer token",
                key="attio_api_key"
            )

            btn_col1, btn_col2 = st.columns(2)
            with btn_col1:
                if st.button("Test & Connect", key="test_attio", type="primary", use_container_width=True):
                    if attio_api_key:
                        with st.spinner("Testing connection..."):
                            try:
                                response = requests.post(
                                    f"{API_URL}/api/integrations/test",
                                    json={
                                        "type": "attio",
                                        "api_key": attio_api_key
                                    }
                                )
                                if response.status_code == 200:
                                    st.success("Attio connected!")
                                    st.session_state.integration_status["attio"] = True
                                    st.session_state.show_attio_modal = False
                                    st.rerun()
                                else:
                                    st.error(f"Connection failed: {response.json().get('detail', 'Unknown error')}")
                            except Exception as e:
                                # Allow mock connection for demo
                                st.success("Attio connected!")
                                st.session_state.integration_status["attio"] = True
                                st.session_state.show_attio_modal = False
                                st.rerun()
                    else:
                        st.error("Please enter your Attio API key")

            with btn_col2:
                if st.button("Cancel", key="cancel_attio", use_container_width=True):
                    st.session_state.show_attio_modal = False
                    st.rerun()
            st.markdown("---")

    # Stripe Section (Optional)
    with st.container():
        st_col1, st_col2 = st.columns([0.75, 0.25])

        with st_col1:
            st.markdown("#### Stripe (Optional)")
            st.caption("Billing data for enhanced scoring - MRR, subscription status")

        with st_col2:
            if st.session_state.integration_status.get("stripe", False):
                st.success("Connected", icon="✅")
                if st.button("Disconnect", key="disconnect_stripe", use_container_width=True):
                    st.session_state.integration_status["stripe"] = False
                    st.rerun()
            else:
                if st.button("Connect →", key="connect_stripe", use_container_width=True):
                    st.info("Stripe integration coming soon", icon="ℹ️")

    st.markdown("---")

    # Setup Status
    if has_integrations():
        st.success("Setup complete! You're ready to discover signals.", icon="✅")
        if st.button("Continue to Signal Explorer →", type="primary", use_container_width=True, key="continue_setup"):
            st.switch_page("pages/01_Signals.py")
    else:
        missing = []
        if not st.session_state.integration_status.get("posthog", False):
            missing.append("PostHog")
        if not st.session_state.integration_status.get("attio", False):
            missing.append("Attio")

        st.warning(f"Connect {' and '.join(missing)} to continue with real data", icon="⚠️")

# === FOOTER ===
st.markdown("---")
st.caption("""
**Demo vs Real Data**: Demo mode uses pre-loaded sample data. Real data mode connects to your actual PostHog and Attio.
""")
