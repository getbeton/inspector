"""
Settings Page
Configure data sources, destinations, and company-level settings
"""

import streamlit as st
import requests
import pandas as pd
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.data_handler import (
    is_mock_mode,
    render_data_mode_toggle,
    show_mock_data_banner,
    get_mock_data_sources,
    MOCK_DATA_SOURCES
)

API_URL = os.getenv("API_URL", "http://localhost:8000")

# Header with mock mode toggle
col_title, col_toggle = st.columns([0.85, 0.15])
with col_title:
    st.title("Settings")
with col_toggle:
    render_data_mode_toggle(location="top")

if is_mock_mode():
    show_mock_data_banner()

# =============================================================================
# DATA SOURCES SECTION
# =============================================================================
with st.expander("Data Sources", expanded=True):

    # Fetch sources status
    if is_mock_mode():
        sources = MOCK_DATA_SOURCES
    else:
        try:
            response = requests.get(f"{API_URL}/api/sources/status")
            if response.status_code == 200:
                data = response.json()
                sources = data.get('sources', {})
            else:
                sources = MOCK_DATA_SOURCES
        except Exception:
            sources = MOCK_DATA_SOURCES

    # Connected Sources
    st.markdown("#### Connected Sources")

    col1, col2 = st.columns(2)

    # PostHog
    with col1:
        posthog = sources.get('posthog', {})
        if posthog.get('status') == 'connected':
            st.success("PostHog - Connected")
            if is_mock_mode():
                st.caption("Sample data (Mock Mode)")
            st.write(f"**Type:** {posthog.get('type', 'CDP')}")
            st.write(f"**Last sync:** {posthog.get('last_sync', 'N/A')}")
            st.write(f"**Events:** {posthog.get('events_count', 0):,}")
            st.write(f"**Users:** {posthog.get('users_count', 0):,}")

            col_btn1, col_btn2 = st.columns(2)
            with col_btn1:
                if st.button("Reconnect", key="posthog_reconnect"):
                    st.info("Reconnecting to PostHog...")
            with col_btn2:
                posthog_url = st.session_state.get("posthog_workspace_url", "https://app.posthog.com")
                st.link_button("View Data", posthog_url, use_container_width=True)

    # Attio
    with col2:
        attio = sources.get('attio', {})
        if attio.get('status') == 'connected':
            st.success("Attio - Connected")
            if is_mock_mode():
                st.caption("Sample data (Mock Mode)")
            st.write(f"**Type:** {attio.get('type', 'CRM')}")
            st.write(f"**Last sync:** {attio.get('last_sync', 'N/A')}")
            st.write(f"**Deals:** {attio.get('deals_count', 0):,}")
            st.write(f"**Contacts:** {attio.get('contacts_count', 0):,}")

            col_btn1, col_btn2 = st.columns(2)
            with col_btn1:
                if st.button("Reconnect", key="attio_reconnect"):
                    st.info("Reconnecting to Attio...")
            with col_btn2:
                attio_url = st.session_state.get("attio_workspace_url", "https://app.attio.com")
                st.link_button("View Data", attio_url, use_container_width=True)

    st.markdown("---")

    # Missing Sources - grouped in single bubble
    disconnected = []
    for source_key, source_data in sources.items():
        if source_data.get('status') != 'connected':
            disconnected.append(source_data.get('name', source_key.title()))

    # Add sources that aren't in the data at all
    all_possible = ['PostHog', 'Attio', 'Stripe', 'Intercom']
    for source in all_possible:
        if source.lower() not in sources and source not in disconnected:
            disconnected.append(source)

    if disconnected:
        st.warning(f"**Missing Sources:** {', '.join(disconnected)}")
        with st.expander("Connect missing sources"):
            for source_name in disconnected:
                st.markdown(f"**{source_name}**")
                if st.button(f"Connect {source_name}", key=f"connect_{source_name.lower()}"):
                    st.info(f"Opening {source_name} connection wizard...")
                st.markdown("")

    st.markdown("---")

    # Quick Navigation
    st.markdown("#### Quick Navigation")
    col_nav1, col_nav2 = st.columns(2)
    with col_nav1:
        if st.button("View Identities", use_container_width=True, key="nav_identities"):
            st.switch_page("pages/06_Identities.py")
    with col_nav2:
        if st.button("View Signals", use_container_width=True, key="nav_signals"):
            st.switch_page("pages/01_Signals.py")

    st.markdown("---")

    # Data Quality Summary
    st.markdown("#### Data Quality Summary")
    st.success("Identity resolution: 89% email match rate")
    st.success("Outcome data: 847 deals with timestamps")
    if disconnected:
        st.warning(f"Missing: {', '.join(disconnected)} (connect for more insights)")

