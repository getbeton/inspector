from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings
from app.core.jwt_handler import get_jwt_handler
from app.core.session_manager import validate_session, SESSION_COOKIE_NAME
from typing import Optional
import secrets
import bcrypt

# Make HTTPBearer optional so session cookies can work without Authorization header
security = HTTPBearer(auto_error=False)


def hash_api_key(key: str) -> str:
    """Hash an API key using bcrypt."""
    return bcrypt.hashpw(key.encode(), bcrypt.gensalt()).decode()


def verify_api_key(key: str, key_hash: str) -> bool:
    """Verify an API key against its hash."""
    try:
        return bcrypt.checkpw(key.encode(), key_hash.encode())
    except Exception:
        return False


def generate_api_key() -> tuple[str, str]:
    """
    Generate a new API key with beton_ prefix.
    Returns (unhashed_key, key_hash).

    The unhashed key is only shown once to the user.
    The hash is stored in the database.
    """
    # Generate 32 random bytes and encode as hex
    random_bytes = secrets.token_hex(16)  # 32 character string
    key = f"beton_{random_bytes}"
    key_hash = hash_api_key(key)
    return key, key_hash


def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    """
    Authenticate user via session cookie, JWT token, or mock auth.

    Epic 2: Auth Backend
    - Checks for session cookie (OAuth login with sessions)
    - Falls back to JWT token in Authorization header
    - In DEV mode: Returns mock user for testing (only if no session)

    Returns:
        dict: User context including sub (user_id), email, workspace_id, etc.

    Raises:
        HTTPException 401: Invalid, expired, or missing authentication
    """
    # Try session cookie first (OAuth callback sets this) - works in all environments
    session_token = request.cookies.get(SESSION_COOKIE_NAME)
    if session_token:
        session_data = validate_session(session_token)
        if session_data:
            # Session is valid - return real user data
            return {
                "sub": session_data.get("sub"),
                "email": session_data.get("email"),
                "name": session_data.get("name"),
                "workspace_id": session_data.get("workspace_id"),
                "workspace_name": session_data.get("workspace_name"),
            }

    # Fall back to mock in DEV mode (for unauthenticated testing only)
    if settings.env == "DEV":
        return {
            "sub": "mock-user-id",
            "workspace_id": "mock-workspace-id",
            "email": "mock@example.com",
            "name": "Mock User",
            "role": "owner"
        }

    # Fall back to JWT token in Authorization header
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication - no session cookie or Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # Validate JWT token with Supabase
    jwt_handler = get_jwt_handler()
    claims = jwt_handler.validate_and_extract_claims(token)

    # Return user context with extracted claims
    return {
        "sub": claims.get("sub"),  # Supabase user ID
        "email": claims.get("email"),
        "name": claims.get("name"),
        "email_verified": claims.get("email_verified"),
        "provider": claims.get("provider"),
        "workspace_id": None  # Will be filled by endpoints that need it
    }
