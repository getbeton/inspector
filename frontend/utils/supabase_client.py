"""
Supabase client for frontend OAuth integration.

Handles authentication with Supabase using Google OAuth.
"""

import os
from typing import Optional, Dict


class SupabaseClient:
    """
    Supabase authentication client.

    Handles OAuth redirect flow with Supabase and token extraction.
    """

    def __init__(self):
        """Initialize Supabase client with credentials."""
        self.supabase_url = os.getenv("SUPABASE_URL", "https://mnfuileyigqbybpbromw.supabase.co")
        self.supabase_anon_key = os.getenv("SUPABASE_ANON_KEY", "")
        self.frontend_url = os.getenv("FRONTEND_URL", "http://localhost:8501")

        if not self.supabase_url or not self.supabase_anon_key:
            raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment")

    def get_oauth_redirect_url(self, provider: str = "google") -> str:
        """
        Generate OAuth redirect URL for Supabase.

        Args:
            provider: OAuth provider (google, github, etc.)

        Returns:
            URL to redirect user to for authentication
        """
        redirect_uri = f"{self.frontend_url}?oauth_callback=true"

        return (
            f"{self.supabase_url}/auth/v1/authorize?"
            f"provider={provider}&"
            f"client_id={self.supabase_anon_key}&"
            f"redirect_to={redirect_uri}&"
            f"response_type=code"
        )

    def get_token_from_url_fragment(self) -> Optional[str]:
        """
        Extract JWT token from URL fragment after OAuth callback.

        Supabase returns token in URL like:
        #access_token=eyJ...&token_type=bearer&type=recovery

        Returns:
            JWT token if present in URL, None otherwise
        """
        # This function will be called from JavaScript injection in Streamlit
        # The token extraction happens via client-side JavaScript
        pass

    def extract_claims_from_token(self, token: str) -> Dict:
        """
        Extract claims from JWT token (for display purposes).

        Note: Validation happens on backend. This is just for display.

        Args:
            token: JWT token from Supabase

        Returns:
            Dictionary with token claims (sub, email, etc.)
        """
        import json
        import base64

        try:
            # JWT format: header.payload.signature
            parts = token.split(".")
            if len(parts) != 3:
                return {}

            # Decode payload (add padding if needed)
            payload = parts[1]
            padding = 4 - len(payload) % 4
            if padding != 4:
                payload += "=" * padding

            decoded = base64.urlsafe_b64decode(payload)
            claims = json.loads(decoded)

            return {
                "sub": claims.get("sub"),
                "email": claims.get("email"),
                "name": claims.get("user_metadata", {}).get("name"),
                "email_verified": claims.get("email_verified"),
                "provider": claims.get("app_metadata", {}).get("provider"),
            }
        except Exception:
            return {}


def get_supabase_client() -> SupabaseClient:
    """Get Supabase client instance."""
    return SupabaseClient()
