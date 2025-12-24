"""
Enhanced Backtest Page
- Builder: Create and test custom signals
- Viewer: View historical signal performance across multiple signals
"""

import streamlit as st
import requests
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import os
import sys
import time
from datetime import datetime, timedelta
import hashlib

# Add utils to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.data_handler import (
    is_mock_mode,
    render_data_mode_toggle,
    show_mock_data_banner,
    get_mock_signals
)

# Page config
st.set_page_config(
    page_title="Backtest | Beton Inspector",
    page_icon="🧪",
    layout="wide"
)

API_URL = os.getenv("API_URL", "http://localhost:8000")

# === PAGE HEADER ===
col_title, col_toggle = st.columns([0.85, 0.15])
with col_title:
    st.title("🧪 Signal Performance & Backtesting")
with col_toggle:
    render_data_mode_toggle(location="top")

if is_mock_mode():
    show_mock_data_banner()

st.markdown("---")

# Initialize session state
if 'signal_cache' not in st.session_state:
    st.session_state.signal_cache = {}

# === TABS: BUILDER vs VIEWER ===
tab_builder, tab_viewer = st.tabs(["Builder", "Viewer"])

# ===== TAB 1: BUILDER (Test Custom Signals) =====
with tab_builder:
    st.subheader("Define & Test Your Custom Signal")

    # Signal definition method
    builder_method = st.radio("Method", ["Visual Builder", "SQL Query"], horizontal=True)

    if builder_method == "Visual Builder":
        signal_name = st.text_input(
            "Signal Name",
            placeholder="e.g., High-intent enterprise accounts",
            key="builder_signal_name"
        )

        st.markdown("#### Define Conditions (all must be true)")

        # Fetch events/properties for dropdowns
        try:
            events_response = requests.get(f"{API_URL}/api/posthog/events")
            properties_response = requests.get(f"{API_URL}/api/posthog/properties")

            events = ["onboarding_completed", "api_key_created", "pricing_page_viewed"]
            properties = ["company_size", "plan_type", "days_since_signup"]

            if events_response.status_code == 200:
                events = [e.get('event', e) for e in events_response.json().get('events', events)]
            if properties_response.status_code == 200:
                properties = [p.get('property', p) for p in properties_response.json().get('properties', properties)]
        except:
            events = ["onboarding_completed", "api_key_created", "pricing_page_viewed"]
            properties = ["company_size", "plan_type", "days_since_signup"]

        # Condition builder
        conditions = []

        # Condition 1
        with st.container():
            col1, col2, col3, col_delete = st.columns([0.35, 0.35, 0.25, 0.05])
            with col1:
                cond_type_1 = st.selectbox("Type", ["Event", "Property"], key="type_1", label_visibility="collapsed")
            with col2:
                if cond_type_1 == "Event":
                    cond_val_1 = st.selectbox("Event", events, key="event_1", label_visibility="collapsed")
                else:
                    cond_val_1 = st.selectbox("Property", properties, key="prop_1", label_visibility="collapsed")
            with col3:
                if cond_type_1 == "Event":
                    cond_op_1 = st.selectbox("Op", ["completed", "count >="], key="op_1", label_visibility="collapsed")
                else:
                    cond_op_1 = st.selectbox("Op", ["=", ">=", "<="], key="op_1_prop", label_visibility="collapsed")

        # Condition 2
        with st.container():
            col1, col2, col3, col_delete = st.columns([0.35, 0.35, 0.25, 0.05])
            with col1:
                cond_type_2 = st.selectbox("Type", ["Property", "Event"], key="type_2", label_visibility="collapsed")
            with col2:
                if cond_type_2 == "Property":
                    cond_val_2 = st.selectbox("Property", properties, key="prop_2", label_visibility="collapsed")
                else:
                    cond_val_2 = st.selectbox("Event", events, key="event_2", label_visibility="collapsed")
            with col3:
                if cond_type_2 == "Property":
                    cond_op_2 = st.selectbox("Op", ["=", ">=", "<="], key="op_2", label_visibility="collapsed")
                else:
                    cond_op_2 = st.selectbox("Op", ["completed", "count >="], key="op_2_ev", label_visibility="collapsed")

        if st.button("+ Add Another Condition"):
            st.info("Additional conditions can be added via SQL mode")

    else:  # SQL Query method
        signal_name = st.text_input(
            "Signal Name",
            placeholder="Custom SQL signal",
            key="sql_signal_name"
        )

        sql_query = st.text_area(
            "SQL Query",
            value="""SELECT DISTINCT user_id
FROM events
WHERE event = 'onboarding_completed'
  AND days_since_signup <= 3
  AND user_id IN (
    SELECT user_id FROM users
    WHERE company_size BETWEEN 50 AND 500
  )""",
            height=150,
            key="sql_query_input"
        )

        st.caption("**Available tables:** events, users, companies, deals")

        if st.button("📖 Show Schema"):
            with st.expander("Schema Details"):
                st.code("""
-- Events table
event         String
distinct_id   String
timestamp     DateTime
properties    String (JSON)

-- Users table
user_id       String
email         String
properties    String (JSON)

-- Companies table
company_id    String
domain        String
employee_count Int
                """, language="sql")

    # Run Backtest Button
    st.markdown("---")

    col_spacer, col_btn = st.columns([0.7, 0.3])
    with col_btn:
        if st.button("🧪 Run Backtest", type="primary", use_container_width=True):
            if not signal_name:
                st.error("Please enter a signal name")
            else:
                # Show loading with preloader logic
                start_time = time.time()
                with st.spinner("Computing signal performance..."):
                    # Simulate API call
                    time.sleep(1)

                elapsed = time.time() - start_time

                if elapsed > 0.5:
                    st.info(f"Calculation completed in {elapsed:.1f}s")

                # Generate mock backtest results
                backtest_results = {
                    "signal_name": signal_name,
                    "lift": 3.4,
                    "confidence": 0.92,
                    "p_value": 0.001,
                    "sample_with": 1456,
                    "sample_without": 8725,
                    "conversion_with": 0.113,
                    "conversion_without": 0.034,
                    "leads_per_month": 52,
                    "incremental_arr": 129600,
                    "is_significant": True
                }

                st.session_state.backtest_results = backtest_results

    # Display Results
    if st.session_state.get("backtest_results"):
        st.markdown("---")
        st.subheader("✅ Backtest Results")

        results = st.session_state.backtest_results

        # Key metrics
        col1, col2 = st.columns(2)
        with col1:
            st.metric("Lift", f"{results['lift']:.1f}x", "Highly significant")
            st.metric("Confidence", f"{results['confidence']*100:.0f}%", "Strong signal")

        with col2:
            st.metric("Sample (With Signal)", results['sample_with'], "users")
            st.metric("Sample (Without)", results['sample_without'], "users")

        # Comparison table
        st.markdown("##### Comparison")
        comparison_data = {
            "Metric": ["Users", "Converted", "Conversion Rate"],
            "With Signal": [results['sample_with'], int(results['sample_with'] * results['conversion_with']), f"{results['conversion_with']*100:.1f}%"],
            "Without Signal": [results['sample_without'], int(results['sample_without'] * results['conversion_without']), f"{results['conversion_without']*100:.1f}%"]
        }
        st.dataframe(pd.DataFrame(comparison_data), use_container_width=True, hide_index=True)

        # Revenue projection
        st.markdown("##### Revenue Projection")
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Monthly Matches", results['leads_per_month'], "users/month")
        with col2:
            incremental_conversions = results['leads_per_month'] * results['conversion_with'] - results['leads_per_month'] * results['conversion_without']
            st.metric("Incremental Conversions", f"{incremental_conversions:.0f}", "per month")
        with col3:
            st.metric("Incremental ARR", f"${results['incremental_arr']:,.0f}", "per year")

        # Action buttons
        st.markdown("---")
        col_save, col_activate, col_clear = st.columns(3)
        with col_save:
            if st.button("💾 Save Signal", use_container_width=True):
                st.success(f"✅ Signal '{signal_name}' saved as Draft")

        with col_activate:
            if st.button("🚀 Activate Signal", use_container_width=True):
                # Show validation modal
                with st.expander("Pre-Activation Backtest Check", expanded=True):
                    st.markdown(f"""
                    ### Backtest Validation: {signal_name}

                    **Historical Performance (Last 30 days):**
                    - Average Lift: {results['lift']:.1f}x ✅ (strong)
                    - Average Confidence: {results['confidence']*100:.0f}% ✅ (reliable)
                    - Sample Size: {results['leads_per_month']}-{results['leads_per_month']+20} users/month ⚠️ (low volume)
                    - Consistency: ✅ Stable

                    **Recommendation:** ✅ SAFE TO ACTIVATE
                    """)

                    col_confirm, col_cancel = st.columns(2)
                    with col_confirm:
                        if st.button("✓ Confirm Activation"):
                            st.success(f"🚀 Signal '{signal_name}' activated!")
                    with col_cancel:
                        if st.button("Cancel Activation"):
                            st.info("Activation cancelled")

        with col_clear:
            if st.button("Clear Results", use_container_width=True):
                st.session_state.backtest_results = None
                st.rerun()

