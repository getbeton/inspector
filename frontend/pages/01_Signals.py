"""
Signal Explorer Page - Advanced Signal Management
List, filter, create, and manage discovered signals with comparison metrics
"""

import streamlit as st
import pandas as pd
import os
import sys
import time

# Add utils to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.data_handler import (
    is_mock_mode,
    get_mock_signals,
    get_api_data
)
from utils.ui_components import (
    render_page_header,
    apply_compact_button_styles,
    apply_global_styles
)
from components.states import render_empty_state

# Page config - emoji only in page_icon, NOT in title
st.set_page_config(
    page_title="Signals | Beton Inspector",
    page_icon="🎯",
    layout="wide"
)

API_URL = os.getenv("API_URL", "http://localhost:8000")

# Company settings for calculations
BASELINE_CONVERSION = 0.034
ACV = 27000

# Apply styles
apply_compact_button_styles()
apply_global_styles()

# Custom CSS for clickable signal names
st.markdown("""
<style>
    /* Clickable signal name styling */
    .signal-link {
        color: #0173B2;
        text-decoration: none;
        cursor: pointer;
        font-weight: 500;
    }
    .signal-link:hover {
        color: #015a8c;
        text-decoration: underline;
    }
    .signal-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .copy-icon {
        color: #999;
        cursor: pointer;
        font-size: 0.8rem;
    }
    .copy-icon:hover {
        color: #666;
    }
    /* Comparison metrics styling */
    .comparison-positive {
        color: #029E73;
        font-weight: 500;
    }
    .comparison-neutral {
        color: #666;
    }
</style>
""", unsafe_allow_html=True)

# === PAGE HEADER ===
render_page_header("Signal Explorer", show_data_toggle=True)

st.markdown("---")

# === FILTERS SECTION ===
filter_col1, filter_col2, filter_col3, filter_col4 = st.columns(4)

with filter_col1:
    status_filter = st.selectbox(
        "Status",
        ["All", "Active", "Draft", "Paused"],
        key="status_filter"
    )

with filter_col2:
    lift_filter = st.selectbox(
        "Min Lift",
        ["All", ">4x", ">3x", ">2x", ">1.5x"],
        key="lift_filter"
    )

with filter_col3:
    source_filter = st.selectbox(
        "Source",
        ["All", "Beton", "User-defined"],
        key="source_filter"
    )

with filter_col4:
    confidence_filter = st.selectbox(
        "Confidence",
        ["All", ">99%", ">95%", ">90%", ">80%"],
        key="confidence_filter"
    )

# Search and action buttons
col_search, col_export, col_new = st.columns([2, 1, 1])

with col_search:
    search_query = st.text_input(
        "Search signals by name",
        placeholder="e.g., Onboarding...",
        key="signal_search",
        label_visibility="collapsed"
    )

with col_export:
    if st.button("Export", use_container_width=True):
        st.info("Select signals below to export to your CRM", icon="ℹ️")

with col_new:
    if st.button("+ Add Signal", use_container_width=True):
        st.switch_page("pages/04_Add_Signal.py")

st.markdown("---")

# === SIGNALS TABLE ===

# Fetch signals data
def fetch_signals():
    if is_mock_mode():
        return get_mock_signals()
    else:
        response = get_api_data("/api/signals/list")
        if response:
            return response.get('signals', [])
        return []

with st.spinner("Loading signals..."):
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
    source_map = {"Beton": "Beton-Discovered", "User-defined": "User-Defined"}
    target_source = source_map.get(source_filter, source_filter)
    filtered_signals = [s for s in filtered_signals if s.get('source', '') == target_source or s.get('source', '') == source_filter]

# Search filter
if search_query:
    filtered_signals = [
        s for s in filtered_signals
        if search_query.lower() in s.get('name', '').lower() or
           search_query.lower() in s.get('description', '').lower()
    ]

# Display signals
if not signals:
    render_empty_state(
        "no_signals",
        custom_message="Start by creating your first custom signal, switching to demo data, or checking your integrations."
    )

