"""
Settings API endpoints for managing integration configurations and system settings.

Endpoints:
- POST   /api/v1/settings/integrations/{name}          - Save integration config
- GET    /api/v1/settings/integrations/{name}          - Get config (API key masked)
- DELETE /api/v1/settings/integrations/{name}          - Remove integration
- POST   /api/v1/settings/integrations/{name}/test     - Test connection
- GET    /api/v1/settings/integrations                 - List all integrations
- GET    /api/v1/settings/system                       - Get system settings
- PUT    /api/v1/settings/system                       - Update system settings
- GET    /api/v1/settings/health                       - Get health status
"""
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings as app_settings
from app.core.config_manager import ConfigManager, ConfigurationError
from app.integrations.posthog import PostHogClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


# ============================================
# Pydantic Models
# ============================================

class IntegrationConfigRequest(BaseModel):
    """Request body for saving an integration."""
    api_key: str = Field(..., min_length=1, description="API key for the integration")
    config: Optional[Dict[str, Any]] = Field(default={}, description="Additional configuration")
    is_active: bool = Field(default=True, description="Whether the integration is enabled")


class IntegrationConfigResponse(BaseModel):
    """Response for integration configuration."""
    name: str
    api_key_masked: str
    status: str
    is_active: bool
    last_validated_at: Optional[str]
    config: Dict[str, Any]


class SystemSettingsRequest(BaseModel):
    """Request body for updating system settings."""
    query_budget_limit: Optional[int] = Field(None, ge=100, le=2400)
    cache_ttl_seconds: Optional[int] = Field(None, ge=60, le=86400)
    attio_batch_size: Optional[int] = Field(None, ge=10, le=1000)
    max_concurrent_requests: Optional[int] = Field(None, ge=1, le=20)


class SystemSettingsResponse(BaseModel):
    """Response for system settings."""
    query_budget_limit: int
    cache_ttl_seconds: int
    attio_batch_size: int
    max_concurrent_requests: int


class TestConnectionRequest(BaseModel):
    """Request body for testing a connection."""
    api_key: Optional[str] = Field(None, description="API key to test (uses stored if not provided)")
    config: Optional[Dict[str, Any]] = Field(None, description="Config to test (uses stored if not provided)")


class TestConnectionResponse(BaseModel):
    """Response for connection test."""
    success: bool
    message: str
    details: Optional[Dict[str, Any]] = None


class HealthStatusResponse(BaseModel):
    """Response for health status."""
    overall_status: str  # "healthy", "degraded", "unhealthy"
    integrations: Dict[str, Dict[str, Any]]
    last_checked: str


# ============================================
# Dependency Injection
# ============================================

# Import get_db from main (will be fixed with proper dependency injection)
from sqlalchemy import create_engine
engine = create_engine(app_settings.database_url)

def get_db():
    """Get database session."""
    db = Session(bind=engine)
    try:
        yield db
    finally:
        db.close()


def get_config_manager(db: Session = Depends(get_db)) -> ConfigManager:
    """Get ConfigManager instance."""
    return ConfigManager(db)


# ============================================
# Integration Endpoints
# ============================================

@router.post("/integrations/{name}", response_model=IntegrationConfigResponse)
async def save_integration(
    name: str,
    request: IntegrationConfigRequest,
    config_manager: ConfigManager = Depends(get_config_manager)
):
    """
    Save or update an integration configuration.

    - **name**: Integration name (posthog, attio, stripe, apollo)
    - **api_key**: API key to encrypt and store
    - **config**: Additional configuration (project_id, host, workspace_id, etc.)
    - **is_active**: Whether the integration is enabled
    """
    try:
        config_manager.save_integration(
            name=name,
            api_key=request.api_key,
            config=request.config,
            is_active=request.is_active
        )

        # Get the saved config (without API key)
        saved = config_manager.get_integration(name, include_api_key=False)

        return IntegrationConfigResponse(
            name=name,
            api_key_masked=saved.get("api_key_masked", ""),
            status=saved.get("status", "disconnected"),
            is_active=saved.get("is_active", True),
            last_validated_at=saved.get("last_validated_at"),
            config=request.config or {}
        )

    except ConfigurationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error saving integration {name}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save integration configuration"
        )


@router.get("/integrations/{name}", response_model=IntegrationConfigResponse)
async def get_integration(
    name: str,
    config_manager: ConfigManager = Depends(get_config_manager)
):
    """
    Get integration configuration (API key is masked).

    - **name**: Integration name (posthog, attio, stripe, apollo)
    """
    config = config_manager.get_integration(name, include_api_key=False)

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Integration '{name}' not configured"
        )

    return IntegrationConfigResponse(
        name=name,
        api_key_masked=config.get("api_key_masked", ""),
        status=config.get("status", "disconnected"),
        is_active=config.get("is_active", True),
        last_validated_at=config.get("last_validated_at"),
        config={k: v for k, v in config.items()
                if k not in ("api_key_masked", "status", "is_active", "last_validated_at", "api_key")}
    )


