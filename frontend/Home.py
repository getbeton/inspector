import streamlit as st
import requests
import os

st.set_page_config(page_title="Beton Inspector", page_icon="🏗️", layout="wide")

st.title("🏗️ Beton Inspector")

st.markdown("""
**Welcome to Beton Inspector.** 
This tool helps you identify expansion opportunities and churn risks in your user base.
""")

# Check Backend Connection
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

try:
    res = requests.get(f"{BACKEND_URL}/health", timeout=2)
    if res.status_code == 200:
        st.success(f"Connected to Backend at {BACKEND_URL}")
    else:
        st.error(f"Backend returned status: {res.status_code}")
except Exception as e:
    st.error(f"Could not connect to Backend at {BACKEND_URL}. Error: {e}")

st.sidebar.header("Configuration")
mock_mode = st.sidebar.checkbox("Use Mock Data", value=True)
if mock_mode:
    st.sidebar.info("Running in Mock Data Mode")