# ===== TAB 2: VIEWER (Historical Performance) =====
with tab_viewer:
    st.subheader("Signal Performance Over Time")

    # Get signals for viewer
    signals = get_mock_signals() if is_mock_mode() else []

    if not signals:
        st.info("No signals available. Switch to mock data or create a custom signal first.")
    else:
        # Signal selection
        st.markdown("#### Select Signals to Compare")

        # Quick filter buttons
        col_all, col_active, col_custom = st.columns(3)
        with col_all:
            if st.button("All Signals", use_container_width=True):
                st.session_state.selected_signals = [s['id'] for s in signals]

        with col_active:
            if st.button("Active Only", use_container_width=True):
                st.session_state.selected_signals = [s['id'] for s in signals if s.get('status') == 'active']

        with col_custom:
            if st.button("Custom Select", use_container_width=True):
                st.session_state.show_signal_selector = True

        # Selected signals display
        selected_signal_ids = st.session_state.get('selected_signals', [])

        if selected_signal_ids:
            st.markdown("**Selected Signals:**")
            cols = st.columns(min(5, len(selected_signal_ids)))
            for i, sig_id in enumerate(selected_signal_ids[:5]):
                signal = next((s for s in signals if s['id'] == sig_id), None)
                if signal:
                    with cols[i % len(cols)]:
                        st.tag(signal['name'][:20])

        st.markdown("---")

        # Visualization controls
        col_style, col_range = st.columns(2)
        with col_style:
            viz_style = st.selectbox(
                "Chart Style",
                ["Line", "Bar", "Stacked Bar", "Area"],
                key="viz_style"
            )

        with col_range:
            date_range = st.selectbox(
                "Time Period",
                ["7 days", "30 days", "60 days", "90 days", "6 months", "1 year"],
                key="date_range"
            )

        st.markdown("---")

        # Generate historical performance data
        @st.cache_data(ttl=300)
        def generate_performance_data(signal_ids, range_days):
            """Generate mock historical performance data."""
            import random
            from datetime import datetime, timedelta

            dates = []
            base_date = datetime.now() - timedelta(days=range_days)
            for i in range(range_days):
                dates.append(base_date + timedelta(days=i))

            data = []
            for signal_id in signal_ids:
                signal = next((s for s in signals if s['id'] == signal_id), None)
                if signal:
                    base_lift = signal.get('lift', 2.0)
                    for date in dates:
                        # Add some variation to make it realistic
                        noise = random.uniform(-0.2, 0.2)
                        lift_value = max(1.0, base_lift + noise)
                        data.append({
                            "date": date,
                            "signal_name": signal['name'],
                            "lift": lift_value,
                            "confidence": signal.get('confidence', 0.90) + random.uniform(-0.05, 0.05)
                        })

            return pd.DataFrame(data)

        # Get range in days
        range_map = {"7 days": 7, "30 days": 30, "60 days": 60, "90 days": 90, "6 months": 180, "1 year": 365}
        range_days = range_map.get(date_range, 30)

        if selected_signal_ids:
            perf_data = generate_performance_data(selected_signal_ids, range_days)

            # Create chart based on selected style
            fig = None

            if viz_style == "Line":
                fig = px.line(
                    perf_data,
                    x="date",
                    y="lift",
                    color="signal_name",
                    markers=True,
                    title="Signal Lift Over Time",
                    labels={"lift": "Lift (x)", "date": "Date", "signal_name": "Signal"}
                )
            elif viz_style == "Bar":
                # Group by week for bar chart
                perf_data['week'] = perf_data['date'].dt.to_period('W')
                weekly_data = perf_data.groupby(['week', 'signal_name'])['lift'].mean().reset_index()
                fig = px.bar(
                    weekly_data,
                    x="week",
                    y="lift",
                    color="signal_name",
                    title="Signal Lift by Week",
                    labels={"lift": "Avg Lift", "week": "Week", "signal_name": "Signal"}
                )
            elif viz_style == "Stacked Bar":
                perf_data['week'] = perf_data['date'].dt.to_period('W')
                weekly_data = perf_data.groupby(['week', 'signal_name'])['lift'].mean().reset_index()
                fig = px.bar(
                    weekly_data,
                    x="week",
                    y="lift",
                    color="signal_name",
                    title="Signal Lift (Stacked)",
                    barmode="stack",
                    labels={"lift": "Avg Lift", "week": "Week", "signal_name": "Signal"}
                )
            elif viz_style == "Area":
                fig = go.Figure()
                for signal_name in perf_data['signal_name'].unique():
                    signal_data = perf_data[perf_data['signal_name'] == signal_name].sort_values('date')
                    fig.add_trace(go.Scatter(
                        x=signal_data['date'],
                        y=signal_data['lift'],
                        name=signal_name,
                        fill='tonexty' if fig.data else None,
                        mode='lines'
                    ))
                fig.update_layout(
                    title="Signal Lift Over Time (Area)",
                    xaxis_title="Date",
                    yaxis_title="Lift (x)",
                    hovermode='x unified'
                )

            if fig:
                fig.update_layout(height=400, hovermode='closest')
                st.plotly_chart(fig, use_container_width=True)

            # Metrics table
            st.markdown("##### Performance Metrics")

            metrics_data = []
            for signal_id in selected_signal_ids:
                signal_name_val = next((s['name'] for s in signals if s['id'] == signal_id), "Unknown")
                signal_perf = perf_data[perf_data['signal_name'] == signal_name_val]

                if not signal_perf.empty:
                    metrics_data.append({
                        "Signal": signal_name_val[:30],
                        "Current Lift": f"{signal_perf['lift'].iloc[-1]:.2f}x",
                        "Avg Lift (Period)": f"{signal_perf['lift'].mean():.2f}x",
                        "Min Lift": f"{signal_perf['lift'].min():.2f}x",
                        "Max Lift": f"{signal_perf['lift'].max():.2f}x",
                        "Confidence": f"{signal_perf['confidence'].mean()*100:.0f}%"
                    })

            if metrics_data:
                st.dataframe(pd.DataFrame(metrics_data), use_container_width=True, hide_index=True)

        else:
            st.info("Select signals above to view their historical performance")

st.markdown("---")

# === NAVIGATION BUTTONS ===
col_back, col_next = st.columns([0.5, 0.5])

with col_back:
    if st.button("← Back: Signals", use_container_width=True):
        st.switch_page("pages/03_Signals.py")

with col_next:
    if st.button("Next: Playbooks →", use_container_width=True):
        st.switch_page("pages/06_Playbooks.py")

# Progress indicator
st.markdown("---")
st.markdown("""
<div style='font-size: 12px; color: #666;'>

**Step 3 of 5: Backtesting** ✓

- Setup ✓
- Signal Explorer ✓
- **Backtesting** (Current)
- Playbooks
- Destinations

</div>
""", unsafe_allow_html=True)
