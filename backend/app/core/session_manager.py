"""
Session management for authenticated users.

Uses HTTP-only secure cookies to store session tokens.
"""

from itsdangerous import TimestampSigner, SignatureExpired, BadSignature
import os
from typing import Optional, Dict
import json

# Session configuration
SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-secret-change-in-production")
SESSION_MAX_AGE = 7 * 24 * 60 * 60  # 7 days in seconds
SESSION_COOKIE_NAME = "beton_session"
SIGNER = TimestampSigner(SESSION_SECRET)


def create_session(user_id: str, email: str, name: Optional[str], workspace_id: str, workspace_name: str) -> str:
    """
    Create a signed session token.

    Args:
        user_id: Supabase user ID
        email: User email
        name: User name
        workspace_id: Workspace ID
        workspace_name: Workspace name

    Returns:
        Signed session token (to be set in HTTP-only cookie)
    """
    session_data = {
        "sub": user_id,
        "email": email,
        "name": name,
        "workspace_id": workspace_id,
        "workspace_name": workspace_name,
    }

    # Sign and serialize the session data
    session_json = json.dumps(session_data)
    signed_token = SIGNER.sign(session_json)

    # SIGNER.sign() returns bytes, decode to string for cookie storage
    if isinstance(signed_token, bytes):
        return signed_token.decode('utf-8')
    return signed_token


def validate_session(token: str) -> Optional[Dict]:
    """
    Validate and extract session data from signed token.

    Args:
        token: Signed session token from cookie

    Returns:
        Dictionary with user/workspace data if valid, None if invalid/expired
    """
    try:
        # Verify signature and check expiration (max_age in seconds)
        session_json = SIGNER.unsign(token, max_age=SESSION_MAX_AGE)
        session_data = json.loads(session_json)
        return session_data
    except (SignatureExpired, BadSignature, json.JSONDecodeError):
        return None


def clear_session() -> None:
    """Clear session (nothing to do - just delete the cookie on client side)."""
    pass
