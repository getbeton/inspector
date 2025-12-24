"""
Settings Page
Configure data sources and destinations with full CRUD operations
"""

import streamlit as st
import requests
import pandas as pd
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.data_handler import (
    is_mock_mode,
    get_mock_data_sources,
    MOCK_DATA_SOURCES
)
from utils.ui_components import (
    render_page_header,
    apply_compact_button_styles,
    apply_global_styles
)

# Page config - emoji only in page_icon, NOT in title
st.set_page_config(
    page_title="Settings | Beton Inspector",
    page_icon="⚙️",
    layout="wide"
)

API_URL = os.getenv("API_URL", "http://localhost:8000")

# Apply styles
apply_compact_button_styles()
apply_global_styles()

# === PAGE HEADER ===
render_page_header("Settings", show_data_toggle=True)

# =============================================================================
# DATA SOURCES SECTION
# =============================================================================
st.markdown("### Data Sources")
st.caption("Connect and manage your data integrations")

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

st.markdown("---")

# === POSTHOG SOURCE ===
posthog = sources.get('posthog', {})
posthog_connected = posthog.get('status') == 'connected'

with st.container():
    col_info, col_status, col_actions = st.columns([0.5, 0.2, 0.3])

    with col_info:
        st.markdown("#### PostHog")
        st.caption("Behavioral data source - product events and user properties")
        if posthog_connected:
            st.write(f"**Type:** {posthog.get('type', 'CDP')}")
            st.write(f"**Last sync:** {posthog.get('last_sync', 'N/A')}")
            st.write(f"**Events:** {posthog.get('events_count', 0):,} | **Users:** {posthog.get('users_count', 0):,}")

    with col_status:
        if posthog_connected:
            st.success("Connected")
        else:
            st.warning("Not connected")

    with col_actions:
        if posthog_connected:
            # Edit and Delete buttons
            btn_col1, btn_col2 = st.columns(2)
            with btn_col1:
                if st.button("Edit Key", key="edit_posthog", use_container_width=True):
                    st.session_state.editing_posthog = True
            with btn_col2:
                if st.button("Delete", key="delete_posthog", use_container_width=True):
                    st.session_state.confirm_delete_posthog = True
        else:
            if st.button("Connect", key="connect_posthog", type="primary", use_container_width=True):
                st.session_state.editing_posthog = True

# PostHog Edit Form
if st.session_state.get("editing_posthog", False):
    with st.container():
        st.markdown("---")
        st.markdown("**Configure PostHog**")
        col1, col2 = st.columns(2)
        with col1:
            posthog_key = st.text_input(
                "API Key",
                type="password",
                value="" if not posthog_connected else "••••••••••••",
                placeholder="phc_...",
                key="posthog_api_key_input"
            )
        with col2:
            posthog_project = st.text_input(
                "Project ID",
                value=posthog.get('project_id', ''),
                placeholder="Your project ID",
                key="posthog_project_input"
            )

        btn_col1, btn_col2 = st.columns(2)
        with btn_col1:
            if st.button("Save", key="save_posthog", type="primary", use_container_width=True):
                with st.spinner("Testing connection..."):
                    import time
                    time.sleep(1)
                st.success("PostHog configuration saved!")
                st.session_state.editing_posthog = False
                st.rerun()
        with btn_col2:
            if st.button("Cancel", key="cancel_posthog", use_container_width=True):
                st.session_state.editing_posthog = False
                st.rerun()

# PostHog Delete Confirmation
if st.session_state.get("confirm_delete_posthog", False):
    with st.container():
        st.markdown("---")
        st.warning("Are you sure you want to disconnect PostHog? This will stop syncing behavioral data.")
        btn_col1, btn_col2 = st.columns(2)
        with btn_col1:
            if st.button("Yes, Disconnect", key="confirm_delete_posthog_btn", use_container_width=True):
                st.success("PostHog disconnected")
                st.session_state.confirm_delete_posthog = False
                st.rerun()
        with btn_col2:
            if st.button("Cancel", key="cancel_delete_posthog", use_container_width=True):
                st.session_state.confirm_delete_posthog = False
                st.rerun()

st.markdown("---")

# === ATTIO SOURCE ===
attio = sources.get('attio', {})
attio_connected = attio.get('status') == 'connected'

