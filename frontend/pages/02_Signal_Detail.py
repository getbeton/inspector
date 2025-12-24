"""
Signal Detail Page
Shows full statistical proof for one signal with backtest results
"""

import streamlit as st
import requests
import plotly.graph_objects as go
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.data_handler import (
    is_mock_mode,
    render_data_mode_toggle,
    show_mock_data_banner,
    get_mock_signals
)

API_URL = os.getenv("API_URL", "http://localhost:8000")

# Header with mock mode toggle
col_title, col_toggle = st.columns([0.85, 0.15])
with col_title:
    st.title("Signal Detail")
with col_toggle:
    render_data_mode_toggle(location="top")

if is_mock_mode():
    show_mock_data_banner()

# Back button
if st.button("← Back to Signals"):
    st.switch_page("pages/01_Signals.py")

# Get selected signal ID from session state
signal_id = st.session_state.get('selected_signal_id')

if not signal_id:
    st.warning("No signal selected. Please select a signal from the Signals page.")
    if st.button("Go to Signals"):
        st.switch_page("pages/01_Signals.py")
    st.stop()

# Fetch signal details
signal = None

if is_mock_mode():
    # Use mock data
    mock_signals = get_mock_signals()
    signal = next((s for s in mock_signals if s['id'] == signal_id), None)

    if signal:
        # Enrich mock signal with additional detail fields
        signal = {
            **signal,
            'description': f"Users who {signal['name'].lower()}",
            'event': signal['name'].lower().replace(' ', '_'),
            'condition': 'count >= 1',
            'sample_with': 1456,
            'sample_without': 8725,
            'conversion_with': signal.get('lift', 3.0) * 0.034,
            'conversion_without': 0.034,
            'ci_lower': signal.get('lift', 3.0) - 0.5,
            'ci_upper': signal.get('lift', 3.0) + 0.5,
            'p_value': 0.001,
            'health': 'healthy',
            'accuracy_trend': [0.85, 0.87, 0.88, 0.90, 0.89, 0.91]
        }
else:
    try:
        response = requests.get(f"{API_URL}/api/signals/{signal_id}")
        if response.status_code == 200:
            data = response.json()
            signal = data.get('signal', {})
    except Exception as e:
        st.error(f"Connection error: {e}")

if not signal:
    st.error("Signal not found")
    st.stop()

# Header
status = "Healthy" if signal.get('health') == 'healthy' else "Degrading"
st.markdown(f"## {signal.get('name', 'Unknown Signal')}")
st.caption(status)

st.markdown("---")

# Definition Section
st.markdown("#### Definition")

with st.container():
    st.write(signal.get('description', 'No description available'))
    st.write("")
    st.write(f"**Source:** {signal.get('source', 'Unknown')}")
    st.write(f"**Event:** `{signal.get('event', 'N/A')}`")
    st.write(f"**Condition:** `{signal.get('condition', 'N/A')}`")

st.markdown("---")

# Backtest Results Section
st.markdown("#### Backtest Results")

col1, col2 = st.columns(2)

with col1:
    st.markdown("**With Signal**")
    st.metric("Users", f"{signal.get('sample_with', 0):,}")
    st.metric("Converted", f"{int(signal.get('sample_with', 0) * signal.get('conversion_with', 0)):,}")
    st.metric("Rate", f"{signal.get('conversion_with', 0) * 100:.1f}%")

with col2:
    st.markdown("**Without Signal**")
    st.metric("Users", f"{signal.get('sample_without', 0):,}")
    st.metric("Converted", f"{int(signal.get('sample_without', 0) * signal.get('conversion_without', 0)):,}")
    st.metric("Rate", f"{signal.get('conversion_without', 0) * 100:.1f}%")

st.markdown("")

# Statistical metrics
st.info(f"""
**Lift:** {signal.get('lift', 0)}x
**95% Confidence Interval:** {signal.get('ci_lower', 0)}x - {signal.get('ci_upper', 0)}x
**p-value:** < {signal.get('p_value', 0.05)}
**Statistical confidence:** {signal.get('confidence', 0) * 100:.1f}%
""")

st.markdown("---")

# Revenue Projection Section
st.markdown("#### Revenue Projection")

estimated_arr = signal.get('estimated_arr', 0)
leads_per_month = signal.get('leads_per_month', 0)

# Calculate expected conversions
baseline_conversion = 0.034
signal_conversion = signal.get('conversion_with', baseline_conversion)
expected_conversions = int(leads_per_month * signal_conversion)
baseline_conversions = int(leads_per_month * baseline_conversion)

st.info(f"""
**Users matching this signal:** {leads_per_month}/month
**Expected additional conversions:** {expected_conversions - baseline_conversions}/month
**Your avg ACV:** $27,000

---

**Projected annual impact:** ${estimated_arr:,.0f}
""")

st.markdown("---")

# Historical Accuracy Section
st.markdown("#### Historical Accuracy")

# Create accuracy trend chart
accuracy_trend = signal.get('accuracy_trend', [])
if accuracy_trend:
    months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][-len(accuracy_trend):]

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=months,
        y=accuracy_trend,
        mode='lines+markers',
        line=dict(color='#10b981', width=3),
        marker=dict(size=8)
    ))

    fig.update_layout(
        height=300,
        margin=dict(l=0, r=0, t=0, b=0),
        xaxis=dict(showgrid=False),
        yaxis=dict(showgrid=True, gridcolor='#eaeaea', tickformat='.0%'),
        plot_bgcolor='white',
        paper_bgcolor='white'
    )

    st.plotly_chart(fig, use_container_width=True)

    current_accuracy = accuracy_trend[-1]
    avg_accuracy = sum(accuracy_trend) / len(accuracy_trend)
    st.caption(f"**Current accuracy:** {current_accuracy * 100:.0f}% | **6-month avg:** {avg_accuracy * 100:.0f}%")

st.markdown("---")

# Action Buttons
col_btn1, col_btn2, col_btn3 = st.columns(3)

with col_btn1:
    current_status = signal.get('status', 'disabled')
    button_label = "Disable" if current_status == 'active' else "Enable"
    if st.button(button_label, use_container_width=True):
        st.success(f"Signal {'disabled' if current_status == 'active' else 'enabled'}!")

with col_btn2:
    if st.button("Add to Rule", use_container_width=True):
        st.switch_page("pages/04_Playbooks.py")

with col_btn3:
    if st.button("Export Users", use_container_width=True):
        st.success("Exporting users matching this signal...")
