"""
JWT token validation for Supabase OAuth integration.

Handles Supabase JWT tokens with proper claim validation:
- Signature verification using SUPABASE_JWT_SECRET
- Audience claim validation (must be "authenticated")
- Issuer validation (must match Supabase project URL)
- Expiration checking
- User ID extraction
"""

from datetime import datetime
from fastapi import HTTPException, status
from app.config import settings
import os

# Try python-jose first (Supabase standard), fall back to PyJWT
try:
    from jose import jwt, JWTError
    JOSE_AVAILABLE = True
except ImportError:
    JOSE_AVAILABLE = False
    import jwt as pyjwt
    from jwt import InvalidTokenError as JWTError


class JWTHandler:
    """
    Handles Supabase JWT token validation and claim extraction.
    """

    def __init__(self):
        """Initialize JWT handler with configuration."""
        self.jwt_secret = os.getenv("SUPABASE_JWT_SECRET")
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.algorithm = "HS256"

    def validate_and_extract_claims(self, token: str) -> dict:
        """
        Validate JWT token and extract user claims.

        Performs:
        1. Signature verification with SUPABASE_JWT_SECRET
        2. Audience claim validation (must be "authenticated")
        3. Issuer validation (must match Supabase project URL)
        4. Expiration check
        5. Required claims check

        Args:
            token: JWT token from Authorization header

        Returns:
            dict: Extracted claims including sub (user_id), email, etc.

        Raises:
            HTTPException 401: Invalid, expired, or missing required claims
        """
        if not self.jwt_secret:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="JWT validation not configured",
                headers={"WWW-Authenticate": "Bearer"},
            )

        try:
            # Decode JWT with signature verification
            if JOSE_AVAILABLE:
                # Using python-jose (Supabase standard)
                payload = jwt.decode(
                    token,
                    self.jwt_secret,
                    algorithms=[self.algorithm],
                    # NOTE: Don't specify audience here to avoid validation error
                    # We'll validate it manually to provide better error messages
                    options={"verify_aud": False}
                )
            else:
                # Using PyJWT
                payload = pyjwt.decode(
                    token,
                    self.jwt_secret,
                    algorithms=[self.algorithm],
                    options={"verify_aud": False}
                )

            # Validate audience claim
            aud = payload.get("aud")
            if aud != "authenticated":
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Invalid token audience. Expected 'authenticated', got '{aud}'",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Validate issuer claim (if Supabase URL is configured)
            if self.supabase_url:
                expected_issuer = f"{self.supabase_url}/auth/v1"
                iss = payload.get("iss")
                if iss != expected_issuer:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail=f"Invalid token issuer. Expected '{expected_issuer}'",
                        headers={"WWW-Authenticate": "Bearer"},
                    )

            # Validate expiration
            exp = payload.get("exp")
            if exp:
                exp_datetime = datetime.utcfromtimestamp(exp)
                if datetime.utcnow() > exp_datetime:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Token has expired",
                        headers={"WWW-Authenticate": "Bearer"},
                    )

            # Extract required claims
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token missing required 'sub' (user ID) claim",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Return extracted claims
            return {
                "sub": user_id,  # Supabase user ID
                "email": payload.get("email"),
                "email_verified": payload.get("email_verified", False),
                "name": payload.get("user_metadata", {}).get("name"),
                "picture": payload.get("user_metadata", {}).get("picture"),
                "provider": payload.get("app_metadata", {}).get("provider"),
                "aud": aud,
                "iss": payload.get("iss"),
                "iat": payload.get("iat"),
                "exp": payload.get("exp"),
            }

        except HTTPException:
            # Re-raise our custom exceptions
            raise
        except JWTError as e:
            # Handle JWT library errors
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except Exception as e:
            # Catch any other errors
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Token validation failed: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )


# Global JWT handler instance
_jwt_handler = None


def get_jwt_handler() -> JWTHandler:
    """Get or create JWT handler instance."""
    global _jwt_handler
    if _jwt_handler is None:
        _jwt_handler = JWTHandler()
    return _jwt_handler
