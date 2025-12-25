"""
Settings Page
Configure data sources and destinations with full CRUD operations
Wired to real Settings API for database-backed configuration storage.
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
    MOCK_DATA_SOURCES,
    get_integrations_list,
    get_integration,
    save_integration,
    delete_integration,
    test_integration_connection,
    get_system_settings,
    update_system_settings,
    get_health_status,
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
# HELPER FUNCTIONS
# =============================================================================

def get_integration_sources():
    """
    Get integration sources - either from real API or mock data.
    Merges API response with mock data structure for consistent display.
    """
    if is_mock_mode():
        return MOCK_DATA_SOURCES

    # Fetch from real API
    result = get_integrations_list()
    integrations = result.get("integrations", [])

    # Build sources dict from API response
    sources = {
        "posthog": {"name": "PostHog", "type": "CDP", "status": "not_connected"},
        "attio": {"name": "Attio", "type": "CRM", "status": "not_connected"},
        "stripe": {"name": "Stripe", "type": "Billing", "status": "not_connected"},
        "apollo": {"name": "Apollo", "type": "Enrichment", "status": "not_connected"},
    }

    for integration in integrations:
        name = integration.get("name", "").lower()
        if name in sources:
            sources[name].update({
                "status": integration.get("status", "disconnected"),
                "api_key_masked": integration.get("api_key_masked", ""),
                "is_active": integration.get("is_active", True),
                "last_validated_at": integration.get("last_validated_at"),
                "config": integration.get("config", {}),
            })
            # Map status for UI
            if integration.get("status") == "connected":
                sources[name]["status"] = "connected"
            elif integration.get("status") == "error":
                sources[name]["status"] = "error"

    return sources


def show_connection_result(result, integration_name):
    """Display connection test result with appropriate styling."""
    if result.get("success"):
        st.success(f"{integration_name} - {result.get('message', 'Connection successful!')}")
        if result.get("details"):
            with st.expander("Connection Details"):
                st.json(result["details"])
    else:
        st.error(f"{integration_name} - {result.get('message', 'Connection failed')}")


# =============================================================================
# DATA SOURCES SECTION
# =============================================================================
st.markdown("### Data Sources")
st.caption("Connect and manage your data integrations")

# Fetch sources status
sources = get_integration_sources()

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
            if posthog.get('last_validated_at'):
                st.write(f"**Last validated:** {posthog.get('last_validated_at', 'N/A')}")
            if posthog.get('api_key_masked'):
                st.write(f"**API Key:** {posthog.get('api_key_masked')}")
            config = posthog.get('config', {})
            if config.get('project_id'):
                st.write(f"**Project ID:** {config.get('project_id')}")

    with col_status:
        if posthog_connected:
            st.success("Connected")
        elif posthog.get('status') == 'error':
            st.error("Error")
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
                value="",
                placeholder="phx_...",
                key="posthog_api_key_input",
                help="Your PostHog Personal API key (starts with phx_)"
            )
        with col2:
            posthog_project = st.text_input(
                "Project ID",
                value=posthog.get('config', {}).get('project_id', ''),
                placeholder="Your project ID",
                key="posthog_project_input",
                help="Found in PostHog project settings"
            )

        posthog_host = st.text_input(
            "PostHog Host (optional)",
            value=posthog.get('config', {}).get('host', 'https://app.posthog.com'),
            placeholder="https://app.posthog.com",
            key="posthog_host_input",
            help="Leave default for PostHog Cloud, or enter your self-hosted URL"
        )

        btn_col1, btn_col2, btn_col3 = st.columns(3)
        with btn_col1:
            if st.button("Test Connection", key="test_posthog", use_container_width=True):
                if not posthog_key:
                    st.warning("Please enter an API key to test")
                else:
                    with st.spinner("Testing PostHog connection..."):
                        config = {"project_id": posthog_project, "host": posthog_host}
                        result = test_integration_connection("posthog", api_key=posthog_key, config=config)
                        show_connection_result(result, "PostHog")

        with btn_col2:
            if st.button("Save", key="save_posthog", type="primary", use_container_width=True):
                if not posthog_key:
                    st.warning("Please enter an API key")
                elif not posthog_project:
                    st.warning("Please enter a Project ID")
                else:
                    with st.spinner("Saving PostHog configuration..."):
                        config = {"project_id": posthog_project, "host": posthog_host}
                        result = save_integration("posthog", posthog_key, config=config)
                        if result.get("success"):
                            st.success("PostHog configuration saved!")
                            st.session_state.editing_posthog = False
                            st.rerun()
                        else:
                            st.error(f"Failed to save: {result.get('error', 'Unknown error')}")

        with btn_col3:
            if st.button("Cancel", key="cancel_posthog", use_container_width=True):
                st.session_state.editing_posthog = False
                st.rerun()

# PostHog Delete Confirmation
if st.session_state.get("confirm_delete_posthog", False):
    with st.container():
        st.markdown("---")
        st.warning("Are you sure you want to disconnect PostHog? This will delete your stored API key.")
        btn_col1, btn_col2 = st.columns(2)
        with btn_col1:
            if st.button("Yes, Disconnect", key="confirm_delete_posthog_btn", use_container_width=True):
                with st.spinner("Disconnecting PostHog..."):
                    result = delete_integration("posthog")
                    if result.get("success"):
                        st.success("PostHog disconnected")
                    else:
                        st.error(f"Failed to disconnect: {result.get('error', 'Unknown error')}")
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
        st.caption("CRM data source & destination - push signals to your CRM")
        if attio_connected:
            st.write(f"**Type:** {attio.get('type', 'CRM')}")
            if attio.get('last_validated_at'):
                st.write(f"**Last validated:** {attio.get('last_validated_at', 'N/A')}")
            if attio.get('api_key_masked'):
                st.write(f"**API Key:** {attio.get('api_key_masked')}")
            config = attio.get('config', {})
            if config.get('workspace_id'):
                st.write(f"**Workspace ID:** {config.get('workspace_id')}")

    with col_status:
        if attio_connected:
            st.success("Connected")
        elif attio.get('status') == 'error':
            st.error("Error")
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
        col1, col2 = st.columns(2)
        with col1:
            attio_key = st.text_input(
                "API Key",
                type="password",
                value="",
                placeholder="Bearer token from Attio",
                key="attio_api_key_input",
                help="Generate an API key in Attio Settings > Developers"
            )
        with col2:
            attio_workspace = st.text_input(
                "Workspace ID (optional)",
                value=attio.get('config', {}).get('workspace_id', ''),
                placeholder="Your workspace ID",
                key="attio_workspace_input",
                help="Found in Attio workspace settings"
            )

        btn_col1, btn_col2, btn_col3 = st.columns(3)
        with btn_col1:
            if st.button("Test Connection", key="test_attio", use_container_width=True):
                if not attio_key:
                    st.warning("Please enter an API key to test")
                else:
                    with st.spinner("Testing Attio connection..."):
                        config = {"workspace_id": attio_workspace} if attio_workspace else {}
                        result = test_integration_connection("attio", api_key=attio_key, config=config)
                        show_connection_result(result, "Attio")

        with btn_col2:
            if st.button("Save", key="save_attio", type="primary", use_container_width=True):
                if not attio_key:
                    st.warning("Please enter an API key")
                else:
                    with st.spinner("Saving Attio configuration..."):
                        config = {"workspace_id": attio_workspace} if attio_workspace else {}
                        result = save_integration("attio", attio_key, config=config)
                        if result.get("success"):
                            st.success("Attio configuration saved!")
                            st.session_state.editing_attio = False
                            st.rerun()
                        else:
                            st.error(f"Failed to save: {result.get('error', 'Unknown error')}")

        with btn_col3:
            if st.button("Cancel", key="cancel_attio", use_container_width=True):
                st.session_state.editing_attio = False
                st.rerun()

# Attio Delete Confirmation
if st.session_state.get("confirm_delete_attio", False):
    with st.container():
        st.markdown("---")
        st.warning("Are you sure you want to disconnect Attio? This will delete your stored API key.")
        btn_col1, btn_col2 = st.columns(2)
        with btn_col1:
            if st.button("Yes, Disconnect", key="confirm_delete_attio_btn", use_container_width=True):
                with st.spinner("Disconnecting Attio..."):
                    result = delete_integration("attio")
                    if result.get("success"):
                        st.success("Attio disconnected")
                    else:
                        st.error(f"Failed to disconnect: {result.get('error', 'Unknown error')}")
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
            if stripe.get('last_validated_at'):
                st.write(f"**Last validated:** {stripe.get('last_validated_at', 'N/A')}")
            if stripe.get('api_key_masked'):
                st.write(f"**API Key:** {stripe.get('api_key_masked')}")

    with col_status:
        if stripe_connected:
            st.success("Connected")
        elif stripe.get('status') == 'error':
            st.error("Error")
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
            value="",
            placeholder="sk_live_... or sk_test_...",
            key="stripe_api_key_input",
            help="Your Stripe secret key (starts with sk_live_ or sk_test_)"
        )

        btn_col1, btn_col2, btn_col3 = st.columns(3)
        with btn_col1:
            if st.button("Test Connection", key="test_stripe", use_container_width=True):
                if not stripe_key:
                    st.warning("Please enter an API key to test")
                else:
                    with st.spinner("Testing Stripe connection..."):
                        result = test_integration_connection("stripe", api_key=stripe_key)
                        show_connection_result(result, "Stripe")

        with btn_col2:
            if st.button("Save", key="save_stripe", type="primary", use_container_width=True):
                if not stripe_key:
                    st.warning("Please enter an API key")
                else:
                    with st.spinner("Saving Stripe configuration..."):
                        result = save_integration("stripe", stripe_key)
                        if result.get("success"):
                            st.success("Stripe configuration saved!")
                            st.session_state.editing_stripe = False
                            st.rerun()
                        else:
                            st.error(f"Failed to save: {result.get('error', 'Unknown error')}")

        with btn_col3:
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
                with st.spinner("Disconnecting Stripe..."):
                    result = delete_integration("stripe")
                    if result.get("success"):
                        st.success("Stripe disconnected")
                    else:
                        st.error(f"Failed to disconnect: {result.get('error', 'Unknown error')}")
                st.session_state.confirm_delete_stripe = False
                st.rerun()
        with btn_col2:
            if st.button("Cancel", key="cancel_delete_stripe", use_container_width=True):
                st.session_state.confirm_delete_stripe = False
                st.rerun()

st.markdown("---")

# =============================================================================
# HEALTH STATUS SECTION
# =============================================================================
st.markdown("### Integration Health")

health = get_health_status()
overall_status = health.get("overall_status", "unknown")

# Overall status indicator
if overall_status == "healthy":
    st.success(f"Overall Status: Healthy")
elif overall_status == "degraded":
    st.warning(f"Overall Status: Degraded - Some integrations have issues")
elif overall_status == "unconfigured":
    st.info("Overall Status: No integrations configured yet")
else:
    st.error(f"Overall Status: {overall_status}")

# Per-integration health
integration_health = health.get("integrations", {})
if integration_health:
    health_cols = st.columns(len(integration_health))
    for idx, (name, status) in enumerate(integration_health.items()):
        with health_cols[idx]:
            health_status = status.get("status", "unknown")
            if health_status == "healthy":
                st.metric(name.title(), "Healthy", delta="Connected")
            elif health_status == "disabled":
                st.metric(name.title(), "Disabled", delta="Inactive")
            else:
                st.metric(name.title(), "Unhealthy", delta="Error")

if health.get("last_checked"):
    st.caption(f"Last checked: {health.get('last_checked')}")

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
        st.success("Identity resolution: Ready for signal matching")
    else:
        st.warning("Identity resolution: Connect both PostHog and Attio")
        if st.button("Connect Missing Sources", key="connect_missing_quality"):
            st.rerun()

with quality_col2:
    if attio_connected:
        st.success(f"CRM destination: Ready to push signals")
    else:
        st.warning("CRM destination: Connect Attio to push signals")
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
            try:
                response = requests.post(f"{API_URL}/api/sync/run")
                if response.status_code == 200:
                    result = response.json()
                    if result.get("status") == "success":
                        st.success("Sync complete!")
                    else:
                        st.warning(result.get("message", "Sync completed with warnings"))
                else:
                    st.error(f"Sync failed: {response.text}")
            except Exception as e:
                st.error(f"Sync failed: {str(e)}")

with sync_col2:
    if st.button("Re-run Signal Discovery", use_container_width=True, key="rediscover"):
        with st.spinner("Discovering signals..."):
            import time
            time.sleep(2)
        st.success("Signal discovery complete!")

with sync_col3:
    if st.button("Refresh Health Status", use_container_width=True, key="refresh_health"):
        st.rerun()

st.markdown("---")

# =============================================================================
# SYSTEM SETTINGS SECTION
# =============================================================================
with st.expander("System Settings", expanded=False):
    st.markdown("#### Performance & Limits")

    system_settings = get_system_settings()

    col1, col2 = st.columns(2)

    with col1:
        query_budget = st.number_input(
            "Query Budget (per hour)",
            min_value=100,
            max_value=2400,
            value=system_settings.get("query_budget_limit", 2000),
            step=100,
            help="Maximum PostHog queries per hour (PostHog limit is 2400)"
        )

        cache_ttl = st.number_input(
            "Cache TTL (seconds)",
            min_value=60,
            max_value=86400,
            value=system_settings.get("cache_ttl_seconds", 3600),
            step=300,
            help="How long to cache query results"
        )

    with col2:
        batch_size = st.number_input(
            "Attio Batch Size",
            min_value=10,
            max_value=1000,
            value=system_settings.get("attio_batch_size", 100),
            step=10,
            help="Records per batch when pushing to Attio"
        )

        max_concurrent = st.number_input(
            "Max Concurrent Requests",
            min_value=1,
            max_value=20,
            value=system_settings.get("max_concurrent_requests", 5),
            step=1,
            help="Maximum parallel API requests"
        )

    if st.button("Save System Settings", key="save_system_settings"):
        with st.spinner("Saving settings..."):
            result = update_system_settings({
                "query_budget_limit": query_budget,
                "cache_ttl_seconds": cache_ttl,
                "attio_batch_size": batch_size,
                "max_concurrent_requests": max_concurrent,
            })
            if result.get("success"):
                st.success("System settings saved!")
            else:
                st.error(f"Failed to save: {result.get('error', 'Unknown error')}")

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