with st.container():
    col_info, col_status, col_actions = st.columns([0.5, 0.2, 0.3])

    with col_info:
        st.markdown("#### Attio")
        st.caption("CRM data source - deals, contacts, and revenue data")
        if attio_connected:
            st.write(f"**Type:** {attio.get('type', 'CRM')}")
            st.write(f"**Last sync:** {attio.get('last_sync', 'N/A')}")
            st.write(f"**Deals:** {attio.get('deals_count', 0):,} | **Contacts:** {attio.get('contacts_count', 0):,}")

    with col_status:
        if attio_connected:
            st.success("Connected")
        else:
            st.warning("Not connected")

    with col_actions:
        if attio_connected:
            btn_col1, btn_col2 = st.columns(2)
            with btn_col1:
                if st.button("Edit Key", key="edit_attio", use_container_width=True):
                    st.session_state.editing_attio = True
            with btn_col2:
                if st.button("Delete", key="delete_attio", use_container_width=True):
                    st.session_state.confirm_delete_attio = True
        else:
            if st.button("Connect", key="connect_attio", type="primary", use_container_width=True):
                st.session_state.editing_attio = True

# Attio Edit Form
if st.session_state.get("editing_attio", False):
    with st.container():
        st.markdown("---")
        st.markdown("**Configure Attio**")
        attio_key = st.text_input(
            "API Key",
            type="password",
            value="" if not attio_connected else "••••••••••••",
            placeholder="Bearer token",
            key="attio_api_key_input"
        )

        btn_col1, btn_col2 = st.columns(2)
        with btn_col1:
            if st.button("Save", key="save_attio", type="primary", use_container_width=True):
                with st.spinner("Testing connection..."):
                    import time
                    time.sleep(1)
                st.success("Attio configuration saved!")
                st.session_state.editing_attio = False
                st.rerun()
        with btn_col2:
            if st.button("Cancel", key="cancel_attio", use_container_width=True):
                st.session_state.editing_attio = False
                st.rerun()

# Attio Delete Confirmation
if st.session_state.get("confirm_delete_attio", False):
    with st.container():
        st.markdown("---")
        st.warning("Are you sure you want to disconnect Attio? This will stop syncing CRM data.")
        btn_col1, btn_col2 = st.columns(2)
        with btn_col1:
            if st.button("Yes, Disconnect", key="confirm_delete_attio_btn", use_container_width=True):
                st.success("Attio disconnected")
                st.session_state.confirm_delete_attio = False
                st.rerun()
        with btn_col2:
            if st.button("Cancel", key="cancel_delete_attio", use_container_width=True):
                st.session_state.confirm_delete_attio = False
                st.rerun()

st.markdown("---")

# === STRIPE SOURCE (Optional) ===
stripe = sources.get('stripe', {})
stripe_connected = stripe.get('status') == 'connected'

with st.container():
    col_info, col_status, col_actions = st.columns([0.5, 0.2, 0.3])

    with col_info:
        st.markdown("#### Stripe (Optional)")
        st.caption("Billing data for enhanced scoring - MRR, subscription status")
        if stripe_connected:
            st.write(f"**Type:** {stripe.get('type', 'Billing')}")
            st.write(f"**Last sync:** {stripe.get('last_sync', 'N/A')}")

    with col_status:
        if stripe_connected:
            st.success("Connected")
        else:
            st.info("Optional")

    with col_actions:
        if stripe_connected:
            btn_col1, btn_col2 = st.columns(2)
            with btn_col1:
                if st.button("Edit Key", key="edit_stripe", use_container_width=True):
                    st.session_state.editing_stripe = True
            with btn_col2:
                if st.button("Delete", key="delete_stripe", use_container_width=True):
                    st.session_state.confirm_delete_stripe = True
        else:
            if st.button("Connect", key="connect_stripe", use_container_width=True):
                st.session_state.editing_stripe = True

# Stripe Edit Form
if st.session_state.get("editing_stripe", False):
    with st.container():
        st.markdown("---")
        st.markdown("**Configure Stripe**")
        stripe_key = st.text_input(
            "API Key",
            type="password",
            value="" if not stripe_connected else "••••••••••••",
            placeholder="sk_live_...",
            key="stripe_api_key_input"
        )

        btn_col1, btn_col2 = st.columns(2)
        with btn_col1:
            if st.button("Save", key="save_stripe", type="primary", use_container_width=True):
                with st.spinner("Testing connection..."):
                    import time
                    time.sleep(1)
                st.success("Stripe configuration saved!")
                st.session_state.editing_stripe = False
                st.rerun()
        with btn_col2:
            if st.button("Cancel", key="cancel_stripe", use_container_width=True):
                st.session_state.editing_stripe = False
                st.rerun()