@router.delete("/integrations/{name}")
async def delete_integration(
    name: str,
    config_manager: ConfigManager = Depends(get_config_manager)
):
    """
    Delete an integration configuration.

    - **name**: Integration name (posthog, attio, stripe, apollo)
    """
    if config_manager.delete_integration(name):
        return {"status": "deleted", "name": name}

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Integration '{name}' not found"
    )


@router.get("/integrations", response_model=List[IntegrationConfigResponse])
async def list_integrations(
    config_manager: ConfigManager = Depends(get_config_manager)
):
    """
    List all configured integrations.
    """
    integrations = config_manager.list_integrations()

    return [
        IntegrationConfigResponse(
            name=i["name"],
            api_key_masked=i["api_key_masked"],
            status=i["status"],
            is_active=i["is_active"],
            last_validated_at=i["last_validated_at"],
            config=i.get("config", {})
        )
        for i in integrations
    ]


@router.post("/integrations/{name}/test", response_model=TestConnectionResponse)
async def test_integration_connection(
    name: str,
    request: Optional[TestConnectionRequest] = None,
    config_manager: ConfigManager = Depends(get_config_manager)
):
    """
    Test connection to an integration.

    - **name**: Integration name (posthog, attio, stripe, apollo)
    - **api_key**: Optional API key to test (uses stored if not provided)
    - **config**: Optional config to test (uses stored if not provided)
    """
    # Get stored config or use provided
    if request and request.api_key:
        api_key = request.api_key
        config = request.config or {}
    else:
        stored = config_manager.get_integration(name, include_api_key=True)
        if not stored:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Integration '{name}' not configured. Provide api_key in request."
            )
        api_key = stored.get("api_key")
        config = {k: v for k, v in stored.items()
                  if k not in ("api_key", "api_key_masked", "status", "is_active", "last_validated_at")}

    # Test connection based on integration type
    try:
        if name == "posthog":
            result = await _test_posthog_connection(api_key, config)
        elif name == "attio":
            result = await _test_attio_connection(api_key, config)
        elif name == "stripe":
            result = await _test_stripe_connection(api_key)
        elif name == "apollo":
            result = await _test_apollo_connection(api_key)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported integration: {name}"
            )

        # Update validation status
        config_manager.update_validation_status(name, is_valid=result["success"])

        return TestConnectionResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing connection for {name}: {e}")
        config_manager.update_validation_status(name, is_valid=False, error_message=str(e))
        return TestConnectionResponse(
            success=False,
            message=f"Connection test failed: {str(e)}",
            details={"error": str(e)}
        )


# ============================================
# System Settings Endpoints
# ============================================

@router.get("/system", response_model=SystemSettingsResponse)
async def get_system_settings(
    config_manager: ConfigManager = Depends(get_config_manager)
):
    """
    Get all system settings.
    """
    settings = config_manager.get_all_settings()

    return SystemSettingsResponse(
        query_budget_limit=settings.get("query_budget_limit", 2000),
        cache_ttl_seconds=settings.get("cache_ttl_seconds", 3600),
        attio_batch_size=settings.get("attio_batch_size", 100),
        max_concurrent_requests=settings.get("max_concurrent_requests", 5)
    )


@router.put("/system", response_model=SystemSettingsResponse)
async def update_system_settings(
    request: SystemSettingsRequest,
    config_manager: ConfigManager = Depends(get_config_manager)
):
    """
    Update system settings.
    """
    if request.query_budget_limit is not None:
        config_manager.set_setting("query_budget_limit", request.query_budget_limit)

    if request.cache_ttl_seconds is not None:
        config_manager.set_setting("cache_ttl_seconds", request.cache_ttl_seconds)

    if request.attio_batch_size is not None:
        config_manager.set_setting("attio_batch_size", request.attio_batch_size)

    if request.max_concurrent_requests is not None:
        config_manager.set_setting("max_concurrent_requests", request.max_concurrent_requests)

    # Return updated settings
    return await get_system_settings(config_manager)


# ============================================
# Health Check Endpoints
# ============================================

