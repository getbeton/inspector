"""
Signal Explorer Page - Advanced Signal Management
List, filter, create, and manage discovered signals with backtesting and CRM export
"""

import streamlit as st
import requests
import pandas as pd
import os
import sys
import time
from datetime import datetime

# Add utils to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.data_handler import (
    is_mock_mode,
    render_data_mode_toggle,
    show_mock_data_banner,
    show_empty_state_with_cta,
    get_mock_signals,
    get_api_data
)

# Page config
st.set_page_config(
    page_title="Signals | Beton Inspector",
    page_icon="🎯",
    layout="wide"
)

API_URL = os.getenv("API_URL", "http://localhost:8000")

# === PAGE HEADER ===
col_title, col_toggle = st.columns([0.85, 0.15])
with col_title:
    st.title("🎯 Signal Explorer")
with col_toggle:
    render_data_mode_toggle(location="top")

# Show mock data banner if active
if is_mock_mode():
    show_mock_data_banner()

st.markdown("---")

# === FILTERS & ACTIONS SECTION ===
st.subheader("Filter & Manage Signals")

filter_col1, filter_col2, filter_col3, filter_col4 = st.columns(4)

with filter_col1:
    status_filter = st.selectbox(
        "Status",
        ["All", "Active", "Draft", "Paused"],
        key="status_filter"
    )

with filter_col2:
    lift_filter = st.selectbox(
        "Lift",
        ["All", ">4x", ">3x", ">2x", ">1.5x"],
        key="lift_filter"
    )

with filter_col3:
    source_filter = st.selectbox(
        "Source",
        ["All", "Beton-Discovered", "User-Defined", "PostHog", "Attio"],
        key="source_filter"
    )

with filter_col4:
    confidence_filter = st.selectbox(
        "Confidence",
        ["All", ">99%", ">95%", ">90%", ">80%"],
        key="confidence_filter"
    )

# Search and action buttons
col_search, col_export, col_new, col_recalc = st.columns([2, 1, 1, 1])

with col_search:
    search_query = st.text_input("Search signals by name", placeholder="e.g., Onboarding...", key="signal_search")

with col_export:
    if st.button("📤 Export to Attio", use_container_width=True):
        st.info("Select signals below to export to your CRM")

with col_new:
    if st.button("+ New Signal", use_container_width=True):
        st.session_state.show_create_signal = True

with col_recalc:
    if st.button("🔄 Recalculate", use_container_width=True):
        st.session_state.show_recalc_modal = True

st.markdown("---")

# === RECALCULATION MODAL ===
if st.session_state.get("show_recalc_modal", False):
    with st.container():
        st.markdown("### Recalculate Signals")
        st.markdown("""
        This will reprocess all signals against your historical data.
        This may take a few minutes.
        """)

        col1, col2 = st.columns(2)
        with col1:
            if st.button("🔄 Confirm Recalculation"):
                with st.spinner("Recalculating signals..."):
                    time.sleep(2)  # Simulate processing
                    st.success("✅ Signal recalculation complete!")
                    st.session_state.show_recalc_modal = False
                    st.rerun()

        with col2:
            if st.button("Cancel"):
                st.session_state.show_recalc_modal = False
                st.rerun()

# === CREATE NEW SIGNAL MODAL ===
if st.session_state.get("show_create_signal", False):
    with st.container():
        st.markdown("### Create New Custom Signal")

        signal_name = st.text_input("Signal Name", placeholder="e.g., High-intent enterprise accounts")
        signal_description = st.text_area("Description", placeholder="Describe the signal...")

        # Tabs for Visual Builder vs SQL
        tab1, tab2 = st.tabs(["Visual Builder", "SQL Query"])

        with tab1:
            st.markdown("#### Define Conditions")
            st.markdown("Create filter-like conditions to define your signal")

            # Condition builder
            condition_idx = 0
            conditions = []

            # First condition
            col_event, col_operator, col_value = st.columns([0.35, 0.35, 0.3])
            with col_event:
                event = st.selectbox("Event/Property", ["onboarding_completed", "api_key_created", "pricing_page_visited"])
            with col_operator:
                operator = st.selectbox("Operator", ["=", ">", ">=", "<", "<=", "within days"])
            with col_value:
                value = st.text_input("Value", "3")

            if st.button("+ Add Condition"):
                st.info("Additional conditions would be added here")

        with tab2:
            st.markdown("#### SQL Query")
            sql_query = st.text_area(
                "Define your signal with SQL",
                value="SELECT DISTINCT user_id FROM events WHERE event = 'onboarding_completed'",
                height=150
            )

            st.markdown("Available tables: events, users, companies, deals")

        # Buttons
        col_test, col_save, col_cancel = st.columns(3)

        with col_test:
            if st.button("🧪 Test Signal"):
                if signal_name:
                    with st.spinner("Testing signal..."):
                        time.sleep(1)
                        st.success(f"""
                        ✅ **Signal Test Results**

                        Matches: 127 users
                        Historical Lift: 3.4x
                        Confidence: 92%
                        """)
                else:
                    st.error("Please enter a signal name")

        with col_save:
            if st.button("💾 Save as Draft"):
                if signal_name:
                    st.success(f"✅ Signal '{signal_name}' saved as Draft")
                    st.session_state.show_create_signal = False
                    st.rerun()
                else:
                    st.error("Please enter a signal name")

        with col_cancel:
            if st.button("Cancel", key="cancel_create"):
                st.session_state.show_create_signal = False
                st.rerun()

        st.markdown("---")