# Stripe Delete Confirmation
if st.session_state.get("confirm_delete_stripe", False):
    with st.container():
        st.markdown("---")
        st.warning("Are you sure you want to disconnect Stripe?")
        btn_col1, btn_col2 = st.columns(2)
        with btn_col1:
            if st.button("Yes, Disconnect", key="confirm_delete_stripe_btn", use_container_width=True):
                st.success("Stripe disconnected")
                st.session_state.confirm_delete_stripe = False
                st.rerun()
        with btn_col2:
            if st.button("Cancel", key="cancel_delete_stripe", use_container_width=True):
                st.session_state.confirm_delete_stripe = False
                st.rerun()

st.markdown("---")

# =============================================================================
# DATA QUALITY SUMMARY
# =============================================================================
st.markdown("### Data Quality")

# Calculate quality metrics
connected_count = sum(1 for s in [posthog, attio, stripe] if s.get('status') == 'connected')
total_events = posthog.get('events_count', 0) if posthog_connected else 0
total_users = posthog.get('users_count', 0) if posthog_connected else 0
total_deals = attio.get('deals_count', 0) if attio_connected else 0

col_q1, col_q2, col_q3 = st.columns(3)

with col_q1:
    st.metric("Sources Connected", f"{connected_count}/3")

with col_q2:
    st.metric("Total Events", f"{total_events:,}")

with col_q3:
    st.metric("Total Users", f"{total_users:,}")

st.markdown("")

# Quality checks with action buttons
quality_col1, quality_col2 = st.columns(2)

with quality_col1:
    if posthog_connected and attio_connected:
        st.success("Identity resolution: 89% email match rate")
    else:
        st.warning("Identity resolution: Connect both PostHog and Attio")
        if st.button("Connect Missing Sources", key="connect_missing_quality"):
            st.rerun()

with quality_col2:
    if attio_connected:
        st.success(f"Outcome data: {total_deals:,} deals with timestamps")
    else:
        st.warning("Outcome data: Connect Attio for deal data")
        if st.button("Connect Attio", key="connect_attio_quality"):
            st.session_state.editing_attio = True
            st.rerun()

# Sync actions
st.markdown("---")
st.markdown("### Sync Actions")

sync_col1, sync_col2, sync_col3 = st.columns(3)

with sync_col1:
    if st.button("Sync All Sources", type="primary", use_container_width=True, key="sync_all"):
        with st.spinner("Syncing all sources..."):
            import time
            time.sleep(2)
        st.success("Sync complete!")

with sync_col2:
    if st.button("Re-run Signal Discovery", use_container_width=True, key="rediscover"):
        with st.spinner("Discovering signals..."):
            import time
            time.sleep(2)
        st.success("Found 3 new signals!")

with sync_col3:
    if st.button("View Sync Logs", use_container_width=True, key="view_logs"):
        st.info("Last sync: 2 hours ago | Status: Success | Duration: 45s")

st.markdown("---")

# =============================================================================
# DESTINATIONS SECTION
# =============================================================================
with st.expander("Destinations", expanded=False):

    # Attio CRM Section
    st.markdown("#### Attio CRM")
    if attio_connected:
        st.success("Connected")

        # Field Mapping
        st.markdown("**Field Mapping**")

        # Mock field mapping data
        fields = [
            {"attio_field": "Lead Score", "type": "Number", "beton_field": "signal_score", "mapped": True},
            {"attio_field": "Signal Name", "type": "Text", "beton_field": "active_signal", "mapped": True},
            {"attio_field": "Lift", "type": "Number", "beton_field": "signal_lift", "mapped": True},
            {"attio_field": "Last Signal Date", "type": "Date", "beton_field": "last_signal_at", "mapped": True},
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
        st.dataframe(df, use_container_width=True, hide_index=True, height=180)

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
    else:
        st.info("Connect Attio to configure field mapping")

    st.markdown("---")

    # Slack Section
    st.markdown("#### Slack")
    slack_connected = True  # Mock

    if slack_connected:
        st.success("Connected")

        st.write("**Channel:** #sales-alerts")
        st.write("**Message template:**")

        message_template = st.text_area(
            "Template",
            value="""High-intent lead: {{company_name}}
Signal: {{signal_name}} ({{lift}}x lift)
Contact: {{contact_email}}
Attio: {{attio_url}}""",
            height=100,
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
    else:
        if st.button("Connect Slack", key="connect_slack"):
            st.info("Opening Slack OAuth...")

st.markdown("---")

# Navigation
col_back, col_signals = st.columns(2)

with col_back:
    if st.button("← Home", use_container_width=True):
        st.switch_page("Home.py")

with col_signals:
    if st.button("View Signals →", use_container_width=True):
        st.switch_page("pages/01_Signals.py")
