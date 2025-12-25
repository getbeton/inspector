"""
Signal to Attio Deal Pipeline.

Pipes detected signals to Attio CRM as deals:
1. Match signals to Attio companies via domain
2. Create deals in Attio with signal data
3. Add notes with signal context

This enables sales teams to act on signals directly from Attio.
"""
import logging
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.config import settings
from app.core.config_manager import ConfigManager
from app.core.encryption import EncryptionService
from app.integrations.attio_client import (
    AttioClient,
    AttioError,
    AttioValidationError,
    get_attio_client
)
from app.models import Signal, Account, SyncState

logger = logging.getLogger(__name__)


# Attio attributes required for deals
DEAL_ATTRIBUTES = [
    {
        "api_slug": "beton_signal_type",
        "title": "Beton Signal Type",
        "type": "text",
        "description": "Type of signal that triggered this deal"
    },
    {
        "api_slug": "beton_signal_value",
        "title": "Beton Signal Value",
        "type": "number",
        "description": "Quantitative value of the signal"
    },
    {
        "api_slug": "beton_signal_source",
        "title": "Beton Signal Source",
        "type": "text",
        "description": "Data source (e.g., posthog, stripe)"
    },
    {
        "api_slug": "beton_signal_timestamp",
        "title": "Beton Signal Timestamp",
        "type": "timestamp",
        "description": "When the signal was detected"
    },
    {
        "api_slug": "beton_signal_id",
        "title": "Beton Signal ID",
        "type": "number",
        "description": "Internal Beton signal ID"
    },
    {
        "api_slug": "beton_account_domain",
        "title": "Account Domain",
        "type": "text",
        "description": "Domain of the account"
    },
    {
        "api_slug": "beton_health_score",
        "title": "Account Health Score",
        "type": "number",
        "description": "Health score at time of signal"
    },
]


@dataclass
class DealPipeResult:
    """Result of piping a single signal to Attio deal."""
    signal_id: int
    account_id: int
    domain: str
    success: bool
    attio_deal_id: Optional[str] = None
    attio_company_id: Optional[str] = None
    error: Optional[str] = None


@dataclass
class SignalPipelineResult:
    """Aggregate result of piping signals to Attio."""
    success: bool
    total_signals: int = 0
    deals_created: int = 0
    companies_matched: int = 0
    errors: int = 0
    duration_seconds: float = 0.0
    error_message: Optional[str] = None
    results: List[DealPipeResult] = field(default_factory=list)


