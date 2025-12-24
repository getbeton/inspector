"""
Historical Performance Page
View and compare signal performance over time with comprehensive analytics.
"""

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import os
import sys
from datetime import datetime, timedelta
import random

# Add utils to path
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
from utils.color_schemes import get_chart_colors, get_comparison_colors, apply_chart_theme

# Page config
st.set_page_config(
    page_title="Historical Performance | Beton Inspector",
    page_icon="📊",
    layout="wide"
)

API_URL = os.getenv("API_URL", "http://localhost:8000")

# Apply styles
apply_compact_button_styles()
apply_global_styles()

# === PAGE HEADER ===
render_page_header("Historical Performance", show_data_toggle=True)

st.markdown("---")


# ============================================================================
# MOCK DATA GENERATION
# ============================================================================

def generate_historical_lift_data(signals, range_days: int) -> pd.DataFrame:
    """Generate realistic historical lift data for signals."""
    random.seed(42)  # Reproducible data

    dates = []
    base_date = datetime.now() - timedelta(days=range_days)
    for i in range(range_days):
        dates.append(base_date + timedelta(days=i))

    data = []
    for signal in signals:
        base_lift = signal.get('lift', 2.0)
        base_confidence = signal.get('confidence', 0.90)

        # Create a trend pattern (slight improvement over time with weekly seasonality)
        for i, date in enumerate(dates):
            # Weekly seasonality (higher on weekdays)
            day_of_week = date.weekday()
            weekday_factor = 1.0 if day_of_week < 5 else 0.85

            # Gradual improvement trend
            trend_factor = 1.0 + (i / range_days) * 0.1

            # Random noise
            noise = random.uniform(-0.15, 0.15)

            lift_value = max(1.0, base_lift * weekday_factor * trend_factor + noise)
            confidence_value = min(0.999, max(0.8, base_confidence + random.uniform(-0.03, 0.03)))

            data.append({
                "date": date,
                "signal_id": signal['id'],
                "signal_name": signal['name'],
                "lift": round(lift_value, 2),
                "confidence": round(confidence_value, 3),
                "sample_with": int(signal.get('sample_with', 1000) * random.uniform(0.8, 1.2)),
                "sample_without": int(signal.get('sample_without', 5000) * random.uniform(0.9, 1.1)),
                "conversion_with": round(signal.get('conversion_with', 0.10) * random.uniform(0.9, 1.1), 3),
                "conversion_without": round(signal.get('conversion_without', 0.03) * random.uniform(0.95, 1.05), 3),
            })

    return pd.DataFrame(data)


def generate_weekly_summary(signals, weeks: int = 12) -> pd.DataFrame:
    """Generate weekly performance summary."""
    random.seed(42)

    data = []
    base_date = datetime.now() - timedelta(weeks=weeks)

    for signal in signals:
        for week_num in range(weeks):
            week_start = base_date + timedelta(weeks=week_num)

            # Generate metrics with weekly trends
            base_lift = signal.get('lift', 2.0)
            trend = 1.0 + (week_num / weeks) * 0.15

            data.append({
                "week_start": week_start,
                "week_label": f"W{week_num + 1}",
                "signal_id": signal['id'],
                "signal_name": signal['name'],
                "avg_lift": round(base_lift * trend * random.uniform(0.9, 1.1), 2),
                "avg_confidence": round(signal.get('confidence', 0.90) * random.uniform(0.97, 1.03), 3),
                "total_matches": int(signal.get('leads_per_month', 30) * 7 / 30 * random.uniform(0.7, 1.3)),
                "conversions": int(signal.get('leads_per_month', 30) * 7 / 30 * signal.get('conversion_with', 0.10) * random.uniform(0.8, 1.2)),
                "revenue_impact": int(signal.get('estimated_arr', 100000) / 52 * random.uniform(0.8, 1.2)),
            })

    return pd.DataFrame(data)


def generate_comparison_data(signals) -> pd.DataFrame:
    """Generate comparison data across all signals."""
    data = []
    for signal in signals:
        data.append({
            "signal_name": signal['name'],
            "source": signal.get('source', 'Beton'),
            "status": signal.get('status', 'active'),
            "current_lift": signal.get('lift', 2.0),
            "confidence": signal.get('confidence', 0.90),
            "sample_with": signal.get('sample_with', 1000),
            "sample_without": signal.get('sample_without', 5000),
            "conversion_with": signal.get('conversion_with', 0.10),
            "conversion_without": signal.get('conversion_without', 0.03),
            "leads_per_month": signal.get('leads_per_month', 30),
            "estimated_arr": signal.get('estimated_arr', 100000),
            "trend_30d": signal.get('trend_30d', '+5%'),
        })
    return pd.DataFrame(data)


# ============================================================================
# PAGE CONTENT
# ============================================================================

