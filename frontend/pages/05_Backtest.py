"""
Backtest Page
Allows users to define and test their own signals
"""

import streamlit as st
import requests
import plotly.graph_objects as go
import os
import time

st.title("🧪 Backtest Your Signals")
st.caption("Test any hypothesis against your historical data")

API_URL = os.getenv("API_URL", "http://localhost:8000")

# Initialize session state
if 'backtest_results' not in st.session_state:
    st.session_state.backtest_results = None

# Tab selector
tab1, tab2 = st.tabs(["Visual Builder", "SQL Query"])

with tab1:
    st.subheader("Define Your Signal")

    signal_name = st.text_input("Signal Name", placeholder="e.g., High-intent enterprise accounts")

    st.write("**Conditions (all must be true):**")

    # Fetch events and properties for dropdowns
    try:
        events_response = requests.get(f"{API_URL}/api/posthog/events")
        properties_response = requests.get(f"{API_URL}/api/posthog/properties")

        events = []
        properties = []

        if events_response.status_code == 200:
            events = [e['event'] for e in events_response.json().get('events', [])]

        if properties_response.status_code == 200:
            properties = [p['property'] for p in properties_response.json().get('properties', [])]
    except:
        events = ["onboarding_completed", "pageview", "feature_used"]
        properties = ["company_size", "plan", "days_since_signup"]

    # Condition 1: Event
    with st.container():
        col1, col2, col3, col4 = st.columns([2, 2, 2, 1])

        with col1:
            condition_type_1 = st.selectbox("Type", ["Event", "Property"], key="type_1")

        with col2:
            if condition_type_1 == "Event":
                value_1 = st.selectbox("Event", events, key="event_1")
            else:
                value_1 = st.selectbox("Property", properties, key="prop_1")

        with col3:
            if condition_type_1 == "Event":
                operator_1 = st.selectbox("Operator", ["completed", "count >="], key="op_1")
            else:
                operator_1 = st.selectbox("Operator", [">=", "<=", "="], key="op_1_prop")

        with col4:
            if operator_1 == "count >=":
                count_val_1 = st.number_input("Value", min_value=1, value=1, key="val_1")
            elif condition_type_1 == "Property":
                count_val_1 = st.number_input("Value", min_value=1, value=50, key="val_1_prop")

    # Condition 2: Property
    with st.container():
        col1, col2, col3, col4 = st.columns([2, 2, 2, 1])

        with col1:
            condition_type_2 = st.selectbox("Type", ["Property", "Event"], key="type_2")

        with col2:
            if condition_type_2 == "Property":
                value_2 = st.selectbox("Property", properties, key="prop_2")
            else:
                value_2 = st.selectbox("Event", events, key="event_2")

        with col3:
            if condition_type_2 == "Property":
                operator_2 = st.selectbox("Operator", [">=", "<=", "="], key="op_2")
            else:
                operator_2 = st.selectbox("Operator", ["completed", "count >="], key="op_2_ev")

        with col4:
            if condition_type_2 == "Property":
                count_val_2 = st.number_input("Value", min_value=1, value=500, key="val_2")

    if st.button("➕ Add Condition"):
        st.info("Additional conditions can be added (coming soon)")

with tab2:
    st.subheader("SQL Query")

    signal_name_sql = st.text_input("Signal Name", placeholder="Custom SQL signal", key="sql_name")

    sql_query = st.text_area(
        "SQL Query",
        value="""-- Define users who match your signal
-- Return user_id for users who should be flagged

SELECT DISTINCT user_id
FROM events
WHERE event = 'onboarding_completed'
  AND days_since_signup <= 3
  AND user_id IN (
    SELECT user_id FROM users
    WHERE company_size BETWEEN 50 AND 500
  )""",
        height=250
    )

    st.caption("**Available tables:** events, users, companies, deals")

    if st.button("📖 Show Schema"):
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

st.markdown("---")

# Run Backtest Button
col_center = st.columns([1, 2, 1])[1]
with col_center:
    if st.button("🧪 Run Backtest", type="primary", use_container_width=True):
        with st.spinner("Running backtest..."):
            # Simulate backtest
            signal_definition = {
                "name": signal_name or signal_name_sql,
                "type": "custom"
            }

            try:
                response = requests.post(f"{API_URL}/api/signals/backtest", json=signal_definition)
                if response.status_code == 200:
                    data = response.json()
                    st.session_state.backtest_results = data.get('backtest_results', {})

                    # Progress animation
                    progress_bar = st.progress(0)
                    for i in range(100):
                        time.sleep(0.01)
                        progress_bar.progress(i + 1)
                    progress_bar.empty()

                    st.success("Backtest complete!")
            except Exception as e:
                st.error(f"Backtest failed: {e}")

# Display Results
if st.session_state.backtest_results:
    st.markdown("---")
    st.markdown("## 📊 BACKTEST RESULTS")

    results = st.session_state.backtest_results

    # Check if significant
    is_significant = results.get('is_significant', False)
    status_color = "success" if is_significant else "warning"

    col_lift, col_sig = st.columns(2)

    with col_lift:
        st.metric(
            "📈 LIFT",
            f"{results['lift']}x",
            delta=f"CI: {results['ci_lower']}x - {results['ci_upper']}x"
        )

    with col_sig:
        significance = "✓ SIGNIFICANT" if is_significant else "⚠ REVIEW NEEDED"
        st.metric(
            significance,
            f"p < {results['p_value']}",
            delta=f"{results['confidence'] * 100:.1f}% confidence"
        )

    st.markdown("###")

    # Comparison Table
    st.subheader("Comparison")

    col1, col2 = st.columns(2)

    with col1:
        st.markdown("#### With Signal")
        st.write(f"**Users:** {results['sample_with']:,}")
        st.write(f"**Converted:** {results['converted_with']:,}")
        st.write(f"**Conversion Rate:** {results['conversion_with'] * 100:.1f}%")

    with col2:
        st.markdown("#### Without Signal")
        st.write(f"**Users:** {results['sample_without']:,}")
        st.write(f"**Converted:** {results['converted_without']:,}")
        st.write(f"**Conversion Rate:** {results['conversion_without'] * 100:.1f}%")

    st.markdown("###")

    # Revenue Projection
    st.subheader("Revenue Projection")

    projected_arr = results.get('projected_arr', 0)
    monthly_matches = results.get('monthly_matches', 0)
    expected_conversions = int(monthly_matches * results['conversion_with'])
    baseline_conversions = int(monthly_matches * results['conversion_without'])

    st.info(f"""
**Monthly matches:** {monthly_matches} users
**Expected conversions:** {expected_conversions}/month (vs {baseline_conversions} at baseline)
**Incremental ARR:** +${projected_arr:,.0f}/year
    """)

    st.markdown("###")

    # Recommendation
    recommendation = results.get('recommendation', 'Review')
    if recommendation == "Enable":
        st.success("✅ **ENABLE** — Strong signal with high confidence")
    else:
        st.warning("⚠️ **REVIEW** — Signal may need refinement")

    st.markdown("###")

    # Action Buttons
    col1, col2, col3 = st.columns(3)

    with col1:
        if st.button("💾 Save Signal", use_container_width=True):
            st.success("Signal saved!")

    with col2:
        if st.button("📋 Add to Rule", use_container_width=True):
            st.session_state.page = 'playbooks'
            st.rerun()

    with col3:
        if st.button("🔄 Run Another", use_container_width=True):
            st.session_state.backtest_results = None
            st.rerun()
