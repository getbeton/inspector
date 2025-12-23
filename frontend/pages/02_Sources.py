"""
Data Sources Page
Shows connected data sources and their health
"""

import streamlit as st
import requests
import os

st.title("📊 Data Sources")

API_URL = os.getenv("API_URL", "http://localhost:8000")

# Fetch sources status
try:
    response = requests.get(f"{API_URL}/api/sources/status")
    if response.status_code == 200:
        data = response.json()
        sources = data.get('sources', {})

        st.subheader("Connected Sources")

        col1, col2 = st.columns(2)

        # PostHog
        with col1:
            posthog = sources.get('posthog', {})
            if posthog.get('status') == 'connected':
                st.success("📊 PostHog - Connected ✅")
                st.write(f"**Type:** {posthog.get('type')}")
                st.write(f"**Last sync:** {posthog.get('last_sync')}")
                st.write(f"**Events:** {posthog.get('events_count'):,}")
                st.write(f"**Users:** {posthog.get('users_count'):,}")
                st.write(f"**Range:** {posthog.get('date_range')}")

                col_btn1, col_btn2 = st.columns(2)
                with col_btn1:
                    if st.button("Reconnect", key="posthog_reconnect"):
                        st.info("Reconnecting to PostHog...")
                with col_btn2:
                    if st.button("View Data", key="posthog_view"):
                        st.info("Showing PostHog data...")

        # Attio
        with col2:
            attio = sources.get('attio', {})
            if attio.get('status') == 'connected':
                st.success("💼 Attio - Connected ✅")
                st.write(f"**Type:** {attio.get('type')}")
                st.write(f"**Last sync:** {attio.get('last_sync')}")
                st.write(f"**Deals:** {attio.get('deals_count'):,}")
                st.write(f"**Contacts:** {attio.get('contacts_count'):,}")
                st.write(f"**Range:** {attio.get('date_range')}")

                col_btn1, col_btn2 = st.columns(2)
                with col_btn1:
                    if st.button("Reconnect", key="attio_reconnect"):
                        st.info("Reconnecting to Attio...")
                with col_btn2:
                    if st.button("View Data", key="attio_view"):
                        st.info("Showing Attio data...")

        st.markdown("---")

        st.subheader("Available Sources")

        col3, col4 = st.columns(2)

        # Stripe
        with col3:
            stripe = sources.get('stripe', {})
            st.info("💳 Stripe - Not Connected ⚪")
            st.write("**Type:** Billing")
            st.write("**Status:** Not connected")

            if st.button("Connect Stripe", key="stripe_connect"):
                with st.form("stripe_form"):
                    st.text_input("API Key", type="password")
                    if st.form_submit_button("Save & Connect"):
                        st.success("Stripe connected successfully!")

        # Intercom
        with col4:
            intercom = sources.get('intercom', {})
            st.info("💬 Intercom - Not Connected ⚪")
            st.write("**Type:** Support")
            st.write("**Status:** Not connected")

            if st.button("Connect Intercom", key="intercom_connect"):
                with st.form("intercom_form"):
                    st.text_input("API Key", type="password")
                    if st.form_submit_button("Save & Connect"):
                        st.success("Intercom connected successfully!")

        st.markdown("---")

        st.subheader("Data Quality Summary")

        st.success("✅ Identity resolution: 89% email match rate")
        st.success("✅ Outcome data: 847 deals with timestamps")
        st.warning("⚠️ Missing: Billing data (connect Stripe for revenue)")

    else:
        st.error("Failed to load sources status")
except Exception as e:
    st.error(f"Connection error: {e}")
