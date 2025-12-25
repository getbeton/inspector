"""
Attio CRM API endpoints.

Provides endpoints for:
- Object/attribute discovery
- Attribute auto-creation
- Manual sync trigger
- Sync status tracking
"""
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from pydantic import BaseModel

from app.config import settings

# Database setup
engine = create_engine(settings.database_url)

def get_db():
    """Get database session."""
    db = Session(bind=engine)
    try:
        yield db
    finally:
        db.close()
from app.core.config_manager import ConfigManager
from app.core.encryption import EncryptionService
from app.integrations.attio_client import (
    AttioClient,
    AttioError,
    AttioAuthError,
    get_attio_client
)
from app.services.attio_mapper import AttioFieldMapper, BETON_ATTRIBUTES
from app.services.attio_batch_writer import (
    AttioBatchWriter,
    AttioSyncTracker,
    WriteStatus
)
from app.models import Signal, Account

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/attio", tags=["attio"])


# ============================================
# Response Models
# ============================================

class AttioObjectResponse(BaseModel):
    id: str
    slug: str
    singular_noun: str
    plural_noun: str


class AttioAttributeResponse(BaseModel):
    id: str
    slug: str
    title: str
    type: str
    is_required: bool
    is_unique: bool
    is_writable: bool


class AttioAttributeSpecResponse(BaseModel):
    api_slug: str
    title: str
    type: str
    description: str


class SyncStatusResponse(BaseModel):
    status: str
    last_sync_started_at: Optional[str] = None
    last_sync_completed_at: Optional[str] = None
    records_processed: int = 0
    records_succeeded: int = 0
    records_failed: int = 0
    error: Optional[str] = None


class SyncTriggerResponse(BaseModel):
    message: str
    status: str
    sync_id: Optional[int]


class DiscoverAttributesResponse(BaseModel):
    message: str
    created_count: int
    existing_count: int
    attributes: List[str]


# ============================================
# Helper Functions
# ============================================

def get_attio_client_from_config(db: Session) -> AttioClient:
    """Get Attio client with configuration from database."""
    encryption = EncryptionService(settings.beton_encryption_key)
    config_manager = ConfigManager(db, encryption)
    return get_attio_client(db, config_manager)


def get_config_manager(db: Session) -> ConfigManager:
    """Get configuration manager."""
    encryption = EncryptionService(settings.beton_encryption_key)
    return ConfigManager(db, encryption)


# ============================================
# Endpoints
# ============================================

@router.get("/objects", response_model=List[AttioObjectResponse])
async def list_objects(db: Session = Depends(get_db)):
    """
    List all available Attio objects.

    Returns workspace objects like companies, people, etc.
    """
    try:
        client = get_attio_client_from_config(db)
        objects = client.discover_objects()

        return [
            AttioObjectResponse(
                id=obj.id,
                slug=obj.slug,
                singular_noun=obj.singular_noun,
                plural_noun=obj.plural_noun
            )
            for obj in objects
        ]
    except AttioAuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except AttioError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to list Attio objects: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list objects: {e}")


@router.get("/objects/{object_slug}/attributes", response_model=List[AttioAttributeResponse])
async def list_object_attributes(
    object_slug: str,
    db: Session = Depends(get_db)
):
    """
    List all attributes for an Attio object.

    Args:
        object_slug: The object slug (e.g., "companies").
    """
    try:
        client = get_attio_client_from_config(db)
        attributes = client.get_object_attributes(object_slug)

        return [
            AttioAttributeResponse(
                id=attr.id,
                slug=attr.slug,
                title=attr.title,
                type=attr.type,
                is_required=attr.is_required,
                is_unique=attr.is_unique,
                is_writable=attr.is_writable
            )
            for attr in attributes
        ]
    except AttioAuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except AttioError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to list attributes for {object_slug}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list attributes: {e}")


@router.get("/beton-attributes", response_model=List[AttioAttributeSpecResponse])
async def list_beton_attributes():
    """
    List Beton-managed attributes that will be created in Attio.

    Returns the specification for all attributes Beton manages.
    """
    return [
        AttioAttributeSpecResponse(
            api_slug=attr.api_slug,
            title=attr.title,
            type=attr.type,
            description=attr.description
        )
        for attr in BETON_ATTRIBUTES
    ]