@router.get("/health", response_model=HealthStatusResponse)
async def get_health_status(
    config_manager: ConfigManager = Depends(get_config_manager)
):
    """
    Get health status of all integrations.
    """
    integrations = config_manager.list_integrations()

    integration_health = {}
    overall_healthy = True

    for integration in integrations:
        name = integration["name"]
        status = integration["status"]
        is_active = integration["is_active"]

        health_status = "healthy" if status == "connected" else "unhealthy"
        if not is_active:
            health_status = "disabled"

        if is_active and status != "connected":
            overall_healthy = False

        integration_health[name] = {
            "status": health_status,
            "connection_status": status,
            "is_active": is_active,
            "last_validated_at": integration["last_validated_at"]
        }

    # Determine overall status
    if not integrations:
        overall_status = "unconfigured"
    elif overall_healthy:
        overall_status = "healthy"
    else:
        overall_status = "degraded"

    return HealthStatusResponse(
        overall_status=overall_status,
        integrations=integration_health,
        last_checked=datetime.utcnow().isoformat()
    )


# ============================================
# Rate Limit & Cache Status Endpoints
# ============================================

class RateLimitStatusResponse(BaseModel):
    """Response for rate limit status."""
    integration: str
    limit: int
    window_seconds: int
    current_usage: int
    remaining: int
    usage_percent: float


class CacheStatsResponse(BaseModel):
    """Response for cache statistics."""
    total_entries: int
    active_entries: int
    expired_entries: int
    total_hits: int
    integration: Optional[str] = None


@router.get("/rate-limit/{integration}", response_model=RateLimitStatusResponse)
async def get_rate_limit_status(
    integration: str,
    config_manager: ConfigManager = Depends(get_config_manager)
):
    """
    Get rate limit status for an integration.

    - **integration**: Integration name (posthog, attio)
    """
    from app.core.rate_limiter import get_rate_limiter

    db = config_manager.db
    rate_limiter = get_rate_limiter(db, integration)
    status = rate_limiter.get_status()

    return RateLimitStatusResponse(**status)


@router.get("/cache/stats", response_model=CacheStatsResponse)
async def get_cache_stats(
    integration: Optional[str] = None,
    config_manager: ConfigManager = Depends(get_config_manager)
):
    """
    Get cache statistics.

    - **integration**: Optional integration to filter by
    """
    from app.core.query_cache import get_query_cache

    db = config_manager.db
    cache = get_query_cache(db)
    stats = cache.get_stats(integration)

    return CacheStatsResponse(**stats)


@router.post("/cache/cleanup")
async def cleanup_cache(
    integration: Optional[str] = None,
    config_manager: ConfigManager = Depends(get_config_manager)
):
    """
    Cleanup expired cache entries or invalidate all entries for an integration.

    - **integration**: Optional integration to invalidate all entries for
    """
    from app.core.query_cache import get_query_cache

    db = config_manager.db
    cache = get_query_cache(db)

    if integration:
        deleted = cache.invalidate_integration(integration)
        return {"status": "success", "message": f"Invalidated {deleted} cache entries for {integration}"}
    else:
        deleted = cache.cleanup_expired()
        return {"status": "success", "message": f"Cleaned up {deleted} expired cache entries"}


# ============================================
# Integration Test Helpers
# ============================================

