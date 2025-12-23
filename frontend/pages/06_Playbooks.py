"""
Playbooks Page
Configure rules that combine signals and trigger actions
"""

import streamlit as st
import requests
import os

st.title("📋 Playbooks")

API_URL = os.getenv("API_URL", "http://localhost:8000")

col_header_left, col_header_right = st.columns([3, 1])

with col_header_right:
    if st.button("➕ New Playbook", type="primary"):
        st.session_state.creating_playbook = True

# Fetch playbooks
try:
    response = requests.get(f"{API_URL}/api/playbooks/list")
    if response.status_code == 200:
        data = response.json()
        playbooks = data.get('playbooks', [])

        # Active Playbooks
        st.subheader("Active Playbooks")

        active_playbooks = [p for p in playbooks if p['status'] == 'active']

        for playbook in active_playbooks:
            with st.container():
                st.markdown(f"### {playbook['name']} 🟢 Active")

                # Build condition display
                conditions_text = []
                for i, condition in enumerate(playbook['conditions']):
                    signal_id = condition['signal_id']
                    operator = condition.get('operator', '')

                    # Fetch signal name
                    try:
                        sig_response = requests.get(f"{API_URL}/api/signals/{signal_id}")
                        if sig_response.status_code == 200:
                            signal_name = sig_response.json()['signal']['name']
                            conditions_text.append(signal_name)
                            if operator:
                                conditions_text.append(operator)
                    except:
                        pass

                st.write(f"**IF:** {' '.join(conditions_text)}")

                # Actions
                actions_display = []
                for action in playbook['actions']:
                    if action == 'slack_alert':
                        actions_display.append("Slack alert")
                    elif action == 'attio_update':
                        actions_display.append("Attio update")
                    elif action == 'email_sequence':
                        actions_display.append("Email sequence")

                st.write(f"**THEN:** {' + '.join(actions_display)}")

                st.write("")

                # Metrics
                col1, col2, col3 = st.columns(3)
                with col1:
                    st.metric("Leads/month", playbook['leads_per_month'])
                with col2:
                    st.metric("Conversion", f"{playbook['conversion_rate'] * 100:.1f}%")
                with col3:
                    est_arr = playbook['leads_per_month'] * playbook['conversion_rate'] * 12 * 27000
                    st.metric("Est ARR", f"${est_arr/1000:.0f}K")

                # Buttons
                col_btn1, col_btn2, col_btn3 = st.columns(3)
                with col_btn1:
                    if st.button("Edit", key=f"edit_{playbook['id']}"):
                        st.info("Editing playbook...")
                with col_btn2:
                    if st.button("Pause", key=f"pause_{playbook['id']}"):
                        st.success("Playbook paused")
                with col_btn3:
                    if st.button("Delete", key=f"delete_{playbook['id']}"):
                        st.warning("Playbook deleted")

                st.markdown("---")

        # Paused Playbooks
        st.subheader("Paused Playbooks")

        paused_playbooks = [p for p in playbooks if p['status'] == 'paused']

        for playbook in paused_playbooks:
            with st.container():
                st.markdown(f"### {playbook['name']} ⸸ Paused")

                # Build condition display
                conditions_text = []
                for condition in playbook['conditions']:
                    signal_id = condition['signal_id']
                    operator = condition.get('operator', '')

                    try:
                        sig_response = requests.get(f"{API_URL}/api/signals/{signal_id}")
                        if sig_response.status_code == 200:
                            signal_name = sig_response.json()['signal']['name']
                            conditions_text.append(signal_name)
                            if operator:
                                conditions_text.append(operator)
                    except:
                        pass

                st.write(f"**IF:** {' '.join(conditions_text)}")

                # Actions
                actions_display = []
                for action in playbook['actions']:
                    if action == 'slack_alert':
                        actions_display.append("Slack")
                    elif action == 'attio_update':
                        actions_display.append("Attio")
                    elif action == 'email_sequence':
                        actions_display.append("Email sequence")

                st.write(f"**THEN:** {' + '.join(actions_display)}")

                # Buttons
                col_btn1, col_btn2, col_btn3 = st.columns(3)
                with col_btn1:
                    if st.button("Edit", key=f"edit_{playbook['id']}_paused"):
                        st.info("Editing playbook...")
                with col_btn2:
                    if st.button("Activate", key=f"activate_{playbook['id']}"):
                        st.success("Playbook activated")
                with col_btn3:
                    if st.button("Delete", key=f"delete_{playbook['id']}_paused"):
                        st.warning("Playbook deleted")

                st.markdown("---")

    else:
        st.error("Failed to load playbooks")
except Exception as e:
    st.error(f"Connection error: {e}")

# Create Playbook Modal
if st.session_state.get('creating_playbook', False):
    st.markdown("---")
    st.subheader("Create Playbook")

    with st.form("create_playbook_form"):
        playbook_name = st.text_input("Name", placeholder="e.g., High-Intent PQL Alert")

        st.write("**When these conditions are met:**")

        # Fetch signals for dropdown
        try:
            signals_response = requests.get(f"{API_URL}/api/signals/list")
            if signals_response.status_code == 200:
                signals = signals_response.json().get('signals', [])
                signal_options = [(s['id'], s['name']) for s in signals]
            else:
                signal_options = []
        except:
            signal_options = []

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