# Get signals
signals = get_mock_signals() if is_mock_mode() else []

if not signals:
    st.info("No signals available. Switch to Demo mode to see sample performance data.")
    st.stop()

# === FILTERS ===
st.markdown("### Filters")
col_signals, col_period, col_view = st.columns([0.4, 0.3, 0.3])

with col_signals:
    signal_options = {s['id']: s['name'] for s in signals}
    selected_signal_ids = st.multiselect(
        "Select Signals",
        options=list(signal_options.keys()),
        default=list(signal_options.keys())[:3],
        format_func=lambda x: signal_options[x],
        key="perf_signal_select"
    )

with col_period:
    date_range = st.selectbox(
        "Time Period",
        ["7 days", "14 days", "30 days", "60 days", "90 days"],
        index=2,
        key="perf_date_range"
    )

with col_view:
    view_mode = st.selectbox(
        "View Mode",
        ["Overview", "Detailed Trends", "Comparison Table", "Revenue Analysis"],
        key="perf_view_mode"
    )

st.markdown("---")

# Get range in days
range_map = {"7 days": 7, "14 days": 14, "30 days": 30, "60 days": 60, "90 days": 90}
range_days = range_map.get(date_range, 30)

# Filter signals
selected_signals = [s for s in signals if s['id'] in selected_signal_ids]

if not selected_signals:
    st.warning("Please select at least one signal to view performance data.")
    st.stop()


# ============================================================================
# VIEW: OVERVIEW
# ============================================================================
if view_mode == "Overview":
    st.markdown("### Performance Overview")

    # Summary metrics row
    col1, col2, col3, col4 = st.columns(4)

    avg_lift = sum(s['lift'] for s in selected_signals) / len(selected_signals)
    avg_confidence = sum(s['confidence'] for s in selected_signals) / len(selected_signals)
    total_leads = sum(s.get('leads_per_month', 0) for s in selected_signals)
    total_arr = sum(s.get('estimated_arr', 0) for s in selected_signals)

    with col1:
        st.metric("Avg Lift", f"{avg_lift:.1f}x", delta="+0.2x (30d)")
    with col2:
        st.metric("Avg Confidence", f"{avg_confidence*100:.0f}%", delta="+2%")
    with col3:
        st.metric("Total Leads/mo", f"{total_leads:,}", delta="+12")
    with col4:
        st.metric("Combined ARR Impact", f"${total_arr:,.0f}", delta="+$45K")

    st.markdown("")

    # Lift trend chart
    st.markdown("##### Lift Over Time")

    perf_data = generate_historical_lift_data(selected_signals, range_days)

    fig_lift = px.line(
        perf_data,
        x="date",
        y="lift",
        color="signal_name",
        markers=True,
        labels={"lift": "Lift (x)", "date": "Date", "signal_name": "Signal"}
    )
    fig_lift.update_layout(
        height=350,
        hovermode='x unified',
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
    )
    fig_lift = apply_chart_theme(fig_lift)
    st.plotly_chart(fig_lift, use_container_width=True)

    # Quick comparison cards
    st.markdown("##### Signal Cards")

    cols = st.columns(min(3, len(selected_signals)))
    for i, signal in enumerate(selected_signals[:3]):
        with cols[i]:
            with st.container():
                st.markdown(f"**{signal['name'][:25]}...**" if len(signal['name']) > 25 else f"**{signal['name']}**")

                # Mini metrics
                mini_col1, mini_col2 = st.columns(2)
                with mini_col1:
                    st.metric("Lift", f"{signal['lift']:.1f}x", delta=signal.get('trend_30d', '+5%'))
                with mini_col2:
                    st.metric("Conf", f"{signal['confidence']*100:.0f}%")

                # Sparkline
                trend_data = signal.get('trend_data', [2.0, 2.1, 2.0, 2.2, 2.1, 2.3, 2.2])
                fig_spark = go.Figure()
                fig_spark.add_trace(go.Scatter(
                    y=trend_data,
                    mode='lines',
                    line=dict(color='#0173B2', width=2),
                    fill='tozeroy',
                    fillcolor='rgba(1, 115, 178, 0.1)'
                ))
                fig_spark.update_layout(
                    height=60,
                    margin=dict(l=0, r=0, t=0, b=0),
                    xaxis=dict(visible=False),
                    yaxis=dict(visible=False),
                    showlegend=False,
                    plot_bgcolor='rgba(0,0,0,0)',
                    paper_bgcolor='rgba(0,0,0,0)'
                )
                st.plotly_chart(fig_spark, use_container_width=True, key=f"spark_{signal['id']}")


