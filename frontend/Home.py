import streamlit as st
import os
import requests
from datetime import datetime
import time

# Page config
st.set_page_config(
    page_title="Setup | Beton Inspector",
    page_icon="⚙️",
    layout="wide"
)

# API URL
API_URL = os.getenv("API_URL", "http://localhost:8000")

# Initialize session state for data mode and integrations
if "use_mock_data" not in st.session_state:
    st.session_state.use_mock_data = True  # Default to mock data mode

if "integration_status" not in st.session_state:
    st.session_state.integration_status = {
        "posthog": False,
        "attio": False,
        "stripe": False
    }

# Top-right data mode toggle
col_title, col_toggle = st.columns([0.8, 0.2])
with col_toggle:
    use_mock = st.checkbox(
        "Use Mock Data",
        value=st.session_state.use_mock_data,
        key="mock_data_toggle"
    )
    if use_mock != st.session_state.use_mock_data:
        st.session_state.use_mock_data = use_mock
        st.toast(f"Switched to {'Mock Data' if use_mock else 'Real Data'} mode")

with col_title:
    st.title("⚙️ Setup & Data Mode")

st.markdown("---")

# Current Mode Display
if st.session_state.use_mock_data:
    st.success("✅ Using Mock Data - All features enabled for testing", icon="✅")
    st.markdown("""
    Mock data lets you explore all features instantly. Switch to **Real Data** to connect your
    actual integrations (PostHog, Attio, Stripe).
    """)

    # Mock Mode Benefits
    with st.container():
        st.markdown("### 📌 What's Included in Mock Mode:")
        col1, col2, col3 = st.columns(3)
        with col1:
            st.markdown("✅ 15 sample accounts")
            st.markdown("✅ 10 pre-discovered signals")
        with col2:
            st.markdown("✅ Full signal explorer")
            st.markdown("✅ Backtesting capability")
        with col3:
            st.markdown("✅ 3 playbooks configured")
            st.markdown("✅ All features enabled")

    st.markdown("---")

    # Next step button
    col_btn1, col_btn2, col_btn3 = st.columns([0.3, 0.3, 0.4])
    with col_btn1:
        if st.button("Next: Signal Explorer →", use_container_width=True, key="next_to_signals"):
            st.session_state.current_page = "03_Signals"
            st.switch_page("pages/01_Signals.py")

    with col_btn2:
        if st.button("Learn More", use_container_width=True):
            st.info("""
            **Signal Discovery & Validation Engine**

            Beton helps B2B SaaS companies automatically find which user behaviors predict
            revenue outcomes, validate them with backtesting, and track their accuracy over time.

            The mock data allows you to experience all features without connecting to real integrations.
            """)

