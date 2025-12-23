"""
Settings Page
Configure company-level settings that affect calculations
"""

import streamlit as st
import requests
import os

st.title("⚙️ Settings")

API_URL = os.getenv("API_URL", "http://localhost:8000")

# Fetch current settings
try:
    response = requests.get(f"{API_URL}/api/settings")
    if response.status_code == 200:
        data = response.json()
        settings = data.get('settings', {})

        # Revenue Settings
        st.subheader("Revenue Settings")

        with st.form("settings_form"):
            avg_acv = st.number_input(
                "Average Contract Value (ACV)",
                min_value=1000,
                max_value=1000000,
                value=settings.get('avg_acv', 27000),
                step=1000,
                help="Used for ARR projections"
            )

            baseline_conversion = st.number_input(
                "Baseline Conversion Rate (%)",
                min_value=0.1,
                max_value=50.0,
                value=settings.get('baseline_conversion', 0.034) * 100,
                step=0.1,
                format="%.1f",
                help="Your historical free-to-paid conversion"
            )

            sales_cycle_days = st.number_input(
                "Average Sales Cycle (days)",
                min_value=1,
                max_value=365,
                value=settings.get('sales_cycle_days', 45),
                step=1
            )

            currency = st.selectbox(
                "Currency",
                options=["USD", "EUR", "GBP"],
                index=0
            )

            st.markdown("###")

            st.subheader("Signal Thresholds")

            min_confidence = st.slider(
                "Minimum confidence to show signal (%)",
                min_value=80,
                max_value=100,
                value=int(settings.get('min_confidence', 0.90) * 100),
                step=1
            )

            min_sample_size = st.number_input(
                "Minimum sample size (users)",
                min_value=10,
                max_value=1000,
                value=settings.get('min_sample_size', 30),
                step=10
            )

            min_lift = st.number_input(
                "Minimum lift",
                min_value=1.0,
                max_value=10.0,
                value=settings.get('min_lift', 1.5),
                step=0.1,
                format="%.1f"
            )

            st.markdown("###")

            col_btn1, col_btn2 = st.columns([3, 1])
            with col_btn2:
                save_button = st.form_submit_button("💾 Save Settings", type="primary", use_container_width=True)

            if save_button:
                # Prepare updated settings
                updated_settings = {
                    "avg_acv": avg_acv,
                    "baseline_conversion": baseline_conversion / 100,
                    "sales_cycle_days": sales_cycle_days,
                    "currency": currency,
                    "min_confidence": min_confidence / 100,
                    "min_sample_size": min_sample_size,
                    "min_lift": min_lift
                }

                try:
                    update_response = requests.post(
                        f"{API_URL}/api/settings",
                        json=updated_settings
                    )
                    if update_response.status_code == 200:
                        st.success("Settings saved successfully!")
                    else:
                        st.error("Failed to save settings")
                except Exception as e:
                    st.error(f"Save failed: {e}")

    else:
        st.error("Failed to load settings")
except Exception as e:
    st.error(f"Connection error: {e}")

# Additional Information
st.markdown("---")
st.subheader("About These Settings")

with st.expander("How are these settings used?"):
    st.markdown("""
### Revenue Settings

**Average Contract Value (ACV)**
- Used to calculate estimated ARR impact for each signal
- Formula: `Incremental conversions × ACV × 12 months`

**Baseline Conversion Rate**
- Your current free-to-paid conversion without any signals
- Used as the comparison baseline for measuring signal lift
- Example: If baseline is 3.4% and signal achieves 14.2%, lift is 4.2x

**Sales Cycle**
- Average time from lead to closed-won
- Used for pipeline velocity calculations

### Signal Thresholds

**Minimum Confidence**
- Signals below this statistical confidence won't be shown
- Recommended: 90% or higher for reliable signals

**Minimum Sample Size**
- Minimum number of users needed to validate a signal
- Prevents showing signals based on too few data points
- Recommended: 30+ for statistical validity

**Minimum Lift**
- Only show signals with at least this conversion multiplier
- Example: 1.5x means signal must show 50% improvement
- Recommended: 1.5x or higher for meaningful impact
    """)