# === SIGNALS TABLE ===
st.subheader("Signals")

# Fetch signals data
def fetch_signals():
    if is_mock_mode():
        return get_mock_signals()
    else:
        response = get_api_data("/api/signals/list")
        if response:
            return response.get('signals', [])
        return []

signals = fetch_signals()

# Apply filters
filtered_signals = signals

# Status filter
if status_filter != "All":
    filter_status = status_filter.lower()
    filtered_signals = [s for s in filtered_signals if s.get('status', '').lower() == filter_status]

# Lift filter
if lift_filter != "All":
    min_lift = float(lift_filter.replace(">", "").replace("x", ""))
    filtered_signals = [s for s in filtered_signals if s.get('lift', 0) >= min_lift]

# Confidence filter
if confidence_filter != "All":
    min_conf = float(confidence_filter.replace(">", "").replace("%", "")) / 100
    filtered_signals = [s for s in filtered_signals if s.get('confidence', 0) >= min_conf]

# Source filter
if source_filter != "All":
    filtered_signals = [s for s in filtered_signals if source_filter in [s.get('source', ''), s.get('source_type', '')]]

# Search filter
if search_query:
    filtered_signals = [
        s for s in filtered_signals
        if search_query.lower() in s.get('name', '').lower() or
           search_query.lower() in s.get('description', '').lower()
    ]

# Display signals
if not signals:
    # Empty state
    show_empty_state_with_cta(
        title="🎯 No signals yet",
        message="Start exploring signals by either:\n1. Create your first custom signal\n2. Switch to mock data mode\n3. Check integrations to load real signals",
        cta_text="← Setup Data Sources",
        go_to_setup=True
    )

elif filtered_signals:
    # Prepare table data
    table_data = []
    for idx, signal in enumerate(filtered_signals):
        status_badge = {
            "active": "🟢 Active",
            "draft": "🟡 Draft",
            "paused": "⏸️ Paused"
        }.get(signal.get('status', 'active'), "⚪ Unknown")

        table_data.append({
            "Select": False,
            "Name": signal.get('name', 'Unknown'),
            "Status": status_badge,
            "Lift": f"{signal.get('lift', 0):.1f}x",
            "Conf": f"{signal.get('confidence', 0) * 100:.0f}%",
            "Leads/mo": signal.get('leads_per_month', 0),
            "30d Trend": signal.get('trend_30d', '0%'),
            "Source": signal.get('source', 'Unknown'),
            "ID": signal.get('id', f'sig_{idx}')
        })

    df = pd.DataFrame(table_data)

    # Display table with selection
    st.markdown("##### Available Signals")
    edited_df = st.data_editor(
        df,
        use_container_width=True,
        hide_index=True,
        disabled=["Name", "Status", "Lift", "Conf", "Leads/mo", "30d Trend", "Source", "ID"],
        height=400
    )

    # Summary row
    active_count = sum(1 for s in filtered_signals if s.get('status') == 'active')
    draft_count = sum(1 for s in filtered_signals if s.get('status') == 'draft')
    paused_count = sum(1 for s in filtered_signals if s.get('status') == 'paused')

    col_summary1, col_summary2 = st.columns([0.7, 0.3])
    with col_summary1:
        st.caption(f"Summary: {len(filtered_signals)} signals | {active_count} active | {draft_count} draft | {paused_count} paused")

    with col_summary2:
        selected_count = edited_df['Select'].sum() if 'Select' in edited_df.columns else 0
        if selected_count > 0:
            st.caption(f"{selected_count} selected")

else:
    # No results for filters
    st.info("📭 No signals match your filters. Try adjusting them or creating a new signal.")

st.markdown("---")

# === NAVIGATION BUTTONS ===
col_back, col_next = st.columns([0.5, 0.5])

with col_back:
    if st.button("← Back: Setup", use_container_width=True):
        st.switch_page("Home.py")

with col_next:
    if st.button("Next: Backtest →", use_container_width=True):
        st.switch_page("pages/05_Backtest.py")

# Progress indicator
st.markdown("---")
st.markdown("""
<div style='font-size: 12px; color: #666;'>

**Step 2 of 5: Signal Explorer** ✓

- Setup ✓
- **Signal Explorer** (Current)
- Backtesting
- Playbooks
- Destinations

</div>
""", unsafe_allow_html=True)
