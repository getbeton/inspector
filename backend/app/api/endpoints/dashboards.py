"""
PostHog Dashboard Provisioning API endpoints.

Provides endpoints for:
- Dashboard provisioning (idempotent creation)
- Dashboard registry management
- Dashboard deletion
"""
import logging
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from pydantic import BaseModel

from app.config import settings
from app.core.config_manager import ConfigManager
from app.core.encryption import EncryptionService
from app.integrations.posthog_query_client import get_posthog_query_client
from app.services.dashboard_provisioner import (
    DashboardProvisioner,
    get_available_dashboard_types,
    get_dashboard_spec,
    ProvisioningResult
)

logger = logging.getLogger(__name__)

# Database setup
engine = create_engine(settings.database_url)


def get_db():
    """Get database session."""
    db = Session(bind=engine)
    try:
        yield db
    finally:
        db.close()


def get_config_manager(db: Session) -> ConfigManager:
    """Get configuration manager."""
    encryption = EncryptionService(settings.beton_encryption_key)
    return ConfigManager(db, encryption)


router = APIRouter(prefix="/dashboards", tags=["dashboards"])


# ============================================
# Response Models
# ============================================

class DashboardTypeResponse(BaseModel):
    """Available dashboard type info."""
    type: str
    name: str
    description: str
    folder: str
    insights_count: int
    tags: List[str]


class ProvisionResultResponse(BaseModel):
    """Result of provisioning a dashboard."""
    success: bool
    dashboard_type: str
    dashboard_id: Optional[str] = None
    dashboard_url: Optional[str] = None
    insights_created: int = 0
    message: str
    error: Optional[str] = None


class ProvisionAllResponse(BaseModel):
    """Result of provisioning all dashboards."""
    success: bool
    total: int
    succeeded: int
    failed: int
    results: Dict[str, ProvisionResultResponse]


class RegistryEntryResponse(BaseModel):
    """Registry entry for a provisioned dashboard."""
    beton_type: str
    posthog_id: str
    url: Optional[str] = None
    folder: Optional[str] = None
    version: str
    insights_count: int
    created_at: Optional[str] = None
    last_synced_at: Optional[str] = None


# ============================================
# Endpoints
# ============================================

@router.get("/types", response_model=List[DashboardTypeResponse])
async def list_dashboard_types():
    """
    List all available dashboard types for provisioning.

    Returns the specification for each dashboard type.
    """
    types = []
    for type_name in get_available_dashboard_types():
        spec = get_dashboard_spec(type_name)
        if spec:
            types.append(DashboardTypeResponse(
                type=type_name,
                name=spec.name,
                description=spec.description,
                folder=spec.folder,
                insights_count=len(spec.insights),
                tags=spec.tags
            ))
    return types


@router.post("/provision/{dashboard_type}", response_model=ProvisionResultResponse)
async def provision_dashboard(
    dashboard_type: str,
    force_recreate: bool = False,
    db: Session = Depends(get_db)
):
    """
    Provision a specific dashboard type in PostHog.

    Creates the dashboard idempotently - if it already exists,
    returns the existing dashboard info.

    Args:
        dashboard_type: Type of dashboard to provision (e.g., "signals_overview").
        force_recreate: If True, recreate even if dashboard exists.
    """
    # Validate dashboard type
    if dashboard_type not in get_available_dashboard_types():
        raise HTTPException(
            status_code=400,
            detail=f"Unknown dashboard type: {dashboard_type}. Available: {get_available_dashboard_types()}"
        )

    # Check if PostHog is configured
    config_manager = get_config_manager(db)
    posthog_config = config_manager.get_integration("posthog")

    if not posthog_config:
        raise HTTPException(
            status_code=400,
            detail="PostHog integration not configured. Please configure PostHog in Settings."
        )

    try:
        # Create provisioner and provision
        posthog_client = get_posthog_query_client(db)
        provisioner = DashboardProvisioner(db, posthog_client)

        result = provisioner.provision_dashboard(dashboard_type, force_recreate)

        return ProvisionResultResponse(
            success=result.success,
            dashboard_type=dashboard_type,
            dashboard_id=result.dashboard_id,
            dashboard_url=result.dashboard_url,
            insights_created=result.insights_created,
            message=result.message,
            error=result.error
        )

    except Exception as e:
        logger.error(f"Failed to provision dashboard {dashboard_type}: {e}")
        return ProvisionResultResponse(
            success=False,
            dashboard_type=dashboard_type,
            message="Provisioning failed",
            error=str(e)
        )


