"""
Playbooks Page
Configure rules that combine signals and trigger actions
"""

import streamlit as st
import requests
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

# Mock playbooks data
MOCK_PLAYBOOKS = [
    {
        "id": "pb_001",
        "name": "High-Intent PQL Alert",
        "status": "active",
        "conditions": [
            {"signal_id": "sig_001", "signal_name": "Onboarding completed within 3 days"},
            {"signal_id": "sig_002", "signal_name": "Invited 2+ teammates", "operator": "AND"}
        ],
        "actions": ["slack_alert", "attio_update"],
        "leads_per_month": 35,
        "conversion_rate": 0.152
    },
    {
        "id": "pb_002",
        "name": "Enterprise Expansion Signal",
        "status": "active",
        "conditions": [
            {"signal_id": "sig_004", "signal_name": "API key created"},
            {"signal_id": "sig_003", "signal_name": "Pricing page visited 2+ times", "operator": "AND"}
        ],
        "actions": ["slack_alert", "attio_update", "email_sequence"],
        "leads_per_month": 22,
        "conversion_rate": 0.182
    },
    {
        "id": "pb_003",
        "name": "Re-engagement Campaign",
        "status": "paused",
        "conditions": [
            {"signal_id": "sig_005", "signal_name": "Dashboard created"}
        ],
        "actions": ["email_sequence"],
        "leads_per_month": 45,
        "conversion_rate": 0.089
    }
]

# Header with mock mode toggle
col_title, col_toggle = st.columns([0.85, 0.15])
with col_title:
    st.title("Playbooks")
with col_toggle:
    render_data_mode_toggle(location="top")

if is_mock_mode():
    show_mock_data_banner()

# New Playbook button
col_header_left, col_header_right = st.columns([3, 1])
with col_header_right:
    if st.button("+ New Playbook", type="primary"):
        st.session_state.creating_playbook = True

st.markdown("---")

# Fetch playbooks
if is_mock_mode():
    playbooks = MOCK_PLAYBOOKS
else:
    try:
        response = requests.get(f"{API_URL}/api/playbooks/list")
        if response.status_code == 200:
            data = response.json()
            playbooks = data.get('playbooks', [])
        else:
            playbooks = MOCK_PLAYBOOKS
    except Exception:
        playbooks = MOCK_PLAYBOOKS

# Tabs for Active and Paused playbooks
tab_active, tab_paused = st.tabs(["Active", "Paused"])

with tab_active:
    active_playbooks = [p for p in playbooks if p['status'] == 'active']

    if not active_playbooks:
        st.info("No active playbooks. Create one to get started.")
    else:
        for playbook in active_playbooks:
            with st.container():
                # Header with inline toggle
                col_name, col_toggle_pb = st.columns([0.8, 0.2])
                with col_name:
                    st.markdown(f"### {playbook['name']}")
                with col_toggle_pb:
                    is_enabled = st.toggle("Active", value=True, key=f"toggle_{playbook['id']}")
                    if not is_enabled:
                        st.toast(f"Paused {playbook['name']}")

                # Build condition display
                conditions_text = []
                for condition in playbook.get('conditions', []):
                    signal_name = condition.get('signal_name', condition.get('signal_id', 'Unknown'))
                    operator = condition.get('operator', '')
                    if operator:
                        conditions_text.append(f"{operator} {signal_name}")
                    else:
                        conditions_text.append(signal_name)

                st.write(f"**IF:** {' '.join(conditions_text)}")

                # Actions
                actions_display = []
                for action in playbook.get('actions', []):
                    if action == 'slack_alert':
                        actions_display.append("Slack alert")
                    elif action == 'attio_update':
                        actions_display.append("Attio update")
                    elif action == 'email_sequence':
                        actions_display.append("Email sequence")

                st.write(f"**THEN:** {' + '.join(actions_display)}")

                # Metrics
                col1, col2, col3 = st.columns(3)
                with col1:
                    st.metric("Leads/month", playbook['leads_per_month'])
                with col2:
                    st.metric("Conversion", f"{playbook['conversion_rate'] * 100:.1f}%")
                with col3:
                    est_arr = playbook['leads_per_month'] * playbook['conversion_rate'] * 12 * 27000
                    st.metric("Est ARR", f"${est_arr/1000:.0f}K")

                # Action buttons
                col_btn1, col_btn2 = st.columns(2)
                with col_btn1:
                    if st.button("Edit", key=f"edit_{playbook['id']}", use_container_width=True):
                        st.info("Editing playbook...")
                with col_btn2:
                    if st.button("Delete", key=f"delete_{playbook['id']}", use_container_width=True):
                        st.warning("Playbook deleted")

                st.markdown("---")