else:
    st.info("⚙️ Real Data Mode - Configure your data sources below", icon="ℹ️")
    st.markdown("""
    Connect your actual data sources to start analyzing real signals.
    You need **PostHog** (behavioral data) + **Attio** (CRM) to get started.
    """)

    # Integration Connection UI
    st.markdown("### 🔌 Required Integrations")

    # PostHog Section
    with st.container():
        col_status, col_action = st.columns([0.7, 0.3])
        with col_status:
            st.markdown("#### PostHog (CDP) - Your behavioral data source")
            st.markdown("""
            PostHog contains your product events, user properties, and engagement data.
            We use this to discover signals that predict customer success.
            """)

        with col_action:
            if st.session_state.integration_status.get("posthog", False):
                st.success("✅ Connected")
                if st.button("Disconnect PostHog", use_container_width=True):
                    st.session_state.integration_status["posthog"] = False
                    st.toast("Disconnected PostHog")
            else:
                if st.button("→ Connect PostHog", use_container_width=True):
                    st.session_state.show_posthog_modal = True

    # PostHog Connection Modal
    if st.session_state.get("show_posthog_modal", False):
        with st.expander("PostHog Connection Details", expanded=True):
            col1, col2 = st.columns(2)
            with col1:
                posthog_api_key = st.text_input(
                    "PostHog API Key",
                    type="password",
                    placeholder="phc_...",
                    key="posthog_api_key_input"
                )
            with col2:
                posthog_project_id = st.text_input(
                    "PostHog Project ID",
                    placeholder="Your project ID",
                    key="posthog_project_id_input"
                )

            col_test, col_save = st.columns(2)
            with col_test:
                if st.button("Test Connection"):
                    if posthog_api_key and posthog_project_id:
                        with st.spinner("Testing PostHog connection..."):
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
                                    st.success("✅ PostHog connection successful!")
                                    st.session_state.integration_status["posthog"] = True
                                    st.session_state.show_posthog_modal = False
                                else:
                                    st.error(f"❌ Connection failed: {response.json().get('detail', 'Unknown error')}")
                            except Exception as e:
                                st.error(f"❌ Connection error: {str(e)}")
                    else:
                        st.error("Please enter both API key and project ID")

            with col_save:
                if st.button("Cancel"):
                    st.session_state.show_posthog_modal = False

    st.markdown("---")

    # Attio Section
    with st.container():
        col_status, col_action = st.columns([0.7, 0.3])
        with col_status:
            st.markdown("#### Attio (CRM) - Your customer data")
            st.markdown("""
            Attio is where we'll send signals and create opportunities.
            This enables automated lead routing and CRM field updates.
            """)

        with col_action:
            if st.session_state.integration_status.get("attio", False):
                st.success("✅ Connected")
                if st.button("Disconnect Attio", use_container_width=True):
                    st.session_state.integration_status["attio"] = False
                    st.toast("Disconnected Attio")
            else:
                if st.button("→ Connect Attio", use_container_width=True):
                    st.session_state.show_attio_modal = True

    # Attio Connection Modal
    if st.session_state.get("show_attio_modal", False):
        with st.expander("Attio Connection Details", expanded=True):
            attio_api_key = st.text_input(
                "Attio API Key",
                type="password",
                placeholder="Bearer token",
                key="attio_api_key_input"
            )

            col_test, col_save = st.columns(2)
            with col_test:
                if st.button("Test Connection", key="test_attio"):
                    if attio_api_key:
                        with st.spinner("Testing Attio connection..."):
                            try:
                                response = requests.post(
                                    f"{API_URL}/api/integrations/test",
                                    json={
                                        "type": "attio",
                                        "api_key": attio_api_key
                                    }
                                )
                                if response.status_code == 200:
                                    st.success("✅ Attio connection successful!")
                                    st.session_state.integration_status["attio"] = True
                                    st.session_state.show_attio_modal = False
                                else:
                                    st.error(f"❌ Connection failed: {response.json().get('detail', 'Unknown error')}")
                            except Exception as e:
                                st.error(f"❌ Connection error: {str(e)}")
                    else:
                        st.error("Please enter your Attio API key")

            with col_save:
                if st.button("Cancel", key="cancel_attio"):
                    st.session_state.show_attio_modal = False

    st.markdown("---")

    # Optional: Stripe
    st.markdown("#### 💳 Optional: Stripe (Billing) - Upgrade data")
    st.markdown("Stripe integration provides billing and revenue data for enhanced scoring.")

    if st.session_state.integration_status.get("stripe", False):
        st.success("✅ Connected")
        if st.button("Disconnect Stripe", use_container_width=True):
            st.session_state.integration_status["stripe"] = False
    else:
        if st.button("→ Connect Stripe", use_container_width=True):
            st.info("Stripe integration modal would appear here")

    st.markdown("---")

    # Setup Status
    required_connected = st.session_state.integration_status.get("posthog", False) and st.session_state.integration_status.get("attio", False)

    if required_connected:
        col_proceed, col_back = st.columns(2)
        with col_proceed:
            if st.button("✓ Setup Complete → Signal Explorer", use_container_width=True):
                st.session_state.current_page = "03_Signals"
                st.switch_page("pages/01_Signals.py")

        with col_back:
            if st.button("← Use Mock Data Instead", use_container_width=True):
                st.session_state.use_mock_data = True
                st.rerun()
    else:
        st.warning(
            "⚠️ Setup Incomplete: Connect PostHog + Attio to proceed with real data mode",
            icon="⚠️"
        )

        col_setup, col_mock = st.columns(2)
        with col_setup:
            st.info("Missing integrations:")
            if not st.session_state.integration_status.get("posthog", False):
                st.markdown("- ⚪ PostHog")
            if not st.session_state.integration_status.get("attio", False):
                st.markdown("- ⚪ Attio")

        with col_mock:
            st.info("**Prefer testing without setup?**")
            if st.button("← Use Mock Data Instead", use_container_width=True, key="use_mock_instead"):
                st.session_state.use_mock_data = True
                st.rerun()

st.markdown("---")

# Footer info
st.markdown("""
<div style='font-size: 12px; color: #666;'>

**What's the difference?**
- **Mock Data**: Pre-loaded sample data for exploring all features. No integrations needed.
- **Real Data**: Connect your actual PostHog + Attio to analyze real signals from your product.

</div>
""", unsafe_allow_html=True)