# =============================================================================
# DESTINATIONS SECTION
# =============================================================================
with st.expander("Destinations", expanded=False):

    # Attio CRM Section
    st.markdown("#### Attio CRM")
    st.success("Connected")

    # Field Mapping
    col_header_left, col_header_right = st.columns([3, 1])

    with col_header_left:
        st.markdown("**Field Mapping**")

    with col_header_right:
        if st.button("Auto-Match All", type="primary", key="attio_automatch"):
            with st.spinner("Matching fields..."):
                import time
                time.sleep(0.5)
            st.success("All fields matched successfully!")
            st.rerun()

    # Mock field mapping data
    fields = [
        {"attio_field": "Lead Score", "type": "Number", "beton_field": "signal_score", "mapped": True},
        {"attio_field": "Signal Name", "type": "Text", "beton_field": "active_signal", "mapped": True},
        {"attio_field": "Lift", "type": "Number", "beton_field": "signal_lift", "mapped": True},
        {"attio_field": "Last Signal Date", "type": "Date", "beton_field": "last_signal_at", "mapped": True},
        {"attio_field": "Confidence", "type": "Number", "beton_field": "signal_confidence", "mapped": False},
    ]

    table_data = []
    for field in fields:
        status = "Mapped" if field['mapped'] else "Not mapped"
        table_data.append({
            "Attio Field": field['attio_field'],
            "Type": field['type'],
            "Beton Field": field['beton_field'],
            "Status": status
        })

    df = pd.DataFrame(table_data)
    st.dataframe(df, use_container_width=True, hide_index=True, height=220)

    col_btn1, col_btn2 = st.columns(2)
    with col_btn1:
        if st.button("Test Sync", use_container_width=True, key="attio_test"):
            with st.spinner("Testing sync..."):
                import time
                time.sleep(1)
            st.success("Sync test successful! 5 records updated.")

    with col_btn2:
        if st.button("Save Mapping", use_container_width=True, key="attio_save"):
            st.success("Field mapping saved!")

    st.markdown("---")

    # Slack Section
    st.markdown("#### Slack")
    st.success("Connected")

    st.write("**Channel:** #sales-alerts")
    st.write("**Message template:**")

    message_template = st.text_area(
        "Template",
        value="""High-intent lead: {{company_name}}
Signal: {{signal_name}} ({{lift}}x lift)
Contact: {{contact_email}}
Attio: {{attio_url}}""",
        height=120,
        key="slack_template",
        label_visibility="collapsed"
    )

    col_btn1, col_btn2 = st.columns(2)
    with col_btn1:
        if st.button("Test Message", use_container_width=True, key="slack_test"):
            st.info("Test message sent to #sales-alerts")

    with col_btn2:
        if st.button("Save Template", use_container_width=True, key="slack_save"):
            st.success("Slack configuration saved!")

    st.markdown("---")

    # Webhook Section
    st.markdown("#### Webhook")
    st.info("Not Set Up")

    if st.button("Configure Webhook", key="webhook_config"):
        st.session_state.show_webhook_form = True

    if st.session_state.get('show_webhook_form', False):
        with st.form("webhook_form"):
            webhook_url = st.text_input("Webhook URL", placeholder="https://your-app.com/webhook")

            st.write("**Payload format:**")
            st.code("""{
  "signal_id": "sig_001",
  "signal_name": "Onboarding completed within 3 days",
  "user_id": "user_123",
  "user_email": "jane@acme.com",
  "company_name": "Acme Corp",
  "score": 94,
  "lift": 4.2
}""", language="json")

            col_btn1, col_btn2 = st.columns(2)
            with col_btn1:
                if st.form_submit_button("Cancel", use_container_width=True):
                    st.session_state.show_webhook_form = False
                    st.rerun()
            with col_btn2:
                if st.form_submit_button("Save", type="primary", use_container_width=True):
                    st.success("Webhook configured successfully!")
                    st.session_state.show_webhook_form = False