with tab_paused:
    paused_playbooks = [p for p in playbooks if p['status'] == 'paused']

    if not paused_playbooks:
        st.info("No paused playbooks.")
    else:
        for playbook in paused_playbooks:
            with st.container():
                # Header with inline toggle
                col_name, col_toggle_pb = st.columns([0.8, 0.2])
                with col_name:
                    st.markdown(f"### {playbook['name']}")
                with col_toggle_pb:
                    is_enabled = st.toggle("Active", value=False, key=f"toggle_{playbook['id']}_paused")
                    if is_enabled:
                        st.toast(f"Activated {playbook['name']}")

                # Build condition display
                conditions_text = []
                for condition in playbook.get('conditions', []):
                    signal_name = condition.get('signal_name', condition.get('signal_id', 'Unknown'))
                    operator = condition.get('operator', '')
                    if operator:
                        conditions_text.append(f"{operator} {signal_name}")
                    else:
                        conditions_text.append(signal_name)

                st.write(f"**IF:** {' '.join(conditions_text)}")

                # Actions
                actions_display = []
                for action in playbook.get('actions', []):
                    if action == 'slack_alert':
                        actions_display.append("Slack")
                    elif action == 'attio_update':
                        actions_display.append("Attio")
                    elif action == 'email_sequence':
                        actions_display.append("Email sequence")

                st.write(f"**THEN:** {' + '.join(actions_display)}")

                # Action buttons
                col_btn1, col_btn2 = st.columns(2)
                with col_btn1:
                    if st.button("Edit", key=f"edit_{playbook['id']}_paused", use_container_width=True):
                        st.info("Editing playbook...")
                with col_btn2:
                    if st.button("Delete", key=f"delete_{playbook['id']}_paused", use_container_width=True):
                        st.warning("Playbook deleted")

                st.markdown("---")

# Create Playbook Modal
if st.session_state.get('creating_playbook', False):
    st.markdown("---")
    st.markdown("### Create Playbook")

    with st.form("create_playbook_form"):
        playbook_name = st.text_input("Name", placeholder="e.g., High-Intent PQL Alert")

        st.write("**When these conditions are met:**")

        # Get signals for dropdown
        if is_mock_mode():
            signals = get_mock_signals()
        else:
            try:
                signals_response = requests.get(f"{API_URL}/api/signals/list")
                if signals_response.status_code == 200:
                    signals = signals_response.json().get('signals', [])
                else:
                    signals = get_mock_signals()
            except:
                signals = get_mock_signals()

        signal_options = [(s['id'], s['name']) for s in signals]

        if signal_options:
            signal_1 = st.selectbox(
                "Signal 1",
                options=signal_options,
                format_func=lambda x: x[1]
            )

            operator_1 = st.selectbox("Operator", ["AND", "OR"], key="op_cond_1")

            signal_2 = st.selectbox(
                "Signal 2",
                options=signal_options,
                format_func=lambda x: x[1],
                key="sig_2"
            )

        st.write("")
        st.write("**Perform these actions:**")

        action_slack = st.checkbox("Send Slack alert to #sales-alerts")
        action_attio = st.checkbox("Update Attio fields", value=True)
        action_email = st.checkbox("Trigger email sequence")
        action_webhook = st.checkbox("Send webhook to URL")

        if action_webhook:
            webhook_url = st.text_input("Webhook URL")

        st.info("**Preview:** ~35 leads/month would trigger this playbook\n\nHistorical conversion: 15.2%")

        col_btn1, col_btn2 = st.columns(2)
        with col_btn1:
            cancel = st.form_submit_button("Cancel", use_container_width=True)
        with col_btn2:
            save = st.form_submit_button("Save Playbook", type="primary", use_container_width=True)

        if cancel:
            st.session_state.creating_playbook = False
            st.rerun()

        if save:
            st.success("Playbook created successfully!")
            st.session_state.creating_playbook = False
            st.rerun()
