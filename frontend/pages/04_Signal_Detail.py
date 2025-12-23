"""
Signal Detail Page
Shows full statistical proof for one signal with backtest results
"""

import streamlit as st
import requests
import plotly.graph_objects as go
import os

st.title("Signal Detail")

API_URL = os.getenv("API_URL", "http://localhost:8000")

# Back button
if st.button("← Back to Signals"):
    st.session_state.page = 'signals'
    st.rerun()

# Get selected signal ID from session state
signal_id = st.session_state.get('selected_signal_id')

if not signal_id:
    st.warning("No signal selected. Please select a signal from the Signals page.")
    st.stop()

# Fetch signal details
try:
    response = requests.get(f"{API_URL}/api/signals/{signal_id}")
    if response.status_code == 200:
        data = response.json()
        signal = data.get('signal', {})

        # Header
        status = "🟢 Healthy" if signal.get('health') == 'healthy' else "🟡 Degrading"
        st.markdown(f"## {signal['name']}")
        st.caption(status)

        st.markdown("---")

        # Definition Section
        st.subheader("📝 DEFINITION")

        with st.container():
            st.write(signal['description'])
            st.write("")
            st.write(f"**Source:** {signal['source']}")
            st.write(f"**Event:** `{signal['event']}`")
            st.write(f"**Condition:** `{signal['condition']}`")

        st.markdown("---")

        # Backtest Results Section
        st.subheader("📊 BACKTEST RESULTS")

        col1, col2 = st.columns(2)

        with col1:
            st.markdown("#### With Signal")
            st.metric("Users", f"{signal['sample_with']:,}")
            st.metric("Converted", f"{int(signal['sample_with'] * signal['conversion_with']):,}")
            st.metric("Rate", f"{signal['conversion_with'] * 100:.1f}%")

        with col2:
            st.markdown("#### Without Signal")
            st.metric("Users", f"{signal['sample_without']:,}")
            st.metric("Converted", f"{int(signal['sample_without'] * signal['conversion_without']):,}")
            st.metric("Rate", f"{signal['conversion_without'] * 100:.1f}%")

        st.markdown("###")

        # Statistical metrics
        st.info(f"""
**Lift:** {signal['lift']}x
**95% Confidence Interval:** {signal['ci_lower']}x - {signal['ci_upper']}x
**p-value:** < {signal['p_value']}
**Statistical confidence:** {signal['confidence'] * 100:.1f}%
        """)

        st.markdown("---")

        # Revenue Projection Section
        st.subheader("💰 REVENUE PROJECTION")

        estimated_arr = signal.get('estimated_arr', 0)
        leads_per_month = signal['leads_per_month']

        # Calculate expected conversions
        baseline_conversion = 0.034
        signal_conversion = signal['conversion_with']
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
        st.subheader("📈 HISTORICAL ACCURACY")

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
            button_label = "✓ Disable" if current_status == 'enabled' else "✓ Enable"
            if st.button(button_label, use_container_width=True):
                st.success(f"Signal {'disabled' if current_status == 'enabled' else 'enabled'}!")

        with col_btn2:
            if st.button("Add to Rule", use_container_width=True):
                st.session_state.page = 'playbooks'
                st.rerun()

        with col_btn3:
            if st.button("Export Users", use_container_width=True):
                st.success("Exporting users matching this signal...")

    else:
        st.error("Failed to load signal details")
except Exception as e:
    st.error(f"Connection error: {e}")
