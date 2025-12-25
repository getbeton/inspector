from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings
from app.core.jwt_handler import get_jwt_handler
import secrets
import bcrypt

security = HTTPBearer()


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
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Authenticate user via JWT token (Supabase) or mock auth.

    Epic 2: Auth Backend
    - In DEV mode: Returns mock user for testing without Supabase
    - In PROD mode: Validates Supabase JWT token and extracts user claims

    Returns:
        dict: User context including sub (user_id), email, etc.

    Raises:
        HTTPException 401: Invalid, expired, or missing token
    """
    if settings.env == "DEV":
        # Development mode: Return mock user for testing
        return {
            "sub": "mock-user-id",
            "workspace_id": "mock-workspace-id",
            "email": "mock@example.com",
            "name": "Mock User",
            "role": "owner"
        }

    token = credentials.credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # In production: Validate JWT token with Supabase
    jwt_handler = get_jwt_handler()
    claims = jwt_handler.validate_and_extract_claims(token)

    # Return user context with extracted claims
    return {
        "sub": claims.get("sub"),  # Supabase user ID
        "email": claims.get("email"),
        "name": claims.get("name"),
        "email_verified": claims.get("email_verified"),
        "provider": claims.get("provider"),
        # workspace_id will be filled by endpoints that need it
        "workspace_id": None
    }
