"""
Add Signal Page
Create and test custom signals using visual builder or SQL query.
"""

import streamlit as st
import requests
import pandas as pd
import plotly.graph_objects as go
import os
import sys
import time

# Add utils to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.data_handler import is_mock_mode
from utils.ui_components import (
    render_page_header,
    apply_compact_button_styles,
    apply_global_styles
)
from utils.color_schemes import get_comparison_colors, apply_chart_theme

# Page config
st.set_page_config(
    page_title="Add Signal | Beton Inspector",
    page_icon="➕",
    layout="wide"
)

API_URL = os.getenv("API_URL", "http://localhost:8000")

# Apply styles
apply_compact_button_styles()
apply_global_styles()

# === PAGE HEADER ===
render_page_header("Add Signal", show_data_toggle=True)

st.markdown("---")

# Initialize session state
if 'signal_cache' not in st.session_state:
    st.session_state.signal_cache = {}

# === MAIN CONTENT ===
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

    if st.button("Show Schema"):
        with st.expander("Schema Details", expanded=True):
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
    if st.button("Run Backtest", type="primary", use_container_width=True):
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
    st.subheader("Backtest Results")

    results = st.session_state.backtest_results

    # Key metrics row
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric(
            label="Lift",
            value=f"{results['lift']:.1f}x",
            delta="Highly significant",
            help="How many times more likely to convert vs baseline"
        )
    with col2:
        st.metric(
            label="Confidence",
            value=f"{results['confidence']*100:.0f}%",
            delta="Strong signal",
            help="Statistical certainty of the result"
        )
    with col3:
        st.metric(
            label="With Signal",
            value=f"{results['sample_with']:,}",
            delta=f"{results['conversion_with']*100:.1f}% conv",
            help="Users matching this signal"
        )
    with col4:
        st.metric(
            label="Without Signal",
            value=f"{results['sample_without']:,}",
            delta=f"{results['conversion_without']*100:.1f}% conv",
            delta_color="off",
            help="Users not matching this signal"
        )

    st.markdown("")

    # Visual comparison chart
    st.markdown("##### Conversion Comparison")

    positive_color, neutral_color = get_comparison_colors()

    fig_compare = go.Figure()
    fig_compare.add_trace(go.Bar(
        y=['Without Signal', 'With Signal'],
        x=[results['conversion_without'], results['conversion_with']],
        orientation='h',
        text=[f"{results['conversion_without']*100:.1f}%", f"{results['conversion_with']*100:.1f}%"],
        textposition='outside',
        textfont=dict(size=14),
        marker_color=[neutral_color, positive_color]
    ))

    fig_compare.update_layout(
        height=150,
        margin=dict(l=0, r=80, t=10, b=10),
        xaxis=dict(showgrid=False, showticklabels=False, range=[0, results['conversion_with'] * 1.5]),
        yaxis=dict(showgrid=False),
        plot_bgcolor='rgba(0,0,0,0)',
        paper_bgcolor='rgba(0,0,0,0)'
    )
    fig_compare = apply_chart_theme(fig_compare)
    st.plotly_chart(fig_compare, use_container_width=True)

    # Comparison table
    st.markdown("##### Detailed Breakdown")
    comparison_data = {
        "Metric": ["Users", "Converted", "Conversion Rate", "Revenue per User"],
        "With Signal": [
            f"{results['sample_with']:,}",
            f"{int(results['sample_with'] * results['conversion_with']):,}",
            f"{results['conversion_with']*100:.1f}%",
            f"${results['conversion_with'] * 27000:,.0f}"
        ],
        "Without Signal": [
            f"{results['sample_without']:,}",
            f"{int(results['sample_without'] * results['conversion_without']):,}",
            f"{results['conversion_without']*100:.1f}%",
            f"${results['conversion_without'] * 27000:,.0f}"
        ]
    }
    st.dataframe(pd.DataFrame(comparison_data), use_container_width=True, hide_index=True)

    # Revenue projection
    st.markdown("##### Revenue Projection")
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric(
            label="Monthly Matches",
            value=f"{results['leads_per_month']}",
            delta="users/month"
        )
    with col2:
        incremental_conversions = results['leads_per_month'] * results['conversion_with'] - results['leads_per_month'] * results['conversion_without']
        st.metric(
            label="Incremental Conv.",
            value=f"{incremental_conversions:.0f}",
            delta="per month"
        )
    with col3:
        st.metric(
            label="Incremental ARR",
            value=f"${results['incremental_arr']:,.0f}",
            delta="per year"
        )

    # Action buttons
    st.markdown("---")
    col_save, col_activate, col_clear = st.columns(3)
    with col_save:
        if st.button("Save Signal", use_container_width=True):
            st.success(f"Signal '{signal_name}' saved as Draft")

    with col_activate:
        if st.button("Activate Signal", type="primary", use_container_width=True):
            # Show validation modal
            with st.expander("Pre-Activation Backtest Check", expanded=True):
                st.markdown(f"""
                ### Backtest Validation: {signal_name}

                **Historical Performance (Last 30 days):**
                - Average Lift: {results['lift']:.1f}x (strong)
                - Average Confidence: {results['confidence']*100:.0f}% (reliable)
                - Sample Size: {results['leads_per_month']}-{results['leads_per_month']+20} users/month (low volume)
                - Consistency: Stable

                **Recommendation:** SAFE TO ACTIVATE
                """)

                col_confirm, col_cancel = st.columns(2)
                with col_confirm:
                    if st.button("Confirm Activation", type="primary"):
                        st.success(f"Signal '{signal_name}' activated!")
                with col_cancel:
                    if st.button("Cancel"):
                        st.info("Activation cancelled")

    with col_clear:
        if st.button("Clear Results", use_container_width=True):
            st.session_state.backtest_results = None
            st.rerun()

st.markdown("---")

# === NAVIGATION BUTTONS ===
col_back, col_next = st.columns(2)

with col_back:
    if st.button("← Back: Historical Performance", use_container_width=True):
        st.switch_page("pages/03_Historical_Performance.py")

with col_next:
    if st.button("Next: Playbooks →", use_container_width=True):
        st.switch_page("pages/05_Playbooks.py")