async def _test_posthog_connection(api_key: str, config: dict) -> dict:
    """Test PostHog connection."""
    import requests

    # PostHog API Key Types:
    # - Personal API Key (phx_...) - For querying data via REST API
    # - Project API Key (phc_...) - For capturing/sending events
    POSTHOG_KEY_HELP = {
        "personal_api_key_url": "https://app.posthog.com/settings/user-api-keys",
        "project_api_key_url": "https://app.posthog.com/project/settings",
        "docs_url": "https://posthog.com/docs/api"
    }

    # Validate API key format
    if not api_key:
        return {
            "success": False,
            "message": "API key is required",
            "details": {
                "error": "missing_api_key",
                "help": "Get your Personal API Key from PostHog",
                "links": POSTHOG_KEY_HELP
            }
        }

    # Check key format
    key_type = None
    if api_key.startswith("phx_"):
        key_type = "personal"
    elif api_key.startswith("phc_"):
        key_type = "project"
    else:
        return {
            "success": False,
            "message": "Invalid PostHog API key format. Key should start with 'phx_' (Personal API Key)",
            "details": {
                "error": "invalid_key_format",
                "provided_prefix": api_key[:4] + "..." if len(api_key) > 4 else "too_short",
                "expected_format": "phx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
                "help": "PostHog API keys start with 'phx_' (Personal) or 'phc_' (Project)",
                "links": POSTHOG_KEY_HELP
            }
        }

    # Project API keys (phc_) are for event capture, not API queries
    if key_type == "project":
        return {
            "success": False,
            "message": "Project API Key (phc_) detected. Please use a Personal API Key (phx_) instead.",
            "details": {
                "error": "wrong_key_type",
                "provided_type": "project_api_key",
                "required_type": "personal_api_key",
                "help": "For querying PostHog data, you need a Personal API Key (starts with phx_). "
                       "Project API Keys (phc_) are only for sending events.",
                "links": POSTHOG_KEY_HELP
            }
        }

    project_id = config.get("project_id", app_settings.posthog_project_id)
    host = config.get("host", app_settings.posthog_host)

    if not project_id:
        return {
            "success": False,
            "message": "Missing project_id in configuration",
            "details": {
                "error": "project_id_required",
                "help": "Find your Project ID in PostHog Project Settings",
                "links": POSTHOG_KEY_HELP
            }
        }

    try:
        # Test by fetching user info
        response = requests.get(
            f"{host}/api/users/@me/",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10
        )

        if response.status_code == 200:
            user_data = response.json()
            return {
                "success": True,
                "message": f"Connected as {user_data.get('email', 'unknown')}",
                "details": {
                    "email": user_data.get("email"),
                    "organization": user_data.get("organization", {}).get("name"),
                    "project_id": project_id,
                    "key_type": "personal_api_key",
                    "capabilities": ["query_data", "read_events", "read_persons", "manage_project"]
                }
            }
        elif response.status_code == 401:
            return {
                "success": False,
                "message": "Invalid API key or unauthorized. Please check your Personal API Key.",
                "details": {
                    "status_code": 401,
                    "help": "Your API key may be expired or revoked. Generate a new one in PostHog.",
                    "links": POSTHOG_KEY_HELP
                }
            }
        else:
            return {
                "success": False,
                "message": f"PostHog API returned {response.status_code}",
                "details": {
                    "status_code": response.status_code,
                    "links": POSTHOG_KEY_HELP
                }
            }

    except requests.Timeout:
        return {
            "success": False,
            "message": "Connection timed out",
            "details": {"error": "timeout", "host": host}
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Connection failed: {str(e)}",
            "details": {"error": str(e)}
        }


async def _test_attio_connection(api_key: str, config: dict) -> dict:
    """Test Attio connection."""
    import requests

    try:
        response = requests.get(
            "https://api.attio.com/v2/self",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10
        )

        if response.status_code == 200:
            data = response.json().get("data", {})
            workspace = data.get("workspace", {})
            return {
                "success": True,
                "message": f"Connected to workspace: {workspace.get('workspace_name', 'unknown')}",
                "details": {
                    "workspace_id": workspace.get("workspace_id"),
                    "workspace_name": workspace.get("workspace_name")
                }
            }
        elif response.status_code == 401:
            return {
                "success": False,
                "message": "Invalid API key or unauthorized",
                "details": {"status_code": 401}
            }
        else:
            return {
                "success": False,
                "message": f"Attio API returned {response.status_code}",
                "details": {"status_code": response.status_code}
            }

    except requests.Timeout:
        return {
            "success": False,
            "message": "Connection timed out",
            "details": {"error": "timeout"}
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Connection failed: {str(e)}",
            "details": {"error": str(e)}
        }


async def _test_stripe_connection(api_key: str) -> dict:
    """Test Stripe connection."""
    import requests

    try:
        response = requests.get(
            "https://api.stripe.com/v1/balance",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10
        )

        if response.status_code == 200:
            return {
                "success": True,
                "message": "Connected to Stripe",
                "details": {"status": "connected"}
            }
        elif response.status_code == 401:
            return {
                "success": False,
                "message": "Invalid API key",
                "details": {"status_code": 401}
            }
        else:
            return {
                "success": False,
                "message": f"Stripe API returned {response.status_code}",
                "details": {"status_code": response.status_code}
            }

    except Exception as e:
        return {
            "success": False,
            "message": f"Connection failed: {str(e)}",
            "details": {"error": str(e)}
        }


async def _test_apollo_connection(api_key: str) -> dict:
    """Test Apollo connection."""
    import requests

    try:
        response = requests.get(
            "https://api.apollo.io/v1/auth/health",
            headers={"x-api-key": api_key},
            timeout=10
        )

        if response.status_code == 200:
            return {
                "success": True,
                "message": "Connected to Apollo",
                "details": {"status": "connected"}
            }
        elif response.status_code == 401:
            return {
                "success": False,
                "message": "Invalid API key",
                "details": {"status_code": 401}
            }
        else:
            return {
                "success": False,
                "message": f"Apollo API returned {response.status_code}",
                "details": {"status_code": response.status_code}
            }

    except Exception as e:
        return {
            "success": False,
            "message": f"Connection failed: {str(e)}",
            "details": {"error": str(e)}
        }
