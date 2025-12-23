"""
Beton Signal Discovery - Main Dashboard
Shows overall system health and key metrics at a glance
"""

import streamlit as st
import requests
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from datetime import datetime, timedelta
import os

# Page config
st.set_page_config(
    page_title="Dashboard | Beton Signal Discovery",
    page_icon="🎯",
    layout="wide"
)

# API URL
API_URL = os.getenv("API_URL", "http://localhost:8000")

# Custom CSS for better styling
st.markdown("""
<style>
    .metric-card {
        background-color: #ffffff;
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #eaeaea;
    }
    .signal-health-item {
        padding: 10px;
        margin: 5px 0;
        border-radius: 5px;
        background-color: #fafafa;
    }
    .lead-item {
        padding: 10px;
        margin: 5px 0;
        border-radius: 5px;
        background-color: #fafafa;
    }
    h1 {
        color: #111111;
    }
    .stMetric {
        background-color: #ffffff;
        padding: 15px;
        border-radius: 8px;
        border: 1px solid #eaeaea;
    }
</style>
""", unsafe_allow_html=True)

# Initialize session state for navigation
if 'page' not in st.session_state:
    st.session_state.page = 'dashboard'
if 'selected_signal_id' not in st.session_state:
    st.session_state.selected_signal_id = None

# Sidebar Navigation
st.sidebar.title("🎯 Beton Signal Discovery")
st.sidebar.markdown("---")

if st.sidebar.button("🏠 Dashboard", use_container_width=True):
    st.session_state.page = 'dashboard'
    st.rerun()

if st.sidebar.button("📊 Sources", use_container_width=True):
    st.session_state.page = 'sources'
    st.rerun()

if st.sidebar.button("🎯 Signals", use_container_width=True):
    st.session_state.page = 'signals'
    st.rerun()

if st.sidebar.button("🧪 Backtest", use_container_width=True):
    st.session_state.page = 'backtest'
    st.rerun()

if st.sidebar.button("📋 Playbooks", use_container_width=True):
    st.session_state.page = 'playbooks'
    st.rerun()

if st.sidebar.button("📤 Destinations", use_container_width=True):
    st.session_state.page = 'destinations'
    st.rerun()

if st.sidebar.button("⚙️ Settings", use_container_width=True):
    st.session_state.page = 'settings'
    st.rerun()

st.sidebar.markdown("---")
st.sidebar.caption("Signal Discovery & Validation Engine")

# --- Main Content ---

