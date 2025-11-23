import streamlit as st
import requests
import pandas as pd
import altair as alt
import os
from datetime import datetime, timedelta
from st_aggrid import AgGrid, GridOptionsBuilder, JsCode

# Page config
st.set_page_config(
    page_title="Dashboard | Beton Inspector",
    page_icon="📊",
    layout="wide"
)

# API URL
API_URL = os.getenv("API_URL", "http://localhost:8000")

# --- Sidebar Controls ---
st.sidebar.title("Dashboard Controls")

# Date Range
date_range = st.sidebar.selectbox(
    "Date Range",
    ["Last 30 Days", "Last Quarter", "Year to Date", "All Time"]
)

# Segment Filter
segment = st.sidebar.selectbox(
    "Segment",
    ["All", "Enterprise", "SMB", "ICP Match"]
)

# Mock Data Toggle
use_mock_data = st.sidebar.checkbox("Use Mock Data", value=False)

# Refresh Button
if st.sidebar.button("Refresh Data"):
    st.experimental_rerun()

st.title("📊 Command Center")

# --- Data Fetching ---
@st.cache_data(ttl=60)
def fetch_dashboard_data(use_mock, date_range_val, segment_val):
    if use_mock:
        # Return hardcoded mock data
        return {
            "north_star": {
                "expansion_pipeline": 125000.0,
                "total_arr": 1250000.0,
                "nrr": 115.5
            },
            "velocity": {
                "new_leads": {"current": 45, "previous": 30, "delta": 50.0},
                "active_signups": {"current": 28, "previous": 20, "delta": 40.0},
                "paying_customers": {"current": 12, "previous": 8, "delta": 50.0},
                "expanded_customers": {"current": 5, "previous": 2, "delta": 150.0}
            },
            "momentum": [
                {"account_name": "Acme Corp", "health_score": 85, "arr": 50000, "momentum": 12.5, "top_signal": "Usage Spike", "last_active": "2023-10-25T10:00:00"},
                {"account_name": "Globex", "health_score": 45, "arr": 12000, "momentum": -5.0, "top_signal": "Usage Drop", "last_active": "2023-10-20T14:30:00"},
                {"account_name": "Soylent Corp", "health_score": 92, "arr": 85000, "momentum": 8.0, "top_signal": "New User", "last_active": "2023-10-26T09:15:00"},
            ]
        }
    
    try:
        # Prepare filters
        filters = {
            "date_range": date_range_val,
            "segment": segment_val
        }
        response = requests.post(f"{API_URL}/api/dashboard/metrics", json=filters)
        if response.status_code == 200:
            return response.json()
        else:
            st.error(f"Failed to fetch data: {response.status_code}")
            return None
    except Exception as e:
        st.error(f"Connection error: {e}")
        return None

data = fetch_dashboard_data(use_mock_data, date_range, segment)

if data:
    # --- North Star Metrics ---
    ns = data.get("north_star", {})
    col1, col2, col3 = st.columns(3)
    
    with col1:
        st.metric(
            label="Expansion Pipeline",
            value=f"${ns.get('expansion_pipeline', 0):,.0f}",
            delta="12% vs last month" # Placeholder for now, backend needs to send delta
        )
    with col2:
        st.metric(
            label="Net Revenue Retention (NRR)",
            value=f"{ns.get('nrr', 0):.1f}%",
            delta="2.5%"
        )
    with col3:
        st.metric(
            label="Total ARR",
            value=f"${ns.get('total_arr', 0):,.0f}",
            delta="8% vs last month"
        )

    st.markdown("---")

    # --- Growth Velocity ---
    st.subheader("🚀 Growth Velocity")
    vel = data.get("velocity", {})
    
    v_col1, v_col2, v_col3, v_col4 = st.columns(4)
    
    metrics = [
        ("New Leads", vel.get("new_leads", {})),
        ("Active Signups", vel.get("active_signups", {})),
        ("Paying Customers", vel.get("paying_customers", {})),
        ("Expanded Customers", vel.get("expanded_customers", {}))
    ]
    
    for col, (label, metric) in zip([v_col1, v_col2, v_col3, v_col4], metrics):
        with col:
            current = metric.get("current", 0)
            delta = metric.get("delta", 0)
            st.metric(label, value=current, delta=f"{delta:.1f}%")

    # --- Charts ---
    st.markdown("### Trends")
    c_col1, c_col2 = st.columns(2)
    
    # Mock chart data for now (since backend doesn't return time series yet)
    chart_data = pd.DataFrame({
        'date': pd.date_range(start='1/1/2023', periods=30),
        'leads': [x + (x*0.1) for x in range(30)],
        'revenue': [1000 + (x*100) for x in range(30)]
    })
    
    with c_col1:
        st.markdown("**New Leads Trend**")
        chart = alt.Chart(chart_data).mark_line(color='#4F46E5').encode(
            x='date',
            y='leads',
            tooltip=['date', 'leads']
        ).interactive()
        st.altair_chart(chart, use_container_width=True)
        
    with c_col2:
        st.markdown("**Revenue Growth**")
        chart = alt.Chart(chart_data).mark_area(
            color=alt.Gradient(
                gradient='linear',
                stops=[alt.GradientStop(color='white', offset=0),
                       alt.GradientStop(color='#4F46E5', offset=1)],
                x1=1, x2=1, y1=1, y2=0
            )
        ).encode(
            x='date',
            y='revenue',
            tooltip=['date', 'revenue']
        ).interactive()
        st.altair_chart(chart, use_container_width=True)

    st.markdown("---")

    # --- Momentum Table ---
    st.subheader("🔥 Momentum Table")
    
    momentum_data = data.get("momentum", [])
    if momentum_data:
        df = pd.DataFrame(momentum_data)
        
        # Configure AgGrid
        gb = GridOptionsBuilder.from_dataframe(df)
        gb.configure_pagination(paginationAutoPageSize=True)
        gb.configure_side_bar()
        gb.configure_selection('single', use_checkbox=True)
        
        # Custom Renderers
        # Health Score Color
        health_cell_js = JsCode("""
        function(params) {
            if (params.value >= 70) {
                return '<span style="color:green; font-weight:bold;">●</span> ' + params.value;
            } else if (params.value >= 30) {
                return '<span style="color:orange; font-weight:bold;">●</span> ' + params.value;
            } else {
                return '<span style="color:red; font-weight:bold;">●</span> ' + params.value;
            }
        }
        """)
        gb.configure_column("health_score", cellRenderer=health_cell_js)
        
        # Top Signal Badge
        signal_cell_js = JsCode("""
        function(params) {
            return '<span style="background-color:#EEF2FF; color:#4F46E5; padding:2px 8px; border-radius:12px; font-size:12px;">' + params.value + '</span>';
        }
        """)
        gb.configure_column("top_signal", cellRenderer=signal_cell_js)
        
        # Currency Formatting
        gb.configure_column("arr", type=["numericColumn", "numberColumnFilter", "customCurrencyFormat"], custom_currency_symbol="$")

        gridOptions = gb.build()
        
        AgGrid(
            df,
            gridOptions=gridOptions,
            allow_unsafe_jscode=True,
            enable_enterprise_modules=False
        )
    else:
        st.info("No accounts found matching filters.")

else:
    st.warning("No data available. Check backend connection.")