@router.post("/discover-attributes", response_model=DiscoverAttributesResponse)
async def discover_and_create_attributes(
    object_slug: str = "companies",
    db: Session = Depends(get_db)
):
    """
    Auto-discover and create Beton attributes on an Attio object.

    Creates any missing Beton-managed attributes and returns the result.

    Args:
        object_slug: The object slug to create attributes on (default: "companies").
    """
    try:
        client = get_attio_client_from_config(db)
        config_manager = get_config_manager(db)

        mapper = AttioFieldMapper(db, client, object_slug)

        # Get existing attributes before
        existing_before = set(attr.slug for attr in client.get_object_attributes(object_slug))

        # Ensure all Beton attributes exist
        created_attrs = mapper.ensure_beton_attributes()

        # Calculate what was created vs already existed
        created_slugs = []
        existing_slugs = []

        for slug, attr in created_attrs.items():
            if slug in existing_before:
                existing_slugs.append(slug)
            else:
                created_slugs.append(slug)

        return DiscoverAttributesResponse(
            message=f"Successfully processed {len(created_attrs)} Beton attributes",
            created_count=len(created_slugs),
            existing_count=len(existing_slugs),
            attributes=list(created_attrs.keys())
        )

    except AttioAuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except AttioError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to discover/create attributes: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create attributes: {e}")


@router.get("/sync-status", response_model=SyncStatusResponse)
async def get_sync_status(db: Session = Depends(get_db)):
    """
    Get the current Attio sync status.

    Returns information about the last sync operation.
    """
    tracker = AttioSyncTracker(db)
    status = tracker.get_sync_status()

    return SyncStatusResponse(**status)


