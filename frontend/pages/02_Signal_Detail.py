"""
Signal Detail Page
Compact, visual-first layout showing full statistical proof for one signal
"""

import streamlit as st
import plotly.graph_objects as go
import os
import sys

# Add paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.data_handler import (
    is_mock_mode,
    get_mock_signals
)
from utils.ui_components import (
    render_page_header,
    apply_compact_button_styles,
    apply_global_styles
)
from utils.color_schemes import (
    apply_chart_theme,
    get_comparison_colors,
    get_chart_colors
)
from components.states import render_empty_state

# Page config - emoji only in page_icon, NOT in title
st.set_page_config(
    page_title="Signal Detail | Beton Inspector",
    page_icon="📊",
    layout="wide"
)

API_URL = os.getenv("API_URL", "http://localhost:8000")

# Apply styles
apply_compact_button_styles()
apply_global_styles()

# === PAGE HEADER ===
render_page_header("Signal Detail", show_data_toggle=True)

# Back button
if st.button("← Back to Signals", key="back_to_signals"):
    st.switch_page("pages/01_Signals.py")

# Get selected signal ID from session state
signal_id = st.session_state.get('selected_signal_id')

if not signal_id:
    render_empty_state(
        "no_data",
        custom_title="No signal selected",
        custom_message="Please select a signal from the Signals page to view details."
    )
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
            'accuracy_trend': [0.82, 0.85, 0.87, 0.89, 0.87, 0.87],
            'trend_delta': '+0.3x',
            'confidence_delta': '+2%',
            'leads_delta': '+5',
            'arr_delta': '+$42K'
        }
else:
    try:
        import requests
        response = requests.get(f"{API_URL}/api/signals/{signal_id}")
        if response.status_code == 200:
            data = response.json()
            signal = data.get('signal', {})
    except Exception as e:
        st.error(f"Connection error: {e}")

if not signal:
    render_empty_state("error", custom_message="Signal not found or could not be loaded.")
    st.stop()

# === HEADER ROW WITH ACTIONS ===
col_title, col_actions = st.columns([0.7, 0.3])

with col_title:
    st.header(signal.get('name', 'Unknown Signal'))
    status = signal.get('status', 'active')
    health = "Healthy" if signal.get('health') == 'healthy' else "Needs Attention"
    st.caption(f"{status.capitalize()} • {health}")

with col_actions:
    btn_col1, btn_col2 = st.columns(2)
    with btn_col1:
        current_status = signal.get('status', 'disabled')
        button_label = "Disable" if current_status == 'active' else "Enable"
        if st.button(button_label, use_container_width=True, key="toggle_status"):
            st.toast(f"Signal {'disabled' if current_status == 'active' else 'enabled'}!")
    with btn_col2:
        if st.button("Edit", use_container_width=True, key="edit_signal"):
            st.toast("Edit mode would open here")

st.markdown("")

# === KEY METRICS ROW (4 cards) ===
m1, m2, m3, m4 = st.columns(4)

lift = signal.get('lift', 1.0)
confidence = signal.get('confidence', 0)
leads_per_month = signal.get('leads_per_month', 0)
estimated_arr = signal.get('estimated_arr', 0)

with m1:
    st.metric(
        label="Lift",
        value=f"{lift}x",
        delta=signal.get('trend_delta', None),
        help="How many times more likely to convert vs baseline"
    )

with m2:
    st.metric(
        label="Confidence",
        value=f"{confidence * 100:.0f}%",
        delta=signal.get('confidence_delta', None),
        help="Statistical certainty (>95% = reliable)"
    )

with m3:
    st.metric(
        label="Leads/mo",
        value=leads_per_month,
        delta=signal.get('leads_delta', None),
        help="Users matching this signal pattern per month"
    )

with m4:
    st.metric(
        label="ARR Impact",
        value=f"${estimated_arr/1000:.0f}K",
        delta=signal.get('arr_delta', None),
        help="Projected annual revenue from this signal"
    )

st.markdown("")

# === COMPARISON CHART (with numbers ON the chart) ===
st.markdown("#### Conversion Comparison")

conversion_with = signal.get('conversion_with', 0.1)
conversion_without = signal.get('conversion_without', 0.034)
sample_with = signal.get('sample_with', 0)
sample_without = signal.get('sample_without', 0)

# Get colors from palette
positive_color, neutral_color = get_comparison_colors()

fig = go.Figure()

fig.add_trace(go.Bar(
    y=['Without Signal', 'With Signal'],
    x=[conversion_without, conversion_with],
    orientation='h',
    text=[f"{conversion_without*100:.1f}%", f"{conversion_with*100:.1f}%"],
    textposition='outside',
    textfont=dict(size=14, color='#333'),
    marker_color=[neutral_color, positive_color],
    hovertemplate="<b>%{y}</b><br>Conversion: %{x:.1%}<extra></extra>"
))

# Add sample size annotations
fig.add_annotation(
    x=conversion_without, y='Without Signal',
    text=f"({sample_without:,} users)",
    showarrow=False,
    xanchor='left',
    xshift=60,
    font=dict(size=11, color='#666')
)

fig.add_annotation(
    x=conversion_with, y='With Signal',
    text=f"({sample_with:,} users)",
    showarrow=False,
    xanchor='left',
    xshift=60,
    font=dict(size=11, color='#666')
)