class SignalToAttioPipeline:
    """
    Pipes signals from Beton to Attio as deals.

    Flow:
    1. Signal detected with PostHog group_id/user_id
    2. Match to Attio company via domain (synced in CDP)
    3. Create deal in Attio with signal data
    4. Add note with full signal context

    Usage:
        pipeline = SignalToAttioPipeline(db)

        # Pipe recent signals
        result = pipeline.pipe_signals(limit=100)

        # Pipe specific signals
        result = pipeline.pipe_signals(signal_ids=[1, 2, 3])
    """

    def __init__(
        self,
        db: Session,
        attio_client: Optional[AttioClient] = None
    ):
        """
        Initialize signal pipeline.

        Args:
            db: Database session.
            attio_client: Optional Attio client.
        """
        self.db = db
        self.encryption = EncryptionService(settings.beton_encryption_key)
        self.config_manager = ConfigManager(db, self.encryption)

        # Initialize Attio client
        if attio_client:
            self.attio = attio_client
        else:
            self.attio = get_attio_client(db, self.config_manager)

        # Cache for Attio company lookups
        self._company_cache: Dict[str, str] = {}  # domain -> record_id

    def _ensure_deal_attributes(self) -> bool:
        """
        Ensure required Beton attributes exist on deals object.

        Returns:
            True if attributes are ready.
        """
        try:
            self.attio.ensure_attributes("deals", DEAL_ATTRIBUTES)
            return True
        except AttioError as e:
            logger.warning(f"Could not ensure deal attributes: {e}")
            return False
        except Exception as e:
            logger.error(f"Failed to ensure deal attributes: {e}")
            return False

    def _find_attio_company(self, domain: str) -> Optional[str]:
        """
        Find Attio company record by domain.

        Args:
            domain: Company domain to search for.

        Returns:
            Attio record ID or None if not found.
        """
        # Check cache first
        if domain in self._company_cache:
            return self._company_cache[domain]

        try:
            # Search for company by domain
            session = self.attio._get_session()

            # Query companies with domain filter
            response = session.post(
                f"{self.attio.BASE_URL}/objects/companies/records/query",
                json={
                    "filter": {
                        "domains": {
                            "$contains": domain
                        }
                    },
                    "limit": 1
                }
            )

            if response.status_code == 200:
                data = response.json()
                records = data.get("data", [])
                if records:
                    record_id = records[0].get("id", {}).get("record_id", "")
                    self._company_cache[domain] = record_id
                    return record_id

            return None

        except Exception as e:
            logger.warning(f"Failed to find company for domain {domain}: {e}")
            return None

    def _create_deal_from_signal(
        self,
        signal: Signal,
        account: Account,
        company_record_id: Optional[str] = None
    ) -> DealPipeResult:
        """
        Create an Attio deal from a signal.

        Args:
            signal: The signal to create a deal from.
            account: The account associated with the signal.
            company_record_id: Optional Attio company record ID to link.

        Returns:
            DealPipeResult with outcome.
        """
        try:
            # Build deal values
            deal_values = {
                "name": f"[Beton Signal] {signal.type} - {account.name or account.domain}",
                "beton_signal_type": signal.type,
                "beton_signal_value": signal.value if signal.value else 0,
                "beton_signal_source": signal.source or "beton",
                "beton_signal_timestamp": signal.timestamp.isoformat() if signal.timestamp else datetime.utcnow().isoformat(),
                "beton_signal_id": signal.id,
                "beton_account_domain": account.domain,
                "beton_health_score": account.health_score or 0,
            }

            # Add company link if available
            if company_record_id:
                # Attio uses linked_records for relationships
                deal_values["companies"] = [{"target_record_id": company_record_id}]

            # Create deal via upsert
            # Use signal_id as matching to prevent duplicates
            session = self.attio._get_session()

            # Check if deal already exists for this signal
            existing = session.post(
                f"{self.attio.BASE_URL}/objects/deals/records/query",
                json={
                    "filter": {
                        "beton_signal_id": signal.id
                    },
                    "limit": 1
                }
            )

            if existing.status_code == 200:
                existing_data = existing.json().get("data", [])
                if existing_data:
                    # Deal already exists
                    return DealPipeResult(
                        signal_id=signal.id,
                        account_id=account.id,
                        domain=account.domain or "",
                        success=True,
                        attio_deal_id=existing_data[0].get("id", {}).get("record_id", ""),
                        attio_company_id=company_record_id
                    )

            # Create new deal
            response = session.put(
                f"{self.attio.BASE_URL}/objects/deals/records",
                json={
                    "data": {
                        "values": deal_values
                    }
                }
            )

            if response.status_code in [200, 201]:
                data = response.json()
                deal_id = data.get("data", {}).get("id", {}).get("record_id", "")

                # Add note with signal details
                if deal_id and signal.details:
                    self._add_signal_note(deal_id, signal)

                return DealPipeResult(
                    signal_id=signal.id,
                    account_id=account.id,
                    domain=account.domain or "",
                    success=True,
                    attio_deal_id=deal_id,
                    attio_company_id=company_record_id
                )
            else:
                error_msg = response.json().get("message", response.text)
                return DealPipeResult(
                    signal_id=signal.id,
                    account_id=account.id,
                    domain=account.domain or "",
                    success=False,
                    error=f"Failed to create deal: {error_msg}"
                )

        except AttioValidationError as e:
            return DealPipeResult(
                signal_id=signal.id,
                account_id=account.id,
                domain=account.domain or "",
                success=False,
                error=f"Validation error: {e}"
            )
        except Exception as e:
            logger.error(f"Failed to create deal for signal {signal.id}: {e}")
            return DealPipeResult(
                signal_id=signal.id,
                account_id=account.id,
                domain=account.domain or "",
                success=False,
                error=str(e)
            )

    def _add_signal_note(self, deal_id: str, signal: Signal) -> bool:
        """
        Add a note to the deal with signal details.

        Args:
            deal_id: Attio deal record ID.
            signal: Signal with details to add.

        Returns:
            True if note added successfully.
        """
        try:
            session = self.attio._get_session()

            # Build note content
            details = signal.details or {}
            note_content = f"""
## Beton Signal: {signal.type}

**Detected:** {signal.timestamp.strftime('%Y-%m-%d %H:%M:%S') if signal.timestamp else 'N/A'}
**Source:** {signal.source or 'beton'}
**Value:** {signal.value if signal.value else 'N/A'}

### Signal Details
"""
            for key, value in details.items():
                note_content += f"- **{key}:** {value}\n"

            # Create note via Attio notes API
            response = session.post(
                f"{self.attio.BASE_URL}/notes",
                json={
                    "data": {
                        "parent_object": "deals",
                        "parent_record_id": deal_id,
                        "title": f"Beton Signal: {signal.type}",
                        "content_md": note_content
                    }
                }
            )

            return response.status_code in [200, 201]

        except Exception as e:
            logger.warning(f"Failed to add note to deal {deal_id}: {e}")
            return False

    def pipe_signals(
        self,
        signal_ids: Optional[List[int]] = None,
        signal_types: Optional[List[str]] = None,
        limit: int = 100,
        skip_synced: bool = True
    ) -> SignalPipelineResult:
        """
        Pipe signals to Attio as deals.

        Args:
            signal_ids: Optional list of specific signal IDs to pipe.
            signal_types: Optional filter by signal types.
            limit: Maximum signals to process.
            skip_synced: Skip signals already synced to Attio.

        Returns:
            SignalPipelineResult with aggregate stats.
        """
        start_time = time.time()
        results: List[DealPipeResult] = []
        companies_matched = 0

        try:
            # Ensure deal attributes exist
            self._ensure_deal_attributes()

            # Build query
            query = self.db.query(Signal).join(Account).filter(
                Account.domain.isnot(None)
            )

            if signal_ids:
                query = query.filter(Signal.id.in_(signal_ids))

            if signal_types:
                query = query.filter(Signal.type.in_(signal_types))

            # Order by most recent
            query = query.order_by(Signal.timestamp.desc()).limit(limit)

            signals = query.all()

            if not signals:
                return SignalPipelineResult(
                    success=True,
                    total_signals=0,
                    duration_seconds=time.time() - start_time
                )

            logger.info(f"Piping {len(signals)} signals to Attio")

            for signal in signals:
                account = signal.account

                if not account or not account.domain:
                    continue

                # Find matching Attio company
                company_id = self._find_attio_company(account.domain)
                if company_id:
                    companies_matched += 1

                # Create deal
                result = self._create_deal_from_signal(signal, account, company_id)
                results.append(result)

            # Calculate stats
            deals_created = sum(1 for r in results if r.success)
            errors = sum(1 for r in results if not r.success)

            return SignalPipelineResult(
                success=errors == 0,
                total_signals=len(signals),
                deals_created=deals_created,
                companies_matched=companies_matched,
                errors=errors,
                duration_seconds=time.time() - start_time,
                results=results
            )

        except Exception as e:
            logger.error(f"Signal pipeline failed: {e}")
            return SignalPipelineResult(
                success=False,
                error_message=str(e),
                duration_seconds=time.time() - start_time,
                results=results
            )

    def update_sync_state(self, result: SignalPipelineResult) -> None:
        """Update sync state in database."""
        state = self.db.query(SyncState).filter(
            SyncState.integration_name == "signal_to_attio"
        ).first()

        status = "success" if result.success else "partial"

        if state is None:
            state = SyncState(
                integration_name="signal_to_attio",
                status=status,
                last_sync_started_at=datetime.utcnow(),
                last_sync_completed_at=datetime.utcnow(),
                records_processed=result.total_signals,
                records_succeeded=result.deals_created,
                records_failed=result.errors,
                error_summary=result.error_message,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            self.db.add(state)
        else:
            state.status = status
            state.last_sync_completed_at = datetime.utcnow()
            state.records_processed = result.total_signals
            state.records_succeeded = result.deals_created
            state.records_failed = result.errors
            state.updated_at = datetime.utcnow()
            if result.error_message:
                state.error_summary = result.error_message

        self.db.commit()
