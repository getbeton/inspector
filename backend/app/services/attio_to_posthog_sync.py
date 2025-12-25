"""
Attio to PostHog Sync Service.

Pulls CRM data from Attio and pushes it to PostHog as events
for unified analysis in PostHog.

Data Flow:
    Attio Companies/Deals/People → PostHog Events → HogQL Analysis
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
from app.integrations.attio_client import (
    AttioClient,
    AttioError,
    AttioRecord,
    get_attio_client
)
from app.models import SyncState

logger = logging.getLogger(__name__)


@dataclass
class PostHogEvent:
    """A PostHog event to be sent."""
    event: str  # Event name (e.g., "attio_company_synced")
    distinct_id: str  # Unique identifier
    properties: Dict[str, Any] = field(default_factory=dict)
    timestamp: Optional[str] = None


@dataclass
class SyncResult:
    """Result of an Attio-to-PostHog sync operation."""
    success: bool
    total_records: int = 0
    events_sent: int = 0
    errors: int = 0
    duration_seconds: float = 0.0
    object_type: str = ""
    error_message: Optional[str] = None


class AttioToPostHogSync:
    """
    Syncs Attio CRM data to PostHog as events.

    This allows all CRM data to be analyzed in PostHog using HogQL,
    alongside product analytics data.

    Usage:
        sync = AttioToPostHogSync(db)

        # Sync all companies from Attio to PostHog
        result = sync.sync_companies()

        # Sync all data types
        results = sync.sync_all()
    """

    def __init__(
        self,
        db: Session,
        attio_client: Optional[AttioClient] = None,
        posthog_api_key: Optional[str] = None,
        posthog_host: Optional[str] = None
    ):
        """
        Initialize sync service.

        Args:
            db: Database session.
            attio_client: Optional Attio client (created from config if not provided).
            posthog_api_key: Optional PostHog API key override.
            posthog_host: Optional PostHog host override.
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
        # Note: PostHog has two types of keys:
        # - Personal API Key (phx_...) - for querying data via REST API
        # - Project API Key (phc_...) - for capturing/sending events
        # The batch endpoint needs the Project API Key (token), not the Personal API Key
        posthog_config = self.config_manager.get_integration("posthog")

        # Project token for event capture (check for dedicated token first, fallback to api_key)
        self.posthog_project_token = (
            posthog_config.get("project_token")
            or posthog_config.get("api_key")
            if posthog_config else None
        )

        # Host and project ID
        self.posthog_host = posthog_host or (posthog_config.get("host") if posthog_config else None) or "https://app.posthog.com"
        self.posthog_project_id = posthog_config.get("project_id") if posthog_config else None

        # Check if we have a valid key for event capture
        self._key_type = None
        self._key_error = None

        if self.posthog_project_token:
            if self.posthog_project_token.startswith("phx_"):
                # Personal API key - won't work for event capture
                self._key_type = "personal"
                self._key_error = (
                    "PostHog Personal API Key (phx_) detected. Event capture requires a Project API Key. "
                    "Add 'project_token' to PostHog config with your Project API Key from: "
                    "https://app.posthog.com/project/settings (look for 'Project API Key')"
                )
                logger.warning(self._key_error)
            elif self.posthog_project_token.startswith("phc_"):
                # Project API key - correct for event capture
                self._key_type = "project"
            else:
                # Unknown format
                self._key_error = (
                    "Unknown PostHog API key format. Expected 'phx_' (Personal) or Project API Key. "
                    "Get your Project API Key from: https://app.posthog.com/project/settings"
                )
                logger.warning(self._key_error)

    def _send_events_to_posthog(self, events: List[PostHogEvent]) -> int:
        """
        Send batch of events to PostHog.

        Args:
            events: List of PostHogEvent objects.

        Returns:
            Number of events successfully sent.
        """
        if not self.posthog_project_token:
            raise ValueError(
                "PostHog API key not configured. Add your Project API Key from: "
                "https://app.posthog.com/project/settings"
            )

        # Check if we have the right key type
        if self._key_type == "personal":
            raise ValueError(
                "Cannot send events with Personal API Key (phx_). "
                "For event capture, add 'project_token' to PostHog config with your Project API Key from: "
                "https://app.posthog.com/project/settings (look for 'Project API Key')"
            )

        if not events:
            return 0

        # PostHog batch capture endpoint
        url = f"{self.posthog_host}/batch/"

        # Format events for PostHog batch API
        batch_data = {
            "api_key": self.posthog_project_token,
            "batch": [
                {
                    "event": event.event,
                    "distinct_id": event.distinct_id,
                    "properties": {
                        **event.properties,
                        "$lib": "beton-inspector",
                        "$lib_version": "1.0.0",
                    },
                    "timestamp": event.timestamp or datetime.utcnow().isoformat()
                }
                for event in events
            ]
        }

        try:
            response = requests.post(
                url,
                json=batch_data,
                headers={"Content-Type": "application/json"},
                timeout=30
            )

            if response.status_code == 200:
                logger.debug(f"Sent {len(events)} events to PostHog")
                return len(events)
            else:
                logger.error(f"PostHog batch failed: {response.status_code} - {response.text}")
                return 0

        except Exception as e:
            logger.error(f"Failed to send events to PostHog: {e}")
            return 0

    def _transform_company_to_event(self, record: Dict[str, Any]) -> PostHogEvent:
        """Transform an Attio company record to a PostHog event."""
        values = record.get("values", {})

        # Extract key fields
        record_id = record.get("id", {}).get("record_id", "unknown")

        # Get domain as distinct_id (primary identifier)
        domains = values.get("domains", [])
        domain = domains[0].get("domain") if domains else record_id

        # Get name
        name_values = values.get("name", [])
        name = name_values[0].get("value") if name_values else None

        # Build properties from all available fields
        properties = {
            "attio_record_id": record_id,
            "source": "attio",
            "object_type": "company",
            "domain": domain,
            "name": name,
        }

        # Add all other fields dynamically
        for field_slug, field_values in values.items():
            if field_slug in ["domains", "name"]:
                continue  # Already processed

            if isinstance(field_values, list) and field_values:
                # Get first value
                first_val = field_values[0]
                if isinstance(first_val, dict):
                    # Handle different value types
                    if "value" in first_val:
                        properties[f"attio_{field_slug}"] = first_val["value"]
                    elif "target_record_id" in first_val:
                        properties[f"attio_{field_slug}_id"] = first_val["target_record_id"]
                    elif "currency_value" in first_val:
                        properties[f"attio_{field_slug}"] = first_val["currency_value"]
                else:
                    properties[f"attio_{field_slug}"] = first_val

        return PostHogEvent(
            event="attio_company_synced",
            distinct_id=domain,
            properties=properties
        )

    def _transform_person_to_event(self, record: Dict[str, Any]) -> PostHogEvent:
        """Transform an Attio person record to a PostHog event."""
        values = record.get("values", {})
        record_id = record.get("id", {}).get("record_id", "unknown")

        # Get email as distinct_id
        email_values = values.get("email_addresses", [])
        email = email_values[0].get("email_address") if email_values else record_id

        # Get name
        name_values = values.get("name", [])
        name = name_values[0].get("full_name") if name_values else None

        properties = {
            "attio_record_id": record_id,
            "source": "attio",
            "object_type": "person",
            "email": email,
            "name": name,
        }

        # Add all other fields
        for field_slug, field_values in values.items():
            if field_slug in ["email_addresses", "name"]:
                continue

            if isinstance(field_values, list) and field_values:
                first_val = field_values[0]
                if isinstance(first_val, dict):
                    if "value" in first_val:
                        properties[f"attio_{field_slug}"] = first_val["value"]
                    elif "target_record_id" in first_val:
                        properties[f"attio_{field_slug}_id"] = first_val["target_record_id"]
                else:
                    properties[f"attio_{field_slug}"] = first_val

        return PostHogEvent(
            event="attio_person_synced",
            distinct_id=email,
            properties=properties
        )

    def _transform_deal_to_event(self, record: Dict[str, Any]) -> PostHogEvent:
        """Transform an Attio deal record to a PostHog event."""
        values = record.get("values", {})
        record_id = record.get("id", {}).get("record_id", "unknown")

        # Get name as identifier
        name_values = values.get("name", [])
        name = name_values[0].get("value") if name_values else record_id

        properties = {
            "attio_record_id": record_id,
            "source": "attio",
            "object_type": "deal",
            "name": name,
        }

        # Extract deal value
        value_fields = values.get("value", [])
        if value_fields:
            first_val = value_fields[0]
            if isinstance(first_val, dict) and "currency_value" in first_val:
                properties["deal_value"] = first_val["currency_value"]
                properties["deal_currency"] = first_val.get("currency_code", "USD")

        # Extract status/stage
        status_fields = values.get("status", [])
        if status_fields:
            first_val = status_fields[0]
            if isinstance(first_val, dict):
                properties["deal_status"] = first_val.get("status", {}).get("title")

        # Add all other fields
        for field_slug, field_values in values.items():
            if field_slug in ["name", "value", "status"]:
                continue

            if isinstance(field_values, list) and field_values:
                first_val = field_values[0]
                if isinstance(first_val, dict):
                    if "value" in first_val:
                        properties[f"attio_{field_slug}"] = first_val["value"]
                    elif "target_record_id" in first_val:
                        properties[f"attio_{field_slug}_id"] = first_val["target_record_id"]
                else:
                    properties[f"attio_{field_slug}"] = first_val

        return PostHogEvent(
            event="attio_deal_synced",
            distinct_id=record_id,
            properties=properties
        )

    def _fetch_attio_records(
        self,
        object_slug: str,
        limit: int = 500
    ) -> List[Dict[str, Any]]:
        """
        Fetch records from Attio.

        Args:
            object_slug: Object type slug (companies, people, deals).
            limit: Maximum records to fetch.

        Returns:
            List of Attio records.
        """
        session = self.attio._get_session()

        payload = {
            "limit": limit
        }

        response = session.post(
            f"{self.attio.BASE_URL}/objects/{object_slug}/records/query",
            json=payload
        )

        if response.status_code == 200:
            data = response.json()
            return data.get("data", [])
        else:
            logger.error(f"Failed to fetch {object_slug}: {response.status_code}")
            return []

    def sync_companies(self, limit: int = 500, batch_size: int = 100) -> SyncResult:
        """
        Sync Attio companies to PostHog.

        Args:
            limit: Maximum companies to sync.
            batch_size: Events per batch to PostHog.

        Returns:
            SyncResult with details.
        """
        start_time = time.time()
        events_sent = 0
        errors = 0

        try:
            # Fetch companies from Attio
            records = self._fetch_attio_records("companies", limit)
            logger.info(f"Fetched {len(records)} companies from Attio")

            if not records:
                return SyncResult(
                    success=True,
                    total_records=0,
                    events_sent=0,
                    object_type="companies",
                    duration_seconds=time.time() - start_time
                )

            # Transform to events
            events = []
            for record in records:
                try:
                    event = self._transform_company_to_event(record)
                    events.append(event)
                except Exception as e:
                    logger.warning(f"Failed to transform company: {e}")
                    errors += 1

            # Send in batches
            for i in range(0, len(events), batch_size):
                batch = events[i:i + batch_size]
                sent = self._send_events_to_posthog(batch)
                events_sent += sent

            return SyncResult(
                success=True,
                total_records=len(records),
                events_sent=events_sent,
                errors=errors,
                object_type="companies",
                duration_seconds=time.time() - start_time
            )

        except Exception as e:
            logger.error(f"Company sync failed: {e}")
            return SyncResult(
                success=False,
                object_type="companies",
                error_message=str(e),
                duration_seconds=time.time() - start_time
            )

    def sync_people(self, limit: int = 500, batch_size: int = 100) -> SyncResult:
        """Sync Attio people to PostHog."""
        start_time = time.time()
        events_sent = 0
        errors = 0

        try:
            records = self._fetch_attio_records("people", limit)
            logger.info(f"Fetched {len(records)} people from Attio")

            if not records:
                return SyncResult(
                    success=True,
                    total_records=0,
                    events_sent=0,
                    object_type="people",
                    duration_seconds=time.time() - start_time
                )

            events = []
            for record in records:
                try:
                    event = self._transform_person_to_event(record)
                    events.append(event)
                except Exception as e:
                    logger.warning(f"Failed to transform person: {e}")
                    errors += 1

            for i in range(0, len(events), batch_size):
                batch = events[i:i + batch_size]
                sent = self._send_events_to_posthog(batch)
                events_sent += sent

            return SyncResult(
                success=True,
                total_records=len(records),
                events_sent=events_sent,
                errors=errors,
                object_type="people",
                duration_seconds=time.time() - start_time
            )

        except Exception as e:
            logger.error(f"People sync failed: {e}")
            return SyncResult(
                success=False,
                object_type="people",
                error_message=str(e),
                duration_seconds=time.time() - start_time
            )

    def sync_deals(self, limit: int = 500, batch_size: int = 100) -> SyncResult:
        """Sync Attio deals to PostHog."""
        start_time = time.time()
        events_sent = 0
        errors = 0

        try:
            records = self._fetch_attio_records("deals", limit)
            logger.info(f"Fetched {len(records)} deals from Attio")

            if not records:
                return SyncResult(
                    success=True,
                    total_records=0,
                    events_sent=0,
                    object_type="deals",
                    duration_seconds=time.time() - start_time
                )

            events = []
            for record in records:
                try:
                    event = self._transform_deal_to_event(record)
                    events.append(event)
                except Exception as e:
                    logger.warning(f"Failed to transform deal: {e}")
                    errors += 1

            for i in range(0, len(events), batch_size):
                batch = events[i:i + batch_size]
                sent = self._send_events_to_posthog(batch)
                events_sent += sent

            return SyncResult(
                success=True,
                total_records=len(records),
                events_sent=events_sent,
                errors=errors,
                object_type="deals",
                duration_seconds=time.time() - start_time
            )

        except Exception as e:
            logger.error(f"Deals sync failed: {e}")
            return SyncResult(
                success=False,
                object_type="deals",
                error_message=str(e),
                duration_seconds=time.time() - start_time
            )

    def sync_all(self, limit: int = 500) -> Dict[str, SyncResult]:
        """
        Sync all Attio data types to PostHog.

        Args:
            limit: Maximum records per type.

        Returns:
            Dict mapping object type to SyncResult.
        """
        results = {}

        logger.info("Starting full Attio-to-PostHog sync")

        # Sync companies
        results["companies"] = self.sync_companies(limit)

        # Sync people
        results["people"] = self.sync_people(limit)

        # Sync deals
        results["deals"] = self.sync_deals(limit)

        total_records = sum(r.total_records for r in results.values())
        total_events = sum(r.events_sent for r in results.values())

        logger.info(f"Attio-to-PostHog sync complete: {total_records} records, {total_events} events sent")

        return results

    def update_sync_state(self, results: Dict[str, SyncResult]) -> None:
        """Update sync state in database."""
        state = self.db.query(SyncState).filter(
            SyncState.integration_name == "attio_to_posthog"
        ).first()

        total_processed = sum(r.total_records for r in results.values())
        total_succeeded = sum(r.events_sent for r in results.values())
        total_failed = sum(r.errors for r in results.values())

        # Check if any failed
        any_failed = any(not r.success for r in results.values())
        status = "success" if not any_failed else "partial"

        if state is None:
            state = SyncState(
                integration_name="attio_to_posthog",
                status=status,
                last_sync_started_at=datetime.utcnow(),
                last_sync_completed_at=datetime.utcnow(),
                records_processed=total_processed,
                records_succeeded=total_succeeded,
                records_failed=total_failed,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            self.db.add(state)
        else:
            state.status = status
            state.last_sync_completed_at = datetime.utcnow()
            state.records_processed = total_processed
            state.records_succeeded = total_succeeded
            state.records_failed = total_failed
            state.updated_at = datetime.utcnow()

        self.db.commit()