fig.update_layout(
    height=140,
    margin=dict(l=0, r=100, t=10, b=10),
    xaxis=dict(
        showgrid=False,
        showticklabels=False,
        range=[0, max(conversion_with, conversion_without) * 1.5]
    ),
    yaxis=dict(showgrid=False),
    plot_bgcolor='rgba(0,0,0,0)',
    paper_bgcolor='rgba(0,0,0,0)'
)

st.plotly_chart(fig, use_container_width=True)

# Toggle for detailed breakdown
if st.toggle("Show detailed breakdown", key="show_breakdown"):
    detail_col1, detail_col2 = st.columns(2)

    with detail_col1:
        st.markdown("**With Signal**")
        converted_with = int(sample_with * conversion_with)
        st.caption(f"Users: {sample_with:,}")
        st.caption(f"Converted: {converted_with:,}")
        st.caption(f"Rate: {conversion_with*100:.2f}%")

    with detail_col2:
        st.markdown("**Without Signal**")
        converted_without = int(sample_without * conversion_without)
        st.caption(f"Users: {sample_without:,}")
        st.caption(f"Converted: {converted_without:,}")
        st.caption(f"Rate: {conversion_without*100:.2f}%")

    # Statistical metrics in a compact format
    st.markdown("")
    stats_col1, stats_col2, stats_col3, stats_col4 = st.columns(4)
    with stats_col1:
        st.caption(f"**Lift:** {lift}x")
    with stats_col2:
        st.caption(f"**95% CI:** {signal.get('ci_lower', 0):.1f}x - {signal.get('ci_upper', 0):.1f}x")
    with stats_col3:
        st.caption(f"**p-value:** < {signal.get('p_value', 0.05)}")
    with stats_col4:
        st.caption(f"**Confidence:** {confidence*100:.1f}%")

st.markdown("")

# === TREND CHART (with data labels) ===
show_trend = st.toggle("Show historical trend", value=True, key="show_trend")

if show_trend:
    st.markdown("#### Historical Accuracy")

    accuracy_trend = signal.get('accuracy_trend', [])
    if accuracy_trend:
        months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][-len(accuracy_trend):]
        chart_colors = get_chart_colors(1)
        primary_color = chart_colors[0]

        fig_trend = go.Figure()
        fig_trend.add_trace(go.Scatter(
            x=months,
            y=accuracy_trend,
            mode='lines+markers+text',
            line=dict(color=primary_color, width=3),
            marker=dict(size=10, color=primary_color),
            text=[f"{v*100:.0f}%" for v in accuracy_trend],
            textposition='top center',
            textfont=dict(size=11, color='#333'),
            hovertemplate="<b>%{x}</b><br>Accuracy: %{y:.0%}<extra></extra>"
        ))

        # Apply theme
        fig_trend = apply_chart_theme(fig_trend)

        fig_trend.update_layout(
            height=250,
            margin=dict(l=0, r=0, t=30, b=0),
            xaxis=dict(showgrid=False),
            yaxis=dict(
                showgrid=True,
                tickformat='.0%',
                range=[min(accuracy_trend) - 0.1, max(accuracy_trend) + 0.1]
            )
        )

        st.plotly_chart(fig_trend, use_container_width=True)

        current_accuracy = accuracy_trend[-1]
        avg_accuracy = sum(accuracy_trend) / len(accuracy_trend)
        st.caption(f"Current: **{current_accuracy*100:.0f}%** | 6-month avg: **{avg_accuracy*100:.0f}%**")

st.markdown("")

# === COLLAPSED SECTIONS ===

# Definition (collapsed by default)
with st.expander("Signal Definition"):
    def_col1, def_col2 = st.columns(2)
    with def_col1:
        st.caption(f"**Event:** `{signal.get('event', 'N/A')}`")
        st.caption(f"**Condition:** `{signal.get('condition', 'N/A')}`")
    with def_col2:
        st.caption(f"**Source:** {signal.get('source', 'Unknown')}")
        st.caption(f"**Created:** Dec 15, 2024")

    st.caption(signal.get('description', 'No description available'))

# Understanding These Metrics (collapsed)
with st.expander("Understanding These Metrics"):
    st.markdown("""
    - **Lift**: How many times more likely users are to convert compared to baseline. A 4x lift means users with this signal convert 4 times more often.

    - **Confidence**: Statistical certainty of the result. >95% means we're highly confident this signal is real, not random noise.

    - **Leads/mo**: Number of users matching this signal pattern per month. Higher volume = more actionable signal.

    - **ARR Impact**: Projected annual revenue from prioritizing users with this signal. Based on your ACV and conversion rates.

    - **Historical Accuracy**: How well this signal has performed over time. Consistent accuracy indicates a reliable signal.
    """)

st.markdown("---")

# === ACTION BUTTONS ===
col_btn1, col_btn2, col_btn3 = st.columns(3)

with col_btn1:
    if st.button("Add to Playbook", use_container_width=True, type="primary"):
        st.switch_page("pages/05_Playbooks.py")

with col_btn2:
    if st.button("Export Users", use_container_width=True):
        st.toast("Exporting users matching this signal...")

with col_btn3:
    if st.button("Run Backtest", use_container_width=True):
        st.switch_page("pages/03_Backtest.py")
