"""
Authentication components for Streamlit.

Epic 3: Login UI
Handles OAuth login flow, session management, and workspace creation.
"""

import streamlit as st
import requests
import os
from typing import Optional, Dict

API_URL = os.getenv("API_URL", "http://localhost:8000")


def init_auth_session():
    """Initialize authentication-related session state."""
    if "auth_token" not in st.session_state:
        st.session_state.auth_token = None
    if "user" not in st.session_state:
        st.session_state.user = None
    if "workspace" not in st.session_state:
        st.session_state.workspace = None


def get_auth_token() -> Optional[str]:
    """Get current authentication token from session."""
    return st.session_state.get("auth_token")


def get_current_user() -> Optional[Dict]:
    """Get current user from session."""
    return st.session_state.get("user")


def get_workspace() -> Optional[Dict]:
    """Get current workspace from session."""
    return st.session_state.get("workspace")


def set_auth_token(token: str):
    """Store authentication token in session."""
    st.session_state.auth_token = token


def set_user(user: Dict):
    """Store user info in session."""
    st.session_state.user = user


def set_workspace(workspace: Dict):
    """Store workspace info in session."""
    st.session_state.workspace = workspace


def logout():
    """Clear all authentication from session."""
    st.session_state.auth_token = None
    st.session_state.user = None
    st.session_state.workspace = None


def is_authenticated() -> bool:
    """Check if user is currently authenticated."""
    return get_auth_token() is not None


def render_login_page():
    """
    Render the login page with OAuth buttons.

    Epic 3: Login UI - OAuth with Google
    """
    st.set_page_config(
        page_title="Login | Beton",
        page_icon="🔐",
        layout="centered"
    )

    col_main = st.container()

    with col_main:
        # Logo and branding
        st.markdown("<br>" * 2, unsafe_allow_html=True)

        # Center content
        col_spacer_left, col_content, col_spacer_right = st.columns([1, 2, 1])

        with col_content:
            st.markdown("### 🔐 Welcome to Beton")
            st.markdown(
                "Automatically discover which user behaviors predict revenue",
                unsafe_allow_html=False
            )

            st.markdown("<br>", unsafe_allow_html=True)

            # Google OAuth - Import and render OAuth button
            from components.oauth import render_google_oauth_button, render_development_login

            render_google_oauth_button()

            st.markdown("<br>", unsafe_allow_html=True)

            # Development login helper
            render_development_login()

    st.markdown("<br>" * 3, unsafe_allow_html=True)


def render_logout_button():
    """
    Render logout button in sidebar.

    Epic 3: Session Management
    """
    if is_authenticated():
        if st.sidebar.button("🚪 Logout"):
            logout()
            st.success("Logged out successfully")
            st.rerun()


def check_authentication_required():
    """
    Check if user is authenticated before allowing page access.

    Epic 3: Route Protection
    Redirect to login if not authenticated.
    """
    if not is_authenticated():
        render_login_page()
        st.stop()


def render_authenticated_sidebar():
    """
    Render authenticated sidebar with user info and workspace switcher.

    Epic 3: UI Components
    """
    if is_authenticated():
        user = get_current_user()
        workspace = get_workspace()

        with st.sidebar:
            st.markdown("---")
            st.markdown(f"**{workspace.get('name', 'Workspace')}**")
            st.caption(f"👤 {user.get('email', 'user@example.com')}")

            st.markdown("---")

            render_logout_button()