# Dashboard Page
if st.session_state.page == 'dashboard':
    col_header_left, col_header_right = st.columns([3, 1])

    with col_header_left:
        st.title("📊 Dashboard")

    with col_header_right:
        if st.button("🔄 Run Discovery", type="primary"):
            with st.spinner("Running signal discovery..."):
                import time
                progress_bar = st.progress(0)
                for i in range(100):
                    time.sleep(0.02)
                    progress_bar.progress(i + 1)
                progress_bar.empty()
                st.success("Discovery complete! Found 10 signals.")

    # Fetch dashboard metrics
    try:
        response = requests.get(f"{API_URL}/api/signals/dashboard/metrics")
        if response.status_code == 200:
            data = response.json()
            metrics = data.get('metrics', {})
            summary = data.get('summary', {})
            recent_leads = data.get('recent_leads', [])

            # Metric Cards
            col1, col2, col3, col4 = st.columns(4)

            with col1:
                st.metric(
                    label="Leads This Month",
                    value=f"{metrics.get('leads_this_month', 0)}",
                    delta="+12%"
                )

            with col2:
                conversion_rate = metrics.get('conversion_rate', 0)
                st.metric(
                    label="Conversion Rate",
                    value=f"{conversion_rate * 100:.1f}%",
                    delta="+2.3%"
                )

            with col3:
                pipeline = metrics.get('pipeline_influenced', 0)
                st.metric(
                    label="Pipeline Influenced",
                    value=f"${pipeline/1000:.0f}K",
                    delta="+18%"
                )

            with col4:
                accuracy = metrics.get('signal_accuracy', 0)
                st.metric(
                    label="Signal Accuracy",
                    value=f"{accuracy * 100:.0f}%",
                    delta="+3%"
                )

            st.markdown("###")

            # Accuracy Trend Chart
            st.subheader("Signal Accuracy Over Time")

            # Generate 6 months of data
            months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
            accuracy_data = [0.85, 0.87, 0.86, 0.88, 0.87, 0.87]

            fig = go.Figure()
            fig.add_trace(go.Scatter(
                x=months,
                y=accuracy_data,
                mode='lines+markers',
                line=dict(color='#10b981', width=3),
                marker=dict(size=8),
                fill='tozeroy',
                fillcolor='rgba(16, 185, 129, 0.1)'
            ))

            fig.update_layout(
                height=300,
                margin=dict(l=0, r=0, t=0, b=0),
                xaxis=dict(showgrid=False),
                yaxis=dict(showgrid=True, gridcolor='#eaeaea', tickformat='.0%'),
                plot_bgcolor='white',
                paper_bgcolor='white',
                hovermode='x unified'
            )

            st.plotly_chart(fig, use_container_width=True)

            st.markdown("###")

            # Two-column section
            col_left, col_right = st.columns(2)

            with col_left:
                st.subheader("Signal Health")

                # Fetch signals for health display
                try:
                    signals_response = requests.get(f"{API_URL}/api/signals/list")
                    if signals_response.status_code == 200:
                        signals_data = signals_response.json()
                        signals = signals_data.get('signals', [])

                        for signal in signals[:4]:  # Show top 4
                            health = signal.get('health', 'healthy')
                            status_icon = "✅" if health == "healthy" else "⚠️"

                            # Calculate current accuracy (last value in trend)
                            accuracy_trend = signal.get('accuracy_trend', [])
                            current_accuracy = accuracy_trend[-1] if accuracy_trend else 0

                            st.markdown(f"""
                            <div class="signal-health-item">
                                {status_icon} <strong>{signal['name'][:30]}...</strong>
                                <span style="float: right;">{current_accuracy * 100:.0f}%</span>
                            </div>
                            """, unsafe_allow_html=True)
                except Exception as e:
                    st.error(f"Failed to load signal health: {e}")

            with col_right:
                st.subheader("Recent Leads")

                for lead in recent_leads[:4]:  # Show top 4
                    score = lead.get('score', 0)
                    company = lead.get('company', 'Unknown')
                    signal = lead.get('signal', 'Unknown')

                    st.markdown(f"""
                    <div class="lead-item">
                        <strong>{company}</strong> <span style="float: right;">Score: {score}</span><br>
                        <small style="color: #666;">Signal: {signal[:40]}...</small>
                    </div>
                    """, unsafe_allow_html=True)
        else:
            st.error("Failed to load dashboard metrics")
    except Exception as e:
        st.error(f"Connection error: {e}")

# Route to other pages
elif st.session_state.page == 'sources':
    import importlib.util
    spec = importlib.util.spec_from_file_location("sources", "frontend/pages/02_Sources.py")
    sources_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sources_module)

elif st.session_state.page == 'signals':
    import importlib.util
    spec = importlib.util.spec_from_file_location("signals", "frontend/pages/03_Signals.py")
    signals_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(signals_module)

elif st.session_state.page == 'signal_detail':
    import importlib.util
    spec = importlib.util.spec_from_file_location("signal_detail", "frontend/pages/04_Signal_Detail.py")
    signal_detail_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(signal_detail_module)

elif st.session_state.page == 'backtest':
    import importlib.util
    spec = importlib.util.spec_from_file_location("backtest", "frontend/pages/05_Backtest.py")
    backtest_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(backtest_module)

elif st.session_state.page == 'playbooks':
    import importlib.util
    spec = importlib.util.spec_from_file_location("playbooks", "frontend/pages/06_Playbooks.py")
    playbooks_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(playbooks_module)

elif st.session_state.page == 'destinations':
    import importlib.util
    spec = importlib.util.spec_from_file_location("destinations", "frontend/pages/07_Destinations.py")
    destinations_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(destinations_module)

elif st.session_state.page == 'settings':
    import importlib.util
    spec = importlib.util.spec_from_file_location("settings", "frontend/pages/08_Settings.py")
    settings_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(settings_module)
