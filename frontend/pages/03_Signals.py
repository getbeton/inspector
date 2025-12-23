"""
Signals List Page
List all discovered signals with filtering and sorting
"""

import streamlit as st
import requests
import pandas as pd
import os

st.title("🎯 Discovered Signals")

API_URL = os.getenv("API_URL", "http://localhost:8000")

col_header_left, col_header_right = st.columns([3, 1])

with col_header_left:
    st.caption("Last discovery: 2 hours ago")

with col_header_right:
    if st.button("🔄 Run Discovery", type="primary"):
        with st.spinner("Running discovery..."):
            import time
            progress_bar = st.progress(0)
            for i in range(100):
                time.sleep(0.02)
                progress_bar.progress(i + 1)
            progress_bar.empty()
            st.success("Discovery complete!")
            st.rerun()

# Filters
col_filter1, col_filter2, col_filter3, col_search = st.columns([1, 1, 1, 2])

with col_filter1:
    status_filter = st.selectbox("Status", ["All", "Enabled", "Disabled"])

with col_filter2:
    lift_filter = st.selectbox("Lift", ["All", ">3x", ">2x", ">1.5x"])

with col_filter3:
    source_filter = st.selectbox("Source", ["All", "PostHog", "Attio"])

with col_search:
    search_query = st.text_input("Search signals", placeholder="Search...")

# Fetch signals
try:
    response = requests.get(f"{API_URL}/api/signals/list")
    if response.status_code == 200:
        data = response.json()
        signals = data.get('signals', [])

        # Apply filters
        filtered_signals = signals

        if status_filter != "All":
            filtered_signals = [s for s in filtered_signals if s['status'] == status_filter.lower()]

        if lift_filter != "All":
            min_lift = float(lift_filter.replace(">", "").replace("x", ""))
            filtered_signals = [s for s in filtered_signals if s['lift'] >= min_lift]

        if source_filter != "All":
            filtered_signals = [s for s in filtered_signals if s['source'] == source_filter]

        if search_query:
            filtered_signals = [
                s for s in filtered_signals
                if search_query.lower() in s['name'].lower() or search_query.lower() in s['description'].lower()
            ]

        # Display as table
        if filtered_signals:
            # Prepare data for table
            table_data = []
            for signal in filtered_signals:
                status_icon = "🟢" if signal['health'] == "healthy" else "🟡"

                table_data.append({
                    "Signal": signal['name'],
                    "Lift": f"{signal['lift']}x",
                    "Confidence": f"{signal['confidence'] * 100:.0f}%",
                    "Leads/mo": signal['leads_per_month'],
                    "Est ARR": f"${signal['estimated_arr']/1000:.0f}K",
                    "Status": status_icon,
                    "ID": signal['id']
                })

            df = pd.DataFrame(table_data)

            # Configure table display
            st.dataframe(
                df[["Signal", "Lift", "Confidence", "Leads/mo", "Est ARR", "Status"]],
                use_container_width=True,
                hide_index=True,
                height=400
            )

            # Summary
            enabled_count = len([s for s in filtered_signals if s['status'] == 'enabled'])
            degrading_count = len([s for s in filtered_signals if s['health'] == 'degrading'])

            st.caption(f"**Summary:** {len(filtered_signals)} signals discovered | {enabled_count} enabled | {degrading_count} degrading")

            # Signal detail modal/expander
            st.markdown("---")
            st.subheader("Signal Details")

            selected_signal = st.selectbox(
                "Select a signal to view details",
                options=[(s['id'], s['name']) for s in filtered_signals],
                format_func=lambda x: x[1]
            )

            if selected_signal:
                signal_id = selected_signal[0]

                if st.button("View Full Details", type="primary"):
                    st.session_state.selected_signal_id = signal_id
                    st.session_state.page = 'signal_detail'
                    st.rerun()

        else:
            st.info("No signals match the current filters.")

    else:
        st.error("Failed to load signals")
except Exception as e:
    st.error(f"Connection error: {e}")