# ============================================================================
# VIEW: DETAILED TRENDS
# ============================================================================
elif view_mode == "Detailed Trends":
    st.markdown("### Detailed Trend Analysis")

    perf_data = generate_historical_lift_data(selected_signals, range_days)

    # Chart type selector
    chart_type = st.radio("Chart Type", ["Line", "Area", "Bar (Weekly)"], horizontal=True)

    if chart_type == "Line":
        fig = px.line(
            perf_data,
            x="date",
            y="lift",
            color="signal_name",
            markers=True,
            title="Signal Lift Over Time",
            labels={"lift": "Lift (x)", "date": "Date", "signal_name": "Signal"}
        )
    elif chart_type == "Area":
        fig = px.area(
            perf_data,
            x="date",
            y="lift",
            color="signal_name",
            title="Signal Lift Over Time (Stacked)",
            labels={"lift": "Lift (x)", "date": "Date", "signal_name": "Signal"}
        )
    else:  # Bar (Weekly)
        perf_data['week'] = perf_data['date'].dt.isocalendar().week
        weekly_data = perf_data.groupby(['week', 'signal_name'])['lift'].mean().reset_index()
        fig = px.bar(
            weekly_data,
            x="week",
            y="lift",
            color="signal_name",
            barmode="group",
            title="Average Weekly Lift",
            labels={"lift": "Avg Lift (x)", "week": "Week", "signal_name": "Signal"}
        )

    fig.update_layout(height=400, hovermode='x unified')
    fig = apply_chart_theme(fig)
    st.plotly_chart(fig, use_container_width=True)

    # Confidence trend
    st.markdown("##### Confidence Over Time")

    fig_conf = px.line(
        perf_data,
        x="date",
        y="confidence",
        color="signal_name",
        title="Statistical Confidence",
        labels={"confidence": "Confidence", "date": "Date", "signal_name": "Signal"}
    )
    fig_conf.update_layout(height=300, yaxis=dict(tickformat='.0%'))
    fig_conf = apply_chart_theme(fig_conf)
    st.plotly_chart(fig_conf, use_container_width=True)

    # Sample size over time
    st.markdown("##### Sample Size Trends")

    fig_samples = go.Figure()
    for signal in selected_signals:
        signal_data = perf_data[perf_data['signal_id'] == signal['id']]
        fig_samples.add_trace(go.Scatter(
            x=signal_data['date'],
            y=signal_data['sample_with'],
            name=f"{signal['name'][:20]} (with)",
            mode='lines+markers'
        ))

    fig_samples.update_layout(
        title="Users With Signal",
        height=300,
        xaxis_title="Date",
        yaxis_title="Users"
    )
    fig_samples = apply_chart_theme(fig_samples)
    st.plotly_chart(fig_samples, use_container_width=True)


# ============================================================================
# VIEW: COMPARISON TABLE
# ============================================================================
elif view_mode == "Comparison Table":
    st.markdown("### Signal Comparison")

    comparison_df = generate_comparison_data(selected_signals)

    # Styled comparison table
    st.markdown("##### Performance Metrics")

    display_df = comparison_df[[
        'signal_name', 'source', 'status', 'current_lift', 'confidence',
        'conversion_with', 'conversion_without', 'leads_per_month', 'trend_30d'
    ]].copy()

    display_df.columns = [
        'Signal', 'Source', 'Status', 'Lift', 'Confidence',
        'Conv. With', 'Conv. Without', 'Leads/mo', '30d Trend'
    ]

    # Format values
    display_df['Lift'] = display_df['Lift'].apply(lambda x: f"{x:.1f}x")
    display_df['Confidence'] = display_df['Confidence'].apply(lambda x: f"{x*100:.0f}%")
    display_df['Conv. With'] = display_df['Conv. With'].apply(lambda x: f"{x*100:.1f}%")
    display_df['Conv. Without'] = display_df['Conv. Without'].apply(lambda x: f"{x*100:.1f}%")

    st.dataframe(display_df, use_container_width=True, hide_index=True)

    # Visual comparison
    st.markdown("##### Lift Comparison")

    positive_color, neutral_color = get_comparison_colors()

    fig_compare = go.Figure()
    fig_compare.add_trace(go.Bar(
        x=[s['name'][:20] for s in selected_signals],
        y=[s['lift'] for s in selected_signals],
        text=[f"{s['lift']:.1f}x" for s in selected_signals],
        textposition='outside',
        marker_color=positive_color
    ))
    fig_compare.update_layout(
        title="Signal Lift Comparison",
        xaxis_title="Signal",
        yaxis_title="Lift (x)",
        height=350
    )
    fig_compare = apply_chart_theme(fig_compare)
    st.plotly_chart(fig_compare, use_container_width=True)

    # Conversion rate comparison
    st.markdown("##### Conversion Rate Comparison")

    fig_conv = go.Figure()
    fig_conv.add_trace(go.Bar(
        name='With Signal',
        x=[s['name'][:20] for s in selected_signals],
        y=[s.get('conversion_with', 0.10) * 100 for s in selected_signals],
        text=[f"{s.get('conversion_with', 0.10)*100:.1f}%" for s in selected_signals],
        textposition='outside',
        marker_color=positive_color
    ))
    fig_conv.add_trace(go.Bar(
        name='Without Signal',
        x=[s['name'][:20] for s in selected_signals],
        y=[s.get('conversion_without', 0.03) * 100 for s in selected_signals],
        text=[f"{s.get('conversion_without', 0.03)*100:.1f}%" for s in selected_signals],
        textposition='outside',
        marker_color=neutral_color
    ))
    fig_conv.update_layout(
        barmode='group',
        title="Conversion: With vs Without Signal",
        xaxis_title="Signal",
        yaxis_title="Conversion Rate (%)",
        height=350
    )
    fig_conv = apply_chart_theme(fig_conv)
    st.plotly_chart(fig_conv, use_container_width=True)