@router.post("/sync-now", response_model=SyncTriggerResponse)
async def trigger_sync(
    background_tasks: BackgroundTasks,
    object_slug: str = "companies",
    limit: int = 1000,
    db: Session = Depends(get_db)
):
    """
    Trigger a manual sync of signals to Attio.

    Runs the sync in the background and returns immediately.

    Args:
        object_slug: The Attio object to sync to (default: "companies").
        limit: Maximum number of signals to sync (default: 1000).
    """
    try:
        # Check if Attio is configured
        config_manager = get_config_manager(db)
        attio_config = config_manager.get_integration("attio")

        if not attio_config:
            raise HTTPException(
                status_code=400,
                detail="Attio integration not configured. Please configure Attio in Settings."
            )

        # Check if sync is already in progress
        tracker = AttioSyncTracker(db)
        current_status = tracker.get_sync_status()

        if current_status.get("status") == "in_progress":
            raise HTTPException(
                status_code=409,
                detail="A sync is already in progress. Please wait for it to complete."
            )

        # Start sync tracking
        state = tracker.start_sync()

        # Run sync in background
        background_tasks.add_task(
            run_attio_sync,
            db_url=str(settings.database_url),
            encryption_key=settings.beton_encryption_key,
            object_slug=object_slug,
            limit=limit
        )

        return SyncTriggerResponse(
            message="Sync started successfully",
            status="in_progress",
            sync_id=state.id
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to trigger sync: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to trigger sync: {e}")


def run_attio_sync(
    db_url: str,
    encryption_key: str,
    object_slug: str = "companies",
    limit: int = 1000
):
    """
    Background task to run Attio sync.

    Creates its own database session for the background task.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    # Create new database session for background task
    engine = create_engine(db_url)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    try:
        logger.info(f"Starting Attio sync for {object_slug} (limit: {limit})")

        # Initialize services
        encryption = EncryptionService(encryption_key)
        config_manager = ConfigManager(db, encryption)
        client = get_attio_client(db, config_manager)
        mapper = AttioFieldMapper(db, client, object_slug)
        tracker = AttioSyncTracker(db)

        # Ensure Beton attributes exist
        mapper.ensure_beton_attributes()

        # Get signals to sync (recent signals with accounts)
        signals = db.query(Signal).join(Account).filter(
            Account.domain.isnot(None)
        ).order_by(Signal.timestamp.desc()).limit(limit).all()

        if not signals:
            logger.info("No signals to sync")
            tracker.update_progress(0, 0, 0)
            tracker.complete_sync(
                type("BatchResult", (), {
                    "status": WriteStatus.SUCCESS,
                    "total": 0,
                    "succeeded": 0,
                    "failed": 0,
                    "errors_by_type": {}
                })()
            )
            return

        logger.info(f"Found {len(signals)} signals to sync")

        # Transform signals to Attio records
        records = mapper.transform_signals(signals)

        if not records:
            logger.warning("No records to write (signals may lack domain)")
            tracker.update_progress(0, 0, 0)
            tracker.complete_sync(
                type("BatchResult", (), {
                    "status": WriteStatus.SUCCESS,
                    "total": 0,
                    "succeeded": 0,
                    "failed": 0,
                    "errors_by_type": {}
                })()
            )
            return

        # Write to Attio
        writer = AttioBatchWriter(
            attio_client=client,
            max_concurrency=5,
            batch_size=100,
            object_slug=object_slug
        )

        def progress_callback(current, total):
            succeeded = sum(1 for r in writer._results if r.success) if hasattr(writer, '_results') else 0
            failed = current - succeeded
            tracker.update_progress(current, succeeded, failed)

        result = writer.write_in_batches(records, progress_callback=progress_callback)

        # Complete sync
        tracker.complete_sync(result)

        logger.info(
            f"Attio sync completed: {result.succeeded}/{result.total} succeeded "
            f"({result.success_rate:.1f}%)"
        )

    except Exception as e:
        logger.error(f"Attio sync failed: {e}")
        tracker = AttioSyncTracker(db)
        tracker.fail_sync(str(e))
        raise
    finally:
        db.close()


@router.get("/health")
async def attio_health_check(db: Session = Depends(get_db)):
    """
    Check Attio integration health.

    Returns connection status and workspace info.
    """
    try:
        client = get_attio_client_from_config(db)
        health = client.health_check()

        return {
            "healthy": health["healthy"],
            "status": health["status"],
            "workspace_name": health.get("workspace_name"),
            "user_email": health.get("user_email"),
            "error": health.get("error")
        }
    except AttioAuthError as e:
        return {
            "healthy": False,
            "status": "auth_error",
            "workspace_name": None,
            "user_email": None,
            "error": str(e)
        }
    except Exception as e:
        return {
            "healthy": False,
            "status": "error",
            "workspace_name": None,
            "user_email": None,
            "error": str(e)
        }


# ============================================
# Attio-to-PostHog CDP Sync Endpoints
# ============================================

class CDPSyncResponse(BaseModel):
    """Response for Attio-to-PostHog CDP sync."""
    success: bool
    message: str
    results: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


@router.post("/sync-to-cdp", response_model=CDPSyncResponse)
async def sync_attio_to_posthog_cdp(
    entity_type: str = "all",
    limit: int = 500,
    db: Session = Depends(get_db)
):
    """
    Sync Attio CRM data to PostHog CDP (Customer Data Platform).

    Syncs data to proper PostHog entities:
    - Companies → PostHog Groups (via $group_identify)
    - People → PostHog Persons (via $identify)
    - Deals → Local database for Data Warehouse queries

    This ensures CRM data is stored in correct PostHog CDP entities,
    NOT as regular events.

    Args:
        entity_type: Type to sync - "groups" (companies), "persons" (people),
                     "deals", or "all" (default).
        limit: Maximum records per type (default: 500).
    """
    from app.services.attio_cdp_sync import AttioToCDPSync

    try:
        # Check if both integrations are configured
        config_manager = get_config_manager(db)

        attio_config = config_manager.get_integration("attio")
        if not attio_config:
            raise HTTPException(
                status_code=400,
                detail="Attio integration not configured. Please configure Attio in Settings."
            )

        posthog_config = config_manager.get_integration("posthog")
        if not posthog_config:
            raise HTTPException(
                status_code=400,
                detail="PostHog integration not configured. Please configure PostHog in Settings."
            )

        # Validate PostHog key type for CDP operations
        api_key = posthog_config.get("api_key", "")
        if api_key.startswith("phx_"):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Personal API Key (phx_) cannot be used for CDP sync. "
                    "Please configure a Project API Key from: "
                    "https://app.posthog.com/project/settings"
                )
            )

        # Create CDP sync service
        sync_service = AttioToCDPSync(db)

        # Run sync based on entity type
        if entity_type == "all":
            results = sync_service.sync_all(limit)
            sync_service.update_sync_state(results)

            # Format results for response
            formatted_results = {
                ent_type: {
                    "success": result.success,
                    "total_records": result.total_records,
                    "synced": result.synced,
                    "errors": result.errors,
                    "duration_seconds": round(result.duration_seconds, 2),
                    "error_message": result.error_message
                }
                for ent_type, result in results.items()
            }

            total_synced = sum(r.synced for r in results.values())
            return CDPSyncResponse(
                success=all(r.success for r in results.values()),
                message=f"Synced {total_synced} records to PostHog CDP",
                results=formatted_results
            )

        elif entity_type == "groups":
            result = sync_service.sync_companies_to_groups(limit)
        elif entity_type == "persons":
            result = sync_service.sync_people_to_persons(limit)
        elif entity_type == "deals":
            result = sync_service.sync_deals_to_warehouse(limit)
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown entity type: {entity_type}. Use 'groups', 'persons', 'deals', or 'all'."
            )

        return CDPSyncResponse(
            success=result.success,
            message=f"Synced {result.synced} {entity_type} to PostHog CDP",
            results={
                entity_type: {
                    "success": result.success,
                    "total_records": result.total_records,
                    "synced": result.synced,
                    "errors": result.errors,
                    "duration_seconds": round(result.duration_seconds, 2),
                    "error_message": result.error_message
                }
            },
            error=result.error_message
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Attio-to-PostHog CDP sync failed: {e}")
        return CDPSyncResponse(
            success=False,
            message="CDP sync failed",
            error=str(e)
        )


@router.get("/sync-to-cdp/status")
async def get_cdp_sync_status(db: Session = Depends(get_db)):
    """
    Get status of Attio-to-PostHog CDP sync.

    Returns information about the last CDP sync operation.
    """
    from app.models import SyncState

    state = db.query(SyncState).filter(
        SyncState.integration_name == "attio_cdp"
    ).first()

    if state is None:
        return {
            "status": "never_synced",
            "last_sync_at": None,
            "records_processed": 0,
            "records_synced": 0,
            "errors": 0,
            "entity_types": {
                "groups": "Companies → PostHog Groups",
                "persons": "People → PostHog Persons",
                "deals": "Deals → Data Warehouse"
            }
        }

    return {
        "status": state.status,
        "last_sync_started_at": state.last_sync_started_at.isoformat() if state.last_sync_started_at else None,
        "last_sync_completed_at": state.last_sync_completed_at.isoformat() if state.last_sync_completed_at else None,
        "records_processed": state.records_processed,
        "records_synced": state.records_succeeded,
        "errors": state.records_failed,
        "error_summary": state.error_summary,
        "entity_types": {
            "groups": "Companies → PostHog Groups",
            "persons": "People → PostHog Persons",
            "deals": "Deals → Data Warehouse"
        }
    }


# ============================================
# Signal-to-Attio Deal Pipeline Endpoints
# ============================================

class SignalPipelineResponse(BaseModel):
    """Response for signal-to-Attio pipeline."""
    success: bool
    message: str
    total_signals: int = 0
    deals_created: int = 0
    companies_matched: int = 0
    errors: int = 0
    duration_seconds: float = 0.0
    error: Optional[str] = None


@router.post("/pipe-signals", response_model=SignalPipelineResponse)
async def pipe_signals_to_attio(
    signal_types: Optional[List[str]] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Pipe detected signals to Attio as deals.

    Creates deals in Attio for each signal:
    - Matches signals to Attio companies via domain
    - Creates deal with signal data (type, value, source)
    - Adds note with full signal details

    This enables sales teams to act on signals directly from Attio.

    Args:
        signal_types: Optional list of signal types to pipe (e.g., ["usage_spike", "billing_increase"]).
        limit: Maximum signals to process (default: 100).
    """
    from app.services.signal_to_attio import SignalToAttioPipeline

    try:
        # Check if Attio is configured
        config_manager = get_config_manager(db)

        attio_config = config_manager.get_integration("attio")
        if not attio_config:
            raise HTTPException(
                status_code=400,
                detail="Attio integration not configured. Please configure Attio in Settings."
            )

        # Create pipeline and run
        pipeline = SignalToAttioPipeline(db)
        result = pipeline.pipe_signals(
            signal_types=signal_types,
            limit=limit
        )
        pipeline.update_sync_state(result)

        return SignalPipelineResponse(
            success=result.success,
            message=f"Piped {result.deals_created} signals as Attio deals",
            total_signals=result.total_signals,
            deals_created=result.deals_created,
            companies_matched=result.companies_matched,
            errors=result.errors,
            duration_seconds=round(result.duration_seconds, 2),
            error=result.error_message
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Signal pipeline failed: {e}")
        return SignalPipelineResponse(
            success=False,
            message="Signal pipeline failed",
            error=str(e)
        )


@router.get("/pipe-signals/status")
async def get_signal_pipeline_status(db: Session = Depends(get_db)):
    """
    Get status of signal-to-Attio pipeline.

    Returns information about the last pipeline run.
    """
    from app.models import SyncState

    state = db.query(SyncState).filter(
        SyncState.integration_name == "signal_to_attio"
    ).first()

    if state is None:
        return {
            "status": "never_run",
            "last_run_at": None,
            "signals_processed": 0,
            "deals_created": 0,
            "errors": 0,
            "description": "Pipes signals to Attio as deals for sales teams"
        }

    return {
        "status": state.status,
        "last_run_started_at": state.last_sync_started_at.isoformat() if state.last_sync_started_at else None,
        "last_run_completed_at": state.last_sync_completed_at.isoformat() if state.last_sync_completed_at else None,
        "signals_processed": state.records_processed,
        "deals_created": state.records_succeeded,
        "errors": state.records_failed,
        "error_summary": state.error_summary,
        "description": "Pipes signals to Attio as deals for sales teams"
    }
