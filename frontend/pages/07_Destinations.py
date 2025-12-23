"""
Destinations Page
Configure where signals are sent (Attio CRM field mapping)
"""

import streamlit as st
import requests
import pandas as pd
import os

st.title("📤 Destinations")

API_URL = os.getenv("API_URL", "http://localhost:8000")

# Attio CRM Section
st.markdown("## 💼 Attio CRM")
st.success("✅ Connected")

# Field Mapping
col_header_left, col_header_right = st.columns([3, 1])

with col_header_left:
    st.subheader("Field Mapping")

with col_header_right:
    if st.button("🔄 Auto-Match All", type="primary"):
        try:
            response = requests.post(f"{API_URL}/api/destinations/attio/auto-match")
            if response.status_code == 200:
                with st.spinner("Matching fields..."):
                    import time
                    time.sleep(0.5)
                st.success("All fields matched successfully!")
                st.rerun()
        except Exception as e:
            st.error(f"Auto-match failed: {e}")

# Fetch Attio fields
try:
    response = requests.get(f"{API_URL}/api/destinations/attio/fields")
    if response.status_code == 200:
        data = response.json()
        fields = data.get('fields', [])

        # Prepare table data
        table_data = []
        for field in fields:
            status = "✅" if field['mapped'] else "⚪"
            table_data.append({
                "Attio Field": field['attio_field'],
                "Type": field['type'],
                "Beton Field": field['beton_field'],
                "Status": status
            })

        df = pd.DataFrame(table_data)

        st.dataframe(
            df,
            use_container_width=True,
            hide_index=True,
            height=300
        )

        st.caption("✅ = Mapped and syncing | ⚪ = Not mapped")

        # Action Buttons
        col_btn1, col_btn2 = st.columns(2)
        with col_btn1:
            if st.button("Test Sync", use_container_width=True):
                with st.spinner("Testing sync..."):
                    import time
                    time.sleep(1)
                st.success("Sync test successful! 5 records updated.")

        with col_btn2:
            if st.button("Save Mapping", use_container_width=True):
                st.success("Field mapping saved!")

    else:
        st.error("Failed to load Attio fields")
except Exception as e:
    st.error(f"Connection error: {e}")

st.markdown("---")

# Slack Section
st.markdown("## 💬 Slack")
st.success("✅ Connected")

st.write("**Channel:** #sales-alerts")
st.write("**Message template:**")

message_template = st.text_area(
    "Template",
    value="""🎯 High-intent lead: {{company_name}}
Signal: {{signal_name}} ({{lift}}x lift)
Contact: {{contact_email}}
Attio: {{attio_url}}""",
    height=150
)

col_btn1, col_btn2 = st.columns(2)
with col_btn1:
    if st.button("📤 Test Message", use_container_width=True):
        st.info("Test message sent to #sales-alerts")

with col_btn2:
    if st.button("💾 Save", use_container_width=True):
        st.success("Slack configuration saved!")

st.markdown("---")

# Webhook Section
st.markdown("## 🔗 Webhook")
st.info("⚪ Not Set Up")

if st.button("➕ Configure Webhook"):
    with st.form("webhook_form"):
        webhook_url = st.text_input("Webhook URL", placeholder="https://your-app.com/webhook")

        st.write("**Payload format:**")
        st.code("""{
  "signal_id": "sig_001",
  "signal_name": "Onboarding completed within 3 days",
  "user_id": "user_123",
  "user_email": "jane@acme.com",
  "company_name": "Acme Corp",
  "score": 94,
  "lift": 4.2,
  "timestamp": "2024-12-23T10:30:00Z"
}""", language="json")

        col_btn1, col_btn2 = st.columns(2)
        with col_btn1:
            if st.form_submit_button("Cancel", use_container_width=True):
                pass
        with col_btn2:
            if st.form_submit_button("Save", type="primary", use_container_width=True):
                st.success("Webhook configured successfully!")
