"""
PostHog Integration API Endpoints.

Provides endpoints for validating PostHog credentials and managing
the PostHog integration configuration for workspaces.

Endpoints:
    POST /api/posthog/validate - Validate and store PostHog credentials
    GET /api/posthog/status - Get current PostHog configuration status
    POST /api/posthog/disconnect - Disconnect PostHog integration

Rate Limiting:
    - /validate: 5 requests per minute per workspace
"""
import logging
import time
from datetime import datetime
from typing import Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import create_engine

from app.auth import get_current_user
from app.config import settings
from app.services.posthog_validator import PostHogValidatorService, ValidationResult

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/posthog", tags=["PostHog Integration"])

# ============================================
# Rate Limiting (Simple In-Memory)
# ============================================

# Store: {workspace_id: [(timestamp, count), ...]}
_rate_limit_store: Dict[str, list] = {}
RATE_LIMIT_REQUESTS = 5
RATE_LIMIT_WINDOW = 60  # seconds


def check_rate_limit(workspace_id: str) -> bool:
    """
    Check if the workspace has exceeded the validation rate limit.

    Args:
        workspace_id: The workspace ID

    Returns:
        True if request is allowed, False if rate limited
    """
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW

    # Get or create entries for this workspace
    if workspace_id not in _rate_limit_store:
        _rate_limit_store[workspace_id] = []

    # Filter out old entries
    _rate_limit_store[workspace_id] = [
        ts for ts in _rate_limit_store[workspace_id]
        if ts > window_start
    ]

    # Check count
    if len(_rate_limit_store[workspace_id]) >= RATE_LIMIT_REQUESTS:
        return False

    # Add current request
    _rate_limit_store[workspace_id].append(now)
    return True


# ============================================
# Request/Response Models
# ============================================

class ValidateRequest(BaseModel):
    """Request body for PostHog credential validation."""
    api_key: str = Field(
        ...,
        description="PostHog personal API key (format: phc_XXXX)",
        min_length=10
    )

    class Config:
        json_schema_extra = {
            "example": {
                "api_key": "phc_abc123def456ghi789..."
            }
        }


class ValidateResponse(BaseModel):
    """Response for successful validation."""
    success: bool
    workspace_name: Optional[str] = None
    project_id: Optional[str] = None
    events_count: int = 0

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "workspace_name": "Acme Corp",
                "project_id": "12345",
                "events_count": 15420
            }
        }


class ErrorResponse(BaseModel):
    """Response for validation errors."""
    error: str
    error_type: str

    class Config:
        json_schema_extra = {
            "example": {
                "error": "Invalid API key format",
                "error_type": "invalid_format"
            }
        }


class StatusResponse(BaseModel):
    """Response for configuration status."""
    is_configured: bool
    is_validated: bool
    is_active: Optional[bool] = None
    workspace_name: Optional[str] = None
    project_id: Optional[str] = None
    validated_at: Optional[str] = None
    last_sync: Optional[str] = None
    validation_error: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "is_configured": True,
                "is_validated": True,
                "is_active": True,
                "workspace_name": "Acme Corp",
                "project_id": "12345",
                "validated_at": "2025-01-15T10:30:00Z",
                "last_sync": "2025-01-15T12:00:00Z",
                "validation_error": None
            }
        }


# ============================================
# Database Session Dependency
# ============================================

# Create engine from settings
engine = create_engine(settings.database_url)


def get_db():
    """Get database session."""
    db = Session(bind=engine)
    try:
        yield db
    finally:
        db.close()


# ============================================
# Endpoints
# ============================================

