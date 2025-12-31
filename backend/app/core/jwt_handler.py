"""
JWT token validation for Supabase OAuth integration.

Handles Supabase JWT tokens with proper claim validation:
- Signature verification using JWKS (ES256) or JWT secret (HS256)
- Audience claim validation (must be "authenticated")
- Issuer validation (must match Supabase project URL)
- Expiration checking
- User ID extraction
"""

from datetime import datetime
from fastapi import HTTPException, status
from app.config import settings
import os
import logging
import jwt
from jwt import InvalidTokenError, ExpiredSignatureError, DecodeError, PyJWKClient
import time

logger = logging.getLogger(__name__)


class JWTHandler:
    """
    Handles Supabase JWT token validation and claim extraction.
    Supports both HS256 (JWT secret) and ES256 (JWKS) algorithms.
    """

    def __init__(self):
        """Initialize JWT handler with configuration."""
        self.jwt_secret = os.getenv("SUPABASE_JWT_SECRET")
        self.supabase_url = os.getenv("SUPABASE_URL")
        self._jwks_client = None
        self._jwks_cache_time = 0
        self._jwks_cache_ttl = 3600  # Cache JWKS for 1 hour

    def _get_jwks_client(self) -> PyJWKClient:
        """Get or create JWKS client for ES256 validation."""
        current_time = time.time()
        if self._jwks_client is None or (current_time - self._jwks_cache_time) > self._jwks_cache_ttl:
            if not self.supabase_url:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="SUPABASE_URL not configured for JWKS validation",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            jwks_url = f"{self.supabase_url}/auth/v1/.well-known/jwks.json"
            logger.info(f"Fetching JWKS from: {jwks_url}")
            self._jwks_client = PyJWKClient(jwks_url)
            self._jwks_cache_time = current_time
        return self._jwks_client

    def _get_token_algorithm(self, token: str) -> str:
        """Extract algorithm from JWT header without validation."""
        try:
            header = jwt.get_unverified_header(token)
            return header.get("alg", "HS256")
        except Exception:
            return "HS256"

    def validate_and_extract_claims(self, token: str) -> dict:
        """
        Validate JWT token and extract user claims.

        Performs:
        1. Detect algorithm from token header (ES256 or HS256)
        2. Signature verification (JWKS for ES256, JWT secret for HS256)
        3. Audience claim validation (must be "authenticated")
        4. Issuer validation (must match Supabase project URL)
        5. Expiration check
        6. Required claims check

        Args:
            token: JWT token from Authorization header

        Returns:
            dict: Extracted claims including sub (user_id), email, etc.

        Raises:
            HTTPException 401: Invalid, expired, or missing required claims
        """
        # Detect algorithm from token
        algorithm = self._get_token_algorithm(token)
        logger.info(f"JWT algorithm detected: {algorithm}")

        try:
            if algorithm == "ES256":
                # Use JWKS for ES256 tokens
                jwks_client = self._get_jwks_client()
                signing_key = jwks_client.get_signing_key_from_jwt(token)
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=["ES256"],
                    options={"verify_aud": False}
                )
            else:
                # Use JWT secret for HS256 tokens
                if not self.jwt_secret:
                    logger.error("JWT validation not configured - SUPABASE_JWT_SECRET not set")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="JWT validation not configured",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                payload = jwt.decode(
                    token,
                    self.jwt_secret,
                    algorithms=["HS256"],
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
                "name": payload.get("user_metadata", {}).get("name") if payload.get("user_metadata") else None,
                "picture": payload.get("user_metadata", {}).get("picture") if payload.get("user_metadata") else None,
                "provider": payload.get("app_metadata", {}).get("provider") if payload.get("app_metadata") else None,
                "aud": aud,
                "iss": payload.get("iss"),
                "iat": payload.get("iat"),
                "exp": payload.get("exp"),
            }

        except HTTPException:
            # Re-raise our custom exceptions
            raise
        except ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except DecodeError as e:
            logger.error(f"JWT decode error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token format: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except InvalidTokenError as e:
            logger.error(f"JWT validation error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except Exception as e:
            logger.exception(f"Unexpected JWT error: {str(e)}")
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