@router.post("/provision-all", response_model=ProvisionAllResponse)
async def provision_all_dashboards(
    force_recreate: bool = False,
    db: Session = Depends(get_db)
):
    """
    Provision all available dashboards in PostHog.

    Creates all Beton-managed dashboards idempotently.

    Args:
        force_recreate: If True, recreate all dashboards.
    """
    # Check if PostHog is configured
    config_manager = get_config_manager(db)
    posthog_config = config_manager.get_integration("posthog")

    if not posthog_config:
        raise HTTPException(
            status_code=400,
            detail="PostHog integration not configured. Please configure PostHog in Settings."
        )

    try:
        posthog_client = get_posthog_query_client(db)
        provisioner = DashboardProvisioner(db, posthog_client)

        results = provisioner.provision_all(force_recreate)

        # Format results
        formatted = {}
        succeeded = 0
        failed = 0

        for dashboard_type, result in results.items():
            formatted[dashboard_type] = ProvisionResultResponse(
                success=result.success,
                dashboard_type=dashboard_type,
                dashboard_id=result.dashboard_id,
                dashboard_url=result.dashboard_url,
                insights_created=result.insights_created,
                message=result.message,
                error=result.error
            )
            if result.success:
                succeeded += 1
            else:
                failed += 1

        return ProvisionAllResponse(
            success=failed == 0,
            total=len(results),
            succeeded=succeeded,
            failed=failed,
            results=formatted
        )

    except Exception as e:
        logger.error(f"Failed to provision dashboards: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to provision dashboards: {e}"
        )


@router.get("/registry", response_model=List[RegistryEntryResponse])
async def get_dashboard_registry(db: Session = Depends(get_db)):
    """
    Get all registered (provisioned) dashboards.

    Returns tracking info for all Beton-managed dashboards.
    """
    try:
        posthog_client = get_posthog_query_client(db)
        provisioner = DashboardProvisioner(db, posthog_client)

        entries = provisioner.get_registry()

        return [
            RegistryEntryResponse(
                beton_type=e["beton_type"],
                posthog_id=e["posthog_id"],
                url=e.get("url"),
                folder=e.get("folder"),
                version=e.get("version", "1.0.0"),
                insights_count=e.get("insights_count", 0),
                created_at=e.get("created_at"),
                last_synced_at=e.get("last_synced_at")
            )
            for e in entries
        ]

    except Exception as e:
        logger.error(f"Failed to get registry: {e}")
        return []


@router.delete("/{dashboard_type}")
async def delete_dashboard(
    dashboard_type: str,
    db: Session = Depends(get_db)
):
    """
    Delete a provisioned dashboard from PostHog and registry.

    Args:
        dashboard_type: Type of dashboard to delete.
    """
    try:
        posthog_client = get_posthog_query_client(db)
        provisioner = DashboardProvisioner(db, posthog_client)

        success = provisioner.delete_dashboard(dashboard_type)

        if success:
            return {"success": True, "message": f"Deleted dashboard: {dashboard_type}"}
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Dashboard not found or could not be deleted: {dashboard_type}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete dashboard {dashboard_type}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete dashboard: {e}"
        )


@router.get("/{dashboard_type}/url")
async def get_dashboard_url(
    dashboard_type: str,
    db: Session = Depends(get_db)
):
    """
    Get the PostHog URL for a provisioned dashboard.

    Args:
        dashboard_type: Type of dashboard.
    """
    from app.models import DashboardRegistry

    entry = db.query(DashboardRegistry).filter(
        DashboardRegistry.beton_dashboard_type == dashboard_type
    ).first()

    if not entry:
        raise HTTPException(
            status_code=404,
            detail=f"Dashboard not provisioned: {dashboard_type}"
        )

    return {
        "dashboard_type": dashboard_type,
        "posthog_id": entry.posthog_dashboard_id,
        "url": entry.posthog_dashboard_url
    }
