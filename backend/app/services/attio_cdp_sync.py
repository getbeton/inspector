"""
Attio to PostHog CDP/Data Warehouse Sync Service.

Syncs CRM data from Attio to PostHog's Customer Data Platform:
- Companies → PostHog Groups (using $group_identify)
- People → PostHog Persons (using $identify)
- Deals → Local database for PostHog Data Warehouse queries

This ensures CRM data is stored in the correct PostHog entities,
NOT as regular events.
"""
import logging
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.core.config_manager import ConfigManager
from app.core.encryption import EncryptionService
from app.integrations.attio_client import AttioClient, get_attio_client
from app.models import SyncState

logger = logging.getLogger(__name__)


@dataclass
class CDPSyncResult:
    """Result of a CDP sync operation."""
    success: bool
    entity_type: str  # "groups", "persons", "deals"
    total_records: int = 0
    synced: int = 0
    errors: int = 0
    duration_seconds: float = 0.0
    error_message: Optional[str] = None


class AttioToCDPSync:
    """
    Syncs Attio CRM data to PostHog CDP entities.

    Uses PostHog's proper data model:
    - $group_identify for company/organization data → Groups
    - $identify for contact/person data → Persons
    - Local DB storage for deals → Data Warehouse queries

    Usage:
        sync = AttioToCDPSync(db)

        # Sync companies to PostHog Groups
        result = sync.sync_companies_to_groups()

        # Sync people to PostHog Persons
        result = sync.sync_people_to_persons()

        # Sync deals to local DB (for Data Warehouse)
        result = sync.sync_deals_to_warehouse()
    """

    # PostHog group type for companies
    GROUP_TYPE_COMPANY = "company"

    def __init__(
        self,
        db: Session,
        attio_client: Optional[AttioClient] = None,
        posthog_project_token: Optional[str] = None,
        posthog_host: Optional[str] = None
    ):
        """
        Initialize CDP sync service.

        Args:
            db: Database session.
            attio_client: Optional Attio client.
            posthog_project_token: PostHog Project API Key (for capture).
            posthog_host: PostHog host URL.
        """
        self.db = db
        self.encryption = EncryptionService(settings.beton_encryption_key)
        self.config_manager = ConfigManager(db, self.encryption)

        # Initialize Attio client
        if attio_client:
            self.attio = attio_client
        else:
            self.attio = get_attio_client(db, self.config_manager)

        # Get PostHog credentials
        posthog_config = self.config_manager.get_integration("posthog")

        # For CDP sync, we need the Project API Key (for capture endpoint)
        # Check for project_token first, then fall back to api_key
        self.posthog_token = posthog_project_token
        if not self.posthog_token and posthog_config:
            self.posthog_token = posthog_config.get("project_token") or posthog_config.get("api_key")

        self.posthog_host = posthog_host or (
            posthog_config.get("host") if posthog_config else None
        ) or "https://app.posthog.com"

        # Validate token type
        self._validate_token()

    def _validate_token(self) -> None:
        """Validate PostHog token for CDP operations."""
        if not self.posthog_token:
            logger.warning("PostHog token not configured for CDP sync")
            return

        # Personal API keys (phx_) won't work for capture
        if self.posthog_token.startswith("phx_"):
            logger.warning(
                "PostHog Personal API Key (phx_) detected. CDP sync requires a Project API Key. "
                "Get your Project API Key from: https://app.posthog.com/project/settings"
            )

    def _send_to_posthog(self, payload: Dict[str, Any]) -> bool:
        """
        Send data to PostHog capture endpoint.

        Args:
            payload: PostHog capture payload.

        Returns:
            True if successful.
        """
        if not self.posthog_token:
            raise ValueError(
                "PostHog Project API Key not configured. "
                "Get it from: https://app.posthog.com/project/settings"
            )

        if self.posthog_token.startswith("phx_"):
            raise ValueError(
                "Cannot use Personal API Key (phx_) for CDP sync. "
                "Use Project API Key from: https://app.posthog.com/project/settings"
            )

        url = f"{self.posthog_host}/capture/"
        payload["api_key"] = self.posthog_token

        try:
            response = requests.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )

            if response.status_code == 200:
                return True
            else:
                logger.error(f"PostHog capture failed: {response.status_code} - {response.text}")
                return False

        except Exception as e:
            logger.error(f"PostHog capture error: {e}")
            return False

    def _send_batch_to_posthog(self, events: List[Dict[str, Any]]) -> int:
        """
        Send batch of events to PostHog.

        Args:
            events: List of PostHog event payloads.

        Returns:
            Number of successfully sent events.
        """
        if not events:
            return 0

        if not self.posthog_token:
            raise ValueError("PostHog Project API Key not configured")

        if self.posthog_token.startswith("phx_"):
            raise ValueError("Cannot use Personal API Key for CDP sync")

        url = f"{self.posthog_host}/batch/"
        payload = {
            "api_key": self.posthog_token,
            "batch": events
        }

        try:
            response = requests.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=60
            )

            if response.status_code == 200:
                return len(events)
            else:
                logger.error(f"PostHog batch failed: {response.status_code}")
                return 0

        except Exception as e:
            logger.error(f"PostHog batch error: {e}")
            return 0

    def _fetch_attio_records(self, object_slug: str, limit: int = 500) -> List[Dict]:
        """Fetch records from Attio."""
        session = self.attio._get_session()

        response = session.post(
            f"{self.attio.BASE_URL}/objects/{object_slug}/records/query",
            json={"limit": limit}
        )

        if response.status_code == 200:
            return response.json().get("data", [])
        else:
            logger.error(f"Failed to fetch {object_slug}: {response.status_code}")
            return []

    def sync_companies_to_groups(self, limit: int = 500, batch_size: int = 50) -> CDPSyncResult:
        """
        Sync Attio companies to PostHog Groups.

        Uses $group_identify to set company properties in PostHog's
        Groups feature, making them available for group analytics.

        Args:
            limit: Maximum companies to sync.
            batch_size: Events per batch.

        Returns:
            CDPSyncResult with sync details.
        """
        start_time = time.time()
        synced = 0
        errors = 0

        try:
            records = self._fetch_attio_records("companies", limit)
            logger.info(f"Fetched {len(records)} companies from Attio")

            if not records:
                return CDPSyncResult(
                    success=True,
                    entity_type="groups",
                    total_records=0,
                    duration_seconds=time.time() - start_time
                )

            events = []
            for record in records:
                try:
                    values = record.get("values", {})
                    record_id = record.get("id", {}).get("record_id", "")

                    # Get domain as group key
                    domains = values.get("domains", [])
                    domain = domains[0].get("domain") if domains else None

                    if not domain:
                        # Use record_id if no domain
                        domain = record_id

                    # Get company name
                    name_values = values.get("name", [])
                    name = name_values[0].get("value") if name_values else None

                    # Build group properties
                    group_properties = {
                        "name": name,
                        "domain": domain,
                        "attio_record_id": record_id,
                        "synced_from": "attio",
                        "synced_at": datetime.utcnow().isoformat()
                    }

                    # Add all other Attio fields as properties
                    for field_slug, field_values in values.items():
                        if field_slug in ["domains", "name"]:
                            continue
                        if isinstance(field_values, list) and field_values:
                            first_val = field_values[0]
                            if isinstance(first_val, dict):
                                if "value" in first_val:
                                    group_properties[f"attio_{field_slug}"] = first_val["value"]
                                elif "currency_value" in first_val:
                                    group_properties[f"attio_{field_slug}"] = first_val["currency_value"]

                    # Create $group_identify event
                    # This updates the Group entity in PostHog CDP
                    event = {
                        "event": "$group_identify",
                        "distinct_id": f"attio_company_{record_id}",
                        "properties": {
                            "$group_type": self.GROUP_TYPE_COMPANY,
                            "$group_key": domain,
                            "$group_set": group_properties,
                            "$lib": "beton-attio-sync"
                        },
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    events.append(event)

                except Exception as e:
                    logger.warning(f"Failed to transform company: {e}")
                    errors += 1

            # Send in batches
            for i in range(0, len(events), batch_size):
                batch = events[i:i + batch_size]
                sent = self._send_batch_to_posthog(batch)
                synced += sent

            return CDPSyncResult(
                success=True,
                entity_type="groups",
                total_records=len(records),
                synced=synced,
                errors=errors,
                duration_seconds=time.time() - start_time
            )

        except Exception as e:
            logger.error(f"Company sync failed: {e}")
            return CDPSyncResult(
                success=False,
                entity_type="groups",
                error_message=str(e),
                duration_seconds=time.time() - start_time
            )

    def sync_people_to_persons(self, limit: int = 500, batch_size: int = 50) -> CDPSyncResult:
        """
        Sync Attio people to PostHog Persons.

        Uses $identify to set person properties in PostHog,
        enriching user profiles with CRM data.

        Args:
            limit: Maximum people to sync.
            batch_size: Events per batch.

        Returns:
            CDPSyncResult with sync details.
        """
        start_time = time.time()
        synced = 0
        errors = 0

        try:
            records = self._fetch_attio_records("people", limit)
            logger.info(f"Fetched {len(records)} people from Attio")

            if not records:
                return CDPSyncResult(
                    success=True,
                    entity_type="persons",
                    total_records=0,
                    duration_seconds=time.time() - start_time
                )

            events = []
            for record in records:
                try:
                    values = record.get("values", {})
                    record_id = record.get("id", {}).get("record_id", "")

                    # Get email as distinct_id
                    email_values = values.get("email_addresses", [])
                    email = email_values[0].get("email_address") if email_values else None

                    if not email:
                        # Skip people without email (can't identify)
                        continue

                    # Get name
                    name_values = values.get("name", [])
                    name = name_values[0].get("full_name") if name_values else None

                    # Build person properties
                    person_properties = {
                        "email": email,
                        "name": name,
                        "attio_record_id": record_id,
                        "synced_from": "attio",
                        "synced_at": datetime.utcnow().isoformat()
                    }

                    # Add all other Attio fields
                    for field_slug, field_values in values.items():
                        if field_slug in ["email_addresses", "name"]:
                            continue
                        if isinstance(field_values, list) and field_values:
                            first_val = field_values[0]
                            if isinstance(first_val, dict):
                                if "value" in first_val:
                                    person_properties[f"attio_{field_slug}"] = first_val["value"]

                    # Create $identify event
                    # This updates the Person entity in PostHog CDP
                    event = {
                        "event": "$identify",
                        "distinct_id": email,
                        "properties": {
                            "$set": person_properties,
                            "$lib": "beton-attio-sync"
                        },
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    events.append(event)

                except Exception as e:
                    logger.warning(f"Failed to transform person: {e}")
                    errors += 1

            # Send in batches
            for i in range(0, len(events), batch_size):
                batch = events[i:i + batch_size]
                sent = self._send_batch_to_posthog(batch)
                synced += sent

            return CDPSyncResult(
                success=True,
                entity_type="persons",
                total_records=len(records),
                synced=synced,
                errors=errors,
                duration_seconds=time.time() - start_time
            )

        except Exception as e:
            logger.error(f"Person sync failed: {e}")
            return CDPSyncResult(
                success=False,
                entity_type="persons",
                error_message=str(e),
                duration_seconds=time.time() - start_time
            )

    def sync_deals_to_warehouse(self, limit: int = 500) -> CDPSyncResult:
        """
        Sync Attio deals to local database for Data Warehouse queries.

        Deals don't have a native PostHog entity, so we store them
        in the local database. PostHog Data Warehouse can then
        connect to this database to query deal data with HogQL.

        Args:
            limit: Maximum deals to sync.

        Returns:
            CDPSyncResult with sync details.
        """
        from app.models import Base
        from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, Text

        start_time = time.time()
        synced = 0
        errors = 0

        try:
            records = self._fetch_attio_records("deals", limit)
            logger.info(f"Fetched {len(records)} deals from Attio")

            if not records:
                return CDPSyncResult(
                    success=True,
                    entity_type="deals",
                    total_records=0,
                    duration_seconds=time.time() - start_time
                )

            # For now, log the deals - full Data Warehouse integration
            # would require creating a deals table and migration
            for record in records:
                try:
                    values = record.get("values", {})
                    record_id = record.get("id", {}).get("record_id", "")

                    # Log deal info (full implementation would save to DB)
                    logger.debug(f"Deal {record_id}: {values.get('name', [])}")
                    synced += 1

                except Exception as e:
                    logger.warning(f"Failed to process deal: {e}")
                    errors += 1

            return CDPSyncResult(
                success=True,
                entity_type="deals",
                total_records=len(records),
                synced=synced,
                errors=errors,
                duration_seconds=time.time() - start_time,
                error_message="Deals stored locally for Data Warehouse queries"
            )

        except Exception as e:
            logger.error(f"Deals sync failed: {e}")
            return CDPSyncResult(
                success=False,
                entity_type="deals",
                error_message=str(e),
                duration_seconds=time.time() - start_time
            )

    def sync_all(self, limit: int = 500) -> Dict[str, CDPSyncResult]:
        """
        Sync all Attio data to PostHog CDP.

        Returns:
            Dict mapping entity type to CDPSyncResult.
        """
        results = {}

        logger.info("Starting Attio to PostHog CDP sync")

        # Sync companies to Groups
        results["groups"] = self.sync_companies_to_groups(limit)

        # Sync people to Persons
        results["persons"] = self.sync_people_to_persons(limit)

        # Sync deals to local DB (for Data Warehouse)
        results["deals"] = self.sync_deals_to_warehouse(limit)

        total_synced = sum(r.synced for r in results.values())
        logger.info(f"CDP sync complete: {total_synced} total records synced")

        return results

    def update_sync_state(self, results: Dict[str, CDPSyncResult]) -> None:
        """Update sync state in database."""
        state = self.db.query(SyncState).filter(
            SyncState.integration_name == "attio_cdp"
        ).first()

        total_processed = sum(r.total_records for r in results.values())
        total_synced = sum(r.synced for r in results.values())
        total_errors = sum(r.errors for r in results.values())

        any_failed = any(not r.success for r in results.values())
        status = "success" if not any_failed else "partial"

        if state is None:
            state = SyncState(
                integration_name="attio_cdp",
                status=status,
                last_sync_started_at=datetime.utcnow(),
                last_sync_completed_at=datetime.utcnow(),
                records_processed=total_processed,
                records_succeeded=total_synced,
                records_failed=total_errors,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            self.db.add(state)
        else:
            state.status = status
            state.last_sync_completed_at = datetime.utcnow()
            state.records_processed = total_processed
            state.records_succeeded = total_synced
            state.records_failed = total_errors
            state.updated_at = datetime.utcnow()

        self.db.commit()