elif filtered_signals:
    # Table header
    header_cols = st.columns([0.05, 0.35, 0.1, 0.15, 0.15, 0.1, 0.1])
    with header_cols[0]:
        st.markdown("**☐**")
    with header_cols[1]:
        st.markdown("**Signal Name**")
    with header_cols[2]:
        st.markdown("**Status**")
    with header_cols[3]:
        st.markdown("**With Signal**")
    with header_cols[4]:
        st.markdown("**Without Signal**")
    with header_cols[5]:
        st.markdown("**Lift**")
    with header_cols[6]:
        st.markdown("**Source**")

    st.markdown("---")

    # Track selected signals
    if "selected_signals" not in st.session_state:
        st.session_state.selected_signals = set()

    # Render each signal row
    for idx, signal in enumerate(filtered_signals):
        signal_id = signal.get('id', f'sig_{idx}')
        signal_name = signal.get('name', 'Unknown')
        status = signal.get('status', 'active').capitalize()
        lift = signal.get('lift', 1.0)
        confidence = signal.get('confidence', 0)
        source = signal.get('source', 'Beton')

        # Display source correctly
        if source == "Beton-Discovered":
            source_display = "Beton"
        elif source == "User-Defined":
            source_display = "User"
        else:
            source_display = source[:6]

        # Calculate comparison metrics
        leads = signal.get('leads_per_month', 50)
        conversion_with = signal.get('conversion_with', BASELINE_CONVERSION * lift)
        conversion_without = signal.get('conversion_without', BASELINE_CONVERSION)

        # Users with/without signal
        users_with = signal.get('sample_with', int(leads * 30))  # ~30 days of data
        users_without = signal.get('sample_without', int(leads * 30 * 5))  # 5x more without

        # Revenue comparison
        revenue_with = int(users_with * conversion_with * ACV)
        revenue_without = int(users_without * conversion_without * ACV)

        # Per-user revenue
        per_user_with = conversion_with * ACV
        per_user_without = conversion_without * ACV

        row_cols = st.columns([0.05, 0.35, 0.1, 0.15, 0.15, 0.1, 0.1])

        with row_cols[0]:
            is_selected = st.checkbox(
                "Select",
                value=signal_id in st.session_state.selected_signals,
                key=f"select_{signal_id}",
                label_visibility="collapsed"
            )
            if is_selected:
                st.session_state.selected_signals.add(signal_id)
            else:
                st.session_state.selected_signals.discard(signal_id)

        with row_cols[1]:
            # Clickable signal name
            if st.button(
                f"🔗 {signal_name}",
                key=f"link_{signal_id}",
                help="Click to view signal details",
                use_container_width=True
            ):
                st.session_state.selected_signal_id = signal_id
                st.switch_page("pages/02_Signal_Detail.py")

        with row_cols[2]:
            status_color = {
                "Active": "🟢",
                "Draft": "🟡",
                "Paused": "⚪"
            }.get(status, "⚪")
            st.caption(f"{status_color} {status}")

        with row_cols[3]:
            # With signal metrics
            st.markdown(f"**{conversion_with*100:.1f}%** conv")
            st.caption(f"{users_with:,} users • ${per_user_with:,.0f}/user")

        with row_cols[4]:
            # Without signal metrics
            st.markdown(f"{conversion_without*100:.1f}% conv")
            st.caption(f"{users_without:,} users • ${per_user_without:,.0f}/user")

        with row_cols[5]:
            st.markdown(f"**{lift}x**")
            st.caption(f"{confidence*100:.0f}% conf")

        with row_cols[6]:
            st.caption(source_display)

        # Subtle divider between rows
        st.markdown("<hr style='margin: 0.5rem 0; border: none; border-top: 1px solid #eee;'>", unsafe_allow_html=True)

    # === BULK ACTIONS ===
    selected_count = len(st.session_state.selected_signals)

    if selected_count > 0:
        st.markdown("")
        st.markdown(f"**{selected_count} signal(s) selected**")
        bulk_col1, bulk_col2, bulk_col3, bulk_col4 = st.columns(4)

        with bulk_col1:
            if st.button(f"Enable ({selected_count})", use_container_width=True, key="bulk_enable"):
                for sig_id in st.session_state.selected_signals:
                    st.toast(f"Enabled signal")
                st.session_state.selected_signals = set()
                st.rerun()

        with bulk_col2:
            if st.button(f"Disable ({selected_count})", use_container_width=True, key="bulk_disable"):
                for sig_id in st.session_state.selected_signals:
                    st.toast(f"Disabled signal")
                st.session_state.selected_signals = set()
                st.rerun()

        with bulk_col3:
            if st.button(f"Export ({selected_count})", use_container_width=True, key="bulk_export"):
                st.success(f"Exporting {selected_count} signals to CRM...")

        with bulk_col4:
            if st.button(f"Delete ({selected_count})", use_container_width=True, key="bulk_delete"):
                st.warning(f"Are you sure you want to delete {selected_count} signals?")

    # Summary row
    active_count = sum(1 for s in filtered_signals if s.get('status') == 'active')
    draft_count = sum(1 for s in filtered_signals if s.get('status') == 'draft')
    paused_count = sum(1 for s in filtered_signals if s.get('status') == 'paused')

    st.markdown("---")
    st.caption(f"Showing {len(filtered_signals)} signals | {active_count} active | {draft_count} draft | {paused_count} paused")

else:
    # No results for filters
    render_empty_state(
        "no_results",
        on_cta_click=lambda: st.session_state.update({
            "status_filter": "All",
            "lift_filter": "All",
            "confidence_filter": "All",
            "source_filter": "All",
            "signal_search": ""
        })
    )

st.markdown("---")

# === NAVIGATION BUTTONS ===
col_back, col_next = st.columns([0.5, 0.5])

with col_back:
    if st.button("← Setup", use_container_width=True):
        st.switch_page("Home.py")

with col_next:
    if st.button("Add Signal Manually →", use_container_width=True):
        st.switch_page("pages/04_Add_Signal.py")
