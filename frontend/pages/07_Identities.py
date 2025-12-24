"""
Identities Page
Shows resolved user identities with table view, filters, and descriptive stats
"""

import streamlit as st
import pandas as pd
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.data_handler import is_mock_mode
from utils.ui_components import (
    render_page_header,
    apply_compact_button_styles,
    apply_global_styles
)

# Page config - emoji only in page_icon, NOT in title
st.set_page_config(
    page_title="Identities | Beton Inspector",
    page_icon="👤",
    layout="wide"
)

# Apply styles
apply_compact_button_styles()
apply_global_styles()

# Mock identities data
MOCK_IDENTITIES = [
    {"email": "jane@acme.com", "company": "Acme Corp", "user_id": "usr_001", "status": "resolved", "sources": "PostHog, Attio", "last_seen": "2 hours ago", "signals_count": 3},
    {"email": "john@techstart.io", "company": "TechStart Inc", "user_id": "usr_002", "status": "resolved", "sources": "PostHog", "last_seen": "5 hours ago", "signals_count": 2},
    {"email": "sarah@bigco.com", "company": "BigCo Ltd", "user_id": "usr_003", "status": "resolved", "sources": "PostHog, Attio, Stripe", "last_seen": "1 day ago", "signals_count": 4},
    {"email": "mike@startup.io", "company": "Startup.io", "user_id": "usr_004", "status": "partial", "sources": "PostHog", "last_seen": "3 days ago", "signals_count": 1},
    {"email": "lisa@enterprise.com", "company": "Enterprise Solutions", "user_id": "usr_005", "status": "resolved", "sources": "PostHog, Attio", "last_seen": "6 hours ago", "signals_count": 5},
    {"email": "alex@saasify.com", "company": "Saasify", "user_id": "usr_006", "status": "resolved", "sources": "PostHog, Stripe", "last_seen": "12 hours ago", "signals_count": 2},
    {"email": "emma@growth.co", "company": "Growth Co", "user_id": "usr_007", "status": "partial", "sources": "Attio", "last_seen": "2 days ago", "signals_count": 0},
    {"email": "david@scale.ai", "company": "Scale AI", "user_id": "usr_008", "status": "resolved", "sources": "PostHog, Attio", "last_seen": "4 hours ago", "signals_count": 3},
    {"email": "nina@productlab.io", "company": "ProductLab", "user_id": "usr_009", "status": "unknown", "sources": "PostHog", "last_seen": "1 week ago", "signals_count": 0},
    {"email": "tom@cloudops.net", "company": "CloudOps", "user_id": "usr_010", "status": "resolved", "sources": "PostHog, Attio, Stripe", "last_seen": "8 hours ago", "signals_count": 4},
    {"email": "amy@dataflow.io", "company": "DataFlow Inc", "user_id": "usr_011", "status": "resolved", "sources": "PostHog, Attio", "last_seen": "1 hour ago", "signals_count": 2},
    {"email": "chris@devtools.com", "company": "DevTools", "user_id": "usr_012", "status": "partial", "sources": "PostHog", "last_seen": "5 days ago", "signals_count": 1},
]

# === PAGE HEADER ===
render_page_header("User Identities", show_data_toggle=True)

st.markdown("---")

# Filters
col_f1, col_f2, col_f3, col_f4 = st.columns(4)

with col_f1:
    status_filter = st.selectbox("Resolution Status", ["All", "Resolved", "Partial", "Unknown"], key="identity_status")

with col_f2:
    source_filter = st.selectbox("Source", ["All", "PostHog", "Attio", "Stripe"], key="identity_source")

with col_f3:
    signals_filter = st.selectbox("Has Signals", ["All", "Yes", "No"], key="identity_signals")

with col_f4:
    search = st.text_input("Search by email or company", key="identity_search", label_visibility="collapsed", placeholder="Search...")

st.markdown("---")

# Stats summary
col_s1, col_s2, col_s3, col_s4 = st.columns(4)

total_identities = len(MOCK_IDENTITIES)
resolved = sum(1 for i in MOCK_IDENTITIES if i['status'] == 'resolved')
partial = sum(1 for i in MOCK_IDENTITIES if i['status'] == 'partial')
with_signals = sum(1 for i in MOCK_IDENTITIES if i['signals_count'] > 0)

with col_s1:
    st.metric("Total Identities", total_identities)
with col_s2:
    st.metric("Resolution Rate", f"{resolved/total_identities*100:.0f}%")
with col_s3:
    st.metric("Email Match Rate", "89%")
with col_s4:
    st.metric("With Signals", f"{with_signals/total_identities*100:.0f}%")

st.markdown("---")

# Apply filters
filtered_identities = MOCK_IDENTITIES

if status_filter != "All":
    filtered_identities = [i for i in filtered_identities if i['status'].lower() == status_filter.lower()]

if source_filter != "All":
    filtered_identities = [i for i in filtered_identities if source_filter in i['sources']]

if signals_filter == "Yes":
    filtered_identities = [i for i in filtered_identities if i['signals_count'] > 0]
elif signals_filter == "No":
    filtered_identities = [i for i in filtered_identities if i['signals_count'] == 0]

if search:
    filtered_identities = [
        i for i in filtered_identities
        if search.lower() in i['email'].lower() or search.lower() in i['company'].lower()
    ]

# Display table
if filtered_identities:
    table_data = []
    for identity in filtered_identities:
        status_display = {
            "resolved": "Resolved",
            "partial": "Partial",
            "unknown": "Unknown"
        }.get(identity['status'], "Unknown")

        table_data.append({
            "Email": identity['email'],
            "Company": identity['company'],
            "User ID": identity['user_id'],
            "Status": status_display,
            "Sources": identity['sources'],
            "Signals": identity['signals_count'],
            "Last Seen": identity['last_seen']
        })

    df = pd.DataFrame(table_data)

    st.dataframe(
        df,
        use_container_width=True,
        hide_index=True,
        height=450,
        column_config={
            "Email": st.column_config.TextColumn("Email", width="medium"),
            "Company": st.column_config.TextColumn("Company", width="medium"),
            "User ID": st.column_config.TextColumn("User ID", width="small"),
            "Status": st.column_config.TextColumn("Status", width="small"),
            "Sources": st.column_config.TextColumn("Sources", width="medium"),
            "Signals": st.column_config.NumberColumn("Signals", width="small"),
            "Last Seen": st.column_config.TextColumn("Last Seen", width="small")
        }
    )

    st.caption(f"Showing {len(filtered_identities)} of {total_identities} identities")

else:
    st.info("No identities match your filters.")

st.markdown("---")

# Export and actions
col_export, col_sync, col_spacer = st.columns([1, 1, 2])

with col_export:
    if st.button("Export to CSV", use_container_width=True):
        st.success("Identities exported to CSV!")

with col_sync:
    if st.button("Sync Identities", use_container_width=True):
        with st.spinner("Syncing identities..."):
            import time
            time.sleep(1)
        st.success("Identity sync complete!")

st.markdown("---")

# Navigation
col_back, col_signals = st.columns(2)

with col_back:
    if st.button("Back to Settings", use_container_width=True):
        st.switch_page("pages/06_Settings.py")

with col_signals:
    if st.button("View Signals", use_container_width=True):
        st.switch_page("pages/01_Signals.py")
