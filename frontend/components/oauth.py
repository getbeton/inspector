"""
Supabase OAuth authentication handler.

Manages Google OAuth sign-in and JWT token extraction.
"""

import streamlit as st
import requests
import os
import json
from utils.supabase_client import get_supabase_client

API_URL = os.getenv("API_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8501")


def inject_token_extraction_script():
    """
    Inject JavaScript to extract JWT token from URL fragment after OAuth callback.

    Supabase redirects with token in URL fragment: #access_token=eyJ...
    This script extracts it and passes it to Streamlit via query params.
    """
    token_extraction_script = """
    <script>
    // Extract token from URL fragment after Supabase OAuth callback
    (function() {
        const hash = window.location.hash;
        const fragment = hash.substring(1);

        if (fragment) {
            // Parse fragment: access_token=eyJ...&token_type=bearer&type=recovery
            const params = new URLSearchParams(fragment);
            const access_token = params.get('access_token');
            const token_type = params.get('token_type');

            if (access_token && token_type === 'bearer') {
                // Store token in sessionStorage
                sessionStorage.setItem('supabase_token', access_token);

                // Clear URL fragment for security
                window.history.replaceState({}, document.title, window.location.pathname);

                // Rerun Streamlit to process token
                window.location.href = window.location.pathname + '?oauth_callback=true';
            }
        }
    })();
    </script>
    """
    st.components.v1.html(token_extraction_script, height=0)


def handle_oauth_callback():
    """
    Handle OAuth callback after Supabase redirects with token.

    Extracts JWT token from sessionStorage and authenticates user.
    """
    # Check if we're in OAuth callback mode
    if st.query_params.get("oauth_callback") != "true":
        return None

    # Try to get token from sessionStorage via JavaScript
    token_check_script = """
    <script>
    const token = sessionStorage.getItem('supabase_token');
    if (token) {
        // We have the token, pass it back via Streamlit
        window.opener.postMessage({type: 'oauth_token', token: token}, '*');
    }
    </script>
    """
    st.components.v1.html(token_check_script, height=0)

    # For now, we'll handle this via the HTML iframe approach
    # The token will be extracted client-side and we'll process it


def render_google_oauth_button():
    """
    Render Google sign-in button that redirects to Supabase OAuth.

    Epic 3: OAuth Flow
    """
    st.markdown("## Sign in with Google")

    try:
        supabase = get_supabase_client()
        oauth_url = supabase.get_oauth_redirect_url("google")

        # Inject token extraction script
        inject_token_extraction_script()

        # Check for OAuth callback
        handle_oauth_callback()

        # Create button that redirects to OAuth URL
        col1, col2, col3 = st.columns([1, 1.5, 1])
        with col2:
            st.markdown(f"""
            <a href="{oauth_url}" style="
                display: inline-block;
                background: white;
                border: 1px solid #dadce0;
                border-radius: 4px;
                padding: 12px 24px;
                text-decoration: none;
                color: #3c4043;
                font-weight: 500;
                font-size: 16px;
                cursor: pointer;
                text-align: center;
                width: 100%;
                box-sizing: border-box;
            ">
                <svg style="height:20px;width:20px;margin-right:8px;vertical-align:middle;" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
            </a>
            """, unsafe_allow_html=True)

    except ValueError as e:
        st.error(f"OAuth configuration error: {e}")
        st.info("Please ensure SUPABASE_URL and SUPABASE_ANON_KEY are set in your environment.")


def render_development_login():
    """
    Render development login for testing without OAuth setup.

    Allows quick testing with mock auth in DEV mode.
    """
    with st.expander("🔧 Development: Quick Mock Login"):
        st.markdown(
            """
            Click below to simulate login with mock credentials.
            This allows testing the application during development without Supabase.
            """
        )

        if st.button("Mock Login as Developer", key="dev_mock_login"):
            from components.auth import set_auth_token, set_user, set_workspace

            mock_user = {
                "sub": "mock-user-id",
                "email": "dev@example.com",
                "name": "Developer",
                "email_verified": True,
                "provider": "mock"
            }
            mock_workspace = {
                "id": "mock-workspace-id",
                "name": "Dev Workspace",
                "slug": "dev-workspace"
            }

            set_auth_token("mock-jwt-token-for-dev")
            set_user(mock_user)
            set_workspace(mock_workspace)

            st.success("✅ Logged in with mock credentials")
            st.info("Using: dev@example.com (DEV mode)")
            st.balloons()
            st.rerun()