@router.post(
    "/validate",
    response_model=ValidateResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid API key format"},
        401: {"model": ErrorResponse, "description": "Unauthorized API key"},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
        500: {"model": ErrorResponse, "description": "Internal server error"}
    },
    summary="Validate PostHog Credentials",
    description="""
Validate PostHog API credentials and store them if valid.

This endpoint:
1. Validates the API key format (must start with 'phc_')
2. Tests the connection to PostHog
3. Encrypts and stores the API key
4. Returns workspace information on success

**Rate Limit:** 5 requests per minute per workspace.

**API Key Format:** PostHog personal API keys start with `phc_` and are
typically 40+ characters long. You can find your API key in PostHog under
Settings → Project → Personal API Keys.
"""
)
async def validate_posthog_credentials(
    request: ValidateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Validate and store PostHog API credentials.

    Args:
        request: Contains the PostHog API key to validate
        current_user: Authenticated user (from JWT/session)
        db: Database session

    Returns:
        ValidateResponse with workspace info on success

    Raises:
        HTTPException 400: Invalid API key format
        HTTPException 401: Unauthorized API key
        HTTPException 429: Rate limit exceeded
        HTTPException 500: Internal error
    """
    workspace_id = current_user.get("workspace_id")
    user_id = current_user.get("sub")

    if not workspace_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Workspace ID not found in session"
        )

    # Check rate limit
    if not check_rate_limit(workspace_id):
        logger.warning(f"Rate limit exceeded for workspace {workspace_id}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": f"Rate limit exceeded. Maximum {RATE_LIMIT_REQUESTS} validation requests per minute.",
                "error_type": "rate_limited"
            }
        )

    logger.info(f"PostHog validation attempt by user {user_id} for workspace {workspace_id}")

    # Validate credentials
    validator = PostHogValidatorService(db)

    try:
        result = validator.validate_and_store_config(
            workspace_id=workspace_id,
            api_key=request.api_key
        )
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": str(e), "error_type": "validation_error"}
        )
    except Exception as e:
        logger.exception(f"Unexpected error during PostHog validation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "An unexpected error occurred", "error_type": "internal_error"}
        )

    if not result.success:
        # Map error types to HTTP status codes
        status_code = {
            "invalid_format": status.HTTP_400_BAD_REQUEST,
            "unauthorized": status.HTTP_401_UNAUTHORIZED,
            "not_found": status.HTTP_404_NOT_FOUND,
            "rate_limited": status.HTTP_429_TOO_MANY_REQUESTS,
            "connection_error": status.HTTP_502_BAD_GATEWAY,
            "api_error": status.HTTP_502_BAD_GATEWAY,
        }.get(result.error_type, status.HTTP_500_INTERNAL_SERVER_ERROR)

        logger.warning(
            f"PostHog validation failed for workspace {workspace_id}: "
            f"{result.error_type} - {result.error_message}"
        )

        raise HTTPException(
            status_code=status_code,
            detail={"error": result.error_message, "error_type": result.error_type}
        )

    logger.info(f"PostHog validation successful for workspace {workspace_id}: {result.workspace_name}")

    return ValidateResponse(
        success=True,
        workspace_name=result.workspace_name,
        project_id=result.project_id,
        events_count=result.events_count
    )


@router.get(
    "/status",
    response_model=StatusResponse,
    summary="Get PostHog Configuration Status",
    description="""
Get the current PostHog integration status for the user's workspace.

Returns:
- Whether PostHog is configured
- Validation status
- Workspace name and project ID
- Last validation and sync timestamps
- Any validation errors
"""
)
async def get_posthog_status(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get PostHog configuration status for the current workspace.

    Args:
        current_user: Authenticated user (from JWT/session)
        db: Database session

    Returns:
        StatusResponse with current configuration status
    """
    workspace_id = current_user.get("workspace_id")

    if not workspace_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Workspace ID not found in session"
        )

    validator = PostHogValidatorService(db)
    status_info = validator.get_config_status(workspace_id)

    return StatusResponse(**status_info)


@router.post(
    "/disconnect",
    summary="Disconnect PostHog Integration",
    description="""
Disconnect the PostHog integration for the current workspace.

This deactivates the integration but does not delete the configuration.
The integration can be re-enabled by validating credentials again.
"""
)
async def disconnect_posthog(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Disconnect PostHog integration for the current workspace.

    Args:
        current_user: Authenticated user (from JWT/session)
        db: Database session

    Returns:
        Success message
    """
    workspace_id = current_user.get("workspace_id")
    user_id = current_user.get("sub")

    if not workspace_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Workspace ID not found in session"
        )

    logger.info(f"PostHog disconnect requested by user {user_id} for workspace {workspace_id}")

    validator = PostHogValidatorService(db)
    disconnected = validator.disconnect(workspace_id)

    if not disconnected:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No PostHog configuration found for this workspace"
        )

    logger.info(f"PostHog disconnected for workspace {workspace_id}")

    return {"message": "PostHog integration disconnected successfully"}
