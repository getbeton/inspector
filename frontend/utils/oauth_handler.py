"""
OAuth callback handling for Supabase authentication.

Manages token extraction and user authentication after Supabase redirect.
"""

import streamlit as st
import requests
import json
import base64
from typing import Optional, Dict


class OAuthHandler:
    """Handle OAuth flows and token management."""

    def __init__(self, api_url: str, frontend_url: str):
        """Initialize OAuth handler."""
        self.api_url = api_url
        self.frontend_url = frontend_url

    def extract_token_from_fragment(self) -> Optional[str]:
        """
        Extract JWT token from sessionStorage after OAuth callback.

        Returns:
            JWT token if found, None otherwise
        """
        # Read token from sessionStorage using Streamlit component
        token_getter_script = """
        <script>
        // Get token from sessionStorage
        const token = sessionStorage.getItem('oauth_token');
        if (token) {
            // Create a hidden input to pass token to Streamlit
            const input = document.createElement('input');
            input.type = 'hidden';
            input.id = 'oauth-token-input';
            input.value = token;
            document.body.appendChild(input);
        }
        </script>
        """
        st.components.v1.html(token_getter_script, height=0)
        return None

    def validate_token_with_backend(self, token: str) -> Optional[Dict]:
        """
        Validate JWT token with backend and get user info.

        Args:
            token: JWT token from Supabase

        Returns:
            User data if token is valid, None otherwise
        """
        try:
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }

            # Try to get user workspace info
            response = requests.get(
                f"{self.api_url}/api/user/workspace",
                headers=headers,
                timeout=5
            )

            if response.status_code == 200:
                return response.json()
            elif response.status_code == 401:
                st.error("Invalid or expired token")
                return None
            else:
                st.error(f"Backend error: {response.status_code}")
                return None

        except requests.RequestException as e:
            st.error(f"Connection error: {str(e)}")
            return None

    def handle_callback(self) -> bool:
        """
        Handle OAuth callback after Supabase redirect.

        Returns:
            True if authentication successful, False otherwise
        """
        if st.query_params.get("oauth_callback") != "true":
            return False

        # Try to get token from sessionStorage via JavaScript
        # Since this is complex with Streamlit, we'll use a simpler approach:
        # Store token in URL query param (if redirecting from external OAuth endpoint)

        # Check if token is in session state (from JavaScript extraction)
        if "oauth_token" in st.session_state:
            token = st.session_state.oauth_token

            # Validate token with backend
            user_data = self.validate_token_with_backend(token)

            if user_data:
                from components.auth import set_auth_token, set_user, set_workspace

                # Extract workspace info from response
                workspace_data = user_data.get("workspace", {})

                # Decode token to get user claims
                user_claims = self.decode_token_claims(token)

                # Extract user and workspace info
                user_info = {
                    "sub": user_claims.get("sub"),
                    "email": user_claims.get("email"),
                    "name": user_claims.get("name"),
                    "email_verified": user_claims.get("email_verified", False),
                    "provider": user_claims.get("provider")
                }

                workspace_info = {
                    "id": workspace_data.get("id"),
                    "name": workspace_data.get("name", "Default Workspace"),
                    "slug": workspace_data.get("slug")
                }

                # Store in session
                set_auth_token(token)
                set_user(user_info)
                set_workspace(workspace_info)

                is_new = user_data.get("isNew", False)
                if is_new:
                    st.success("Welcome! Your workspace has been created.")
                else:
                    st.success("Successfully authenticated!")
                st.balloons()

                # Clear callback flag and reload
                st.query_params.pop("oauth_callback", None)
                st.rerun()

                return True

        return False

    def decode_token_claims(self, token: str) -> Dict:
        """
        Decode JWT token to extract claims (for debugging).

        Args:
            token: JWT token

        Returns:
            Dictionary of token claims
        """
        try:
            parts = token.split(".")
            if len(parts) != 3:
                return {}

            # Decode payload
            payload = parts[1]
            padding = 4 - len(payload) % 4
            if padding != 4:
                payload += "=" * padding

            decoded = base64.urlsafe_b64decode(payload)
            claims = json.loads(decoded)

            return claims
        except Exception:
            return {}