# ============================================================================
# VIEW: REVENUE ANALYSIS
# ============================================================================
elif view_mode == "Revenue Analysis":
    st.markdown("### Revenue Impact Analysis")

    weekly_data = generate_weekly_summary(selected_signals, weeks=12)

    # Total revenue metrics
    total_weekly_arr = weekly_data.groupby('week_label')['revenue_impact'].sum()

    col1, col2, col3 = st.columns(3)
    with col1:
        total_arr = sum(s.get('estimated_arr', 0) for s in selected_signals)
        st.metric("Total Annual ARR Impact", f"${total_arr:,.0f}", delta="+$125K YoY")
    with col2:
        monthly_impact = total_arr / 12
        st.metric("Monthly Revenue Impact", f"${monthly_impact:,.0f}", delta="+$10.4K")
    with col3:
        avg_per_signal = total_arr / len(selected_signals)
        st.metric("Avg per Signal", f"${avg_per_signal:,.0f}")

    st.markdown("")

    # Weekly revenue trend
    st.markdown("##### Weekly Revenue Impact")

    fig_revenue = px.bar(
        weekly_data,
        x="week_label",
        y="revenue_impact",
        color="signal_name",
        title="Revenue Impact by Week",
        labels={"revenue_impact": "Revenue ($)", "week_label": "Week", "signal_name": "Signal"}
    )
    fig_revenue.update_layout(height=400)
    fig_revenue = apply_chart_theme(fig_revenue)
    st.plotly_chart(fig_revenue, use_container_width=True)

    # Revenue breakdown by signal
    st.markdown("##### Revenue by Signal")

    signal_revenue = [
        {"signal": s['name'][:25], "arr": s.get('estimated_arr', 100000)}
        for s in selected_signals
    ]
    signal_revenue_df = pd.DataFrame(signal_revenue)

    fig_pie = px.pie(
        signal_revenue_df,
        values='arr',
        names='signal',
        title="ARR Distribution by Signal"
    )
    fig_pie.update_traces(textposition='inside', textinfo='percent+label')
    fig_pie.update_layout(height=350)
    st.plotly_chart(fig_pie, use_container_width=True)

    # Detailed revenue table
    st.markdown("##### Revenue Details")

    revenue_table = []
    for signal in selected_signals:
        arr = signal.get('estimated_arr', 100000)
        leads = signal.get('leads_per_month', 30)
        conv_rate = signal.get('conversion_with', 0.10)

        revenue_table.append({
            "Signal": signal['name'][:30],
            "Leads/mo": leads,
            "Conv. Rate": f"{conv_rate*100:.1f}%",
            "Conversions/mo": int(leads * conv_rate),
            "Monthly Impact": f"${arr/12:,.0f}",
            "Annual ARR": f"${arr:,.0f}",
        })

    st.dataframe(pd.DataFrame(revenue_table), use_container_width=True, hide_index=True)


st.markdown("---")

# === EXPORT OPTIONS ===
st.markdown("### Export")
col_export1, col_export2, col_export3 = st.columns(3)

with col_export1:
    if st.button("Download CSV", use_container_width=True):
        st.info("CSV export would download performance data")

with col_export2:
    if st.button("Download PDF Report", use_container_width=True):
        st.info("PDF report generation coming soon")

with col_export3:
    if st.button("Schedule Weekly Report", use_container_width=True):
        st.info("Weekly report scheduling coming soon")

st.markdown("---")

# === NAVIGATION ===
col_back, col_next = st.columns(2)

with col_back:
    if st.button("← Back: Signals", use_container_width=True):
        st.switch_page("pages/01_Signals.py")

with col_next:
    if st.button("Next: Add Signal →", use_container_width=True):
        st.switch_page("pages/04_Add_Signal.py")
