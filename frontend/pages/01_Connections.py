import streamlit as st
import requests
import os

# Page config
st.set_page_config(
    page_title="Connections | Beton Inspector",
    page_icon="🔌",
    layout="wide"
)

st.title("🔌 Connections")
st.markdown("Manage your integrations with external data sources.")

# API URL
API_URL = os.getenv("API_URL", "http://localhost:8000")

# Session state for keys (in a real app, these would be in DB/Secrets Manager)
if "posthog_key" not in st.session_state:
    st.session_state.posthog_key = ""
if "posthog_project" not in st.session_state:
    st.session_state.posthog_project = ""
if "stripe_key" not in st.session_state:
    st.session_state.stripe_key = ""
if "apollo_key" not in st.session_state:
    st.session_state.apollo_key = ""

# Tabs for integrations
tab1, tab2, tab3 = st.tabs(["PostHog", "Stripe", "Apollo"])

def test_connection(integration_name):
    """Call backend to test connection"""
    try:
        # In a real scenario, we'd pass the keys in the request if they aren't saved on backend yet
        # For now, we assume backend has env vars or we are mocking
        response = requests.post(f"{API_URL}/api/integrations/test")
        if response.status_code == 200:
            data = response.json()
            result = data.get(integration_name, {})
            if result.get("connected"):
                st.success(f"✅ Connected: {result.get('message')}")
            else:
                st.error(f"❌ Connection Failed: {result.get('message')}")
        else:
            st.error(f"API Error: {response.status_code}")
    except Exception as e:
        st.error(f"Request Failed: {str(e)}")

with tab1:
    st.header("PostHog")
    st.markdown("Connect your product analytics.")
    
    col1, col2 = st.columns(2)
    with col1:
        ph_key = st.text_input("API Key", value=st.session_state.posthog_key, type="password")
        ph_proj = st.text_input("Project ID", value=st.session_state.posthog_project)
        
        if st.button("Save PostHog Keys"):
            st.session_state.posthog_key = ph_key
            st.session_state.posthog_project = ph_proj
            st.success("Keys saved to session state!")
            
    with col2:
        st.info("Status: " + ("Configured" if st.session_state.posthog_key else "Not Configured"))
        if st.button("Test PostHog Connection"):
            test_connection("posthog")

with tab2:
    st.header("Stripe")
    st.markdown("Connect your billing data.")
    
    col1, col2 = st.columns(2)
    with col1:
        stripe_key = st.text_input("Stripe Secret Key", value=st.session_state.stripe_key, type="password")
        
        if st.button("Save Stripe Key"):
            st.session_state.stripe_key = stripe_key
            st.success("Key saved to session state!")
            
    with col2:
        st.info("Status: " + ("Configured" if st.session_state.stripe_key else "Not Configured"))
        if st.button("Test Stripe Connection"):
            test_connection("stripe")

with tab3:
    st.header("Apollo")
    st.markdown("Connect your enrichment data.")
    
    col1, col2 = st.columns(2)
    with col1:
        apollo_key = st.text_input("Apollo API Key", value=st.session_state.apollo_key, type="password")
        
        if st.button("Save Apollo Key"):
            st.session_state.apollo_key = apollo_key
            st.success("Key saved to session state!")
            
    with col2:
        st.info("Status: " + ("Configured" if st.session_state.apollo_key else "Not Configured"))
        if st.button("Test Apollo Connection"):
            test_connection("apollo")