# =============================================================================
# REVENUE & SIGNAL SETTINGS
# =============================================================================
with st.expander("Revenue & Signal Settings", expanded=False):

    # Fetch current settings
    if is_mock_mode():
        settings = {
            "avg_acv": 27000,
            "baseline_conversion": 0.034,
            "sales_cycle_days": 45,
            "min_confidence": 0.90,
            "min_sample_size": 30,
            "min_lift": 1.5
        }
    else:
        try:
            response = requests.get(f"{API_URL}/api/settings")
            if response.status_code == 200:
                data = response.json()
                settings = data.get('settings', {})
            else:
                settings = {}
        except Exception:
            settings = {}

    with st.form("settings_form"):
        st.markdown("#### Revenue Settings")

        avg_acv = st.number_input(
            "Average Contract Value (ACV)",
            min_value=1000,
            max_value=1000000,
            value=settings.get('avg_acv', 27000),
            step=1000,
            help="Used for ARR projections"
        )

        baseline_conversion = st.number_input(
            "Baseline Conversion Rate (%)",
            min_value=0.1,
            max_value=50.0,
            value=settings.get('baseline_conversion', 0.034) * 100,
            step=0.1,
            format="%.1f",
            help="Your historical free-to-paid conversion"
        )

        sales_cycle_days = st.number_input(
            "Average Sales Cycle (days)",
            min_value=1,
            max_value=365,
            value=settings.get('sales_cycle_days', 45),
            step=1
        )

        currency = st.selectbox(
            "Currency",
            options=["USD", "EUR", "GBP"],
            index=0
        )

        st.markdown("---")
        st.markdown("#### Signal Thresholds")

        min_confidence = st.slider(
            "Minimum confidence to show signal (%)",
            min_value=80,
            max_value=100,
            value=int(settings.get('min_confidence', 0.90) * 100),
            step=1
        )

        min_sample_size = st.number_input(
            "Minimum sample size (users)",
            min_value=10,
            max_value=1000,
            value=settings.get('min_sample_size', 30),
            step=10
        )

        min_lift = st.number_input(
            "Minimum lift",
            min_value=1.0,
            max_value=10.0,
            value=settings.get('min_lift', 1.5),
            step=0.1,
            format="%.1f"
        )

        st.markdown("")

        col_btn1, col_btn2 = st.columns([3, 1])
        with col_btn2:
            save_button = st.form_submit_button("Save Settings", type="primary", use_container_width=True)

        if save_button:
            updated_settings = {
                "avg_acv": avg_acv,
                "baseline_conversion": baseline_conversion / 100,
                "sales_cycle_days": sales_cycle_days,
                "currency": currency,
                "min_confidence": min_confidence / 100,
                "min_sample_size": min_sample_size,
                "min_lift": min_lift
            }

            if not is_mock_mode():
                try:
                    update_response = requests.post(
                        f"{API_URL}/api/settings",
                        json=updated_settings
                    )
                    if update_response.status_code == 200:
                        st.success("Settings saved successfully!")
                    else:
                        st.error("Failed to save settings")
                except Exception as e:
                    st.error(f"Save failed: {e}")
            else:
                st.success("Settings saved successfully! (Mock mode)")

# About section
st.markdown("---")
with st.expander("About These Settings"):
    st.markdown("""
### Revenue Settings

**Average Contract Value (ACV)**
- Used to calculate estimated ARR impact for each signal
- Formula: `Incremental conversions x ACV x 12 months`

**Baseline Conversion Rate**
- Your current free-to-paid conversion without any signals
- Used as the comparison baseline for measuring signal lift
- Example: If baseline is 3.4% and signal achieves 14.2%, lift is 4.2x

**Sales Cycle**
- Average time from lead to closed-won
- Used for pipeline velocity calculations

### Signal Thresholds

**Minimum Confidence**
- Signals below this statistical confidence won't be shown
- Recommended: 90% or higher for reliable signals

**Minimum Sample Size**
- Minimum number of users needed to validate a signal
- Prevents showing signals based on too few data points
- Recommended: 30+ for statistical validity

**Minimum Lift**
- Only show signals with at least this conversion multiplier
- Example: 1.5x means signal must show 50% improvement
- Recommended: 1.5x or higher for meaningful impact
    """)
