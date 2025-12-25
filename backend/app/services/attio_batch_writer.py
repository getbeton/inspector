"""
Attio Batch Writer Service.

Handles batch writing of signals to Attio with:
- Concurrency control (semaphore-based)
- Retry logic with exponential backoff
- Progress tracking
- Error aggregation
"""
import logging
import asyncio
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from enum import Enum
from concurrent.futures import ThreadPoolExecutor, as_completed

from sqlalchemy.orm import Session

from app.models import SyncState
from app.integrations.attio_client import (
    AttioClient,
    AttioError,
    AttioRateLimitError,
    AttioAuthError,
    AttioValidationError,
    AttioUpsertResult
)
from app.services.attio_mapper import MappedRecord, AttioFieldMapper

logger = logging.getLogger(__name__)


class WriteStatus(str, Enum):
    """Status of a batch write operation."""
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"


@dataclass
class WriteResult:
    """Result of writing a single record."""
    signal_id: int
    account_id: int
    domain: str
    success: bool
    record_id: Optional[str] = None
    error: Optional[str] = None
    retries: int = 0


@dataclass
class BatchResult:
    """Aggregated result of a batch write operation."""
    status: WriteStatus
    total: int
    succeeded: int
    failed: int
    skipped: int
    duration_seconds: float
    results: List[WriteResult] = field(default_factory=list)
    errors_by_type: Dict[str, int] = field(default_factory=dict)

    @property
    def success_rate(self) -> float:
        """Calculate success rate as percentage."""
        if self.total == 0:
            return 0.0
        return (self.succeeded / self.total) * 100


class AttioBatchWriter:
    """
    Batch writes signals to Attio with concurrency control.

    Usage:
        writer = AttioBatchWriter(attio_client, max_concurrency=5)

        # Write signals
        result = writer.write_signals(mapped_records)

        print(f"Success rate: {result.success_rate}%")
    """

    def __init__(
        self,
        attio_client: AttioClient,
        max_concurrency: int = 5,
        batch_size: int = 100,
        max_retries: int = 3,
        retry_base_delay: float = 1.0,
        object_slug: str = "companies"
    ):
        """
        Initialize batch writer.

        Args:
            attio_client: Attio API client.
            max_concurrency: Maximum concurrent API calls.
            batch_size: Records per batch.
            max_retries: Max retry attempts for transient errors.
            retry_base_delay: Base delay for exponential backoff.
            object_slug: Attio object slug.
        """
        self.client = attio_client
        self.max_concurrency = max_concurrency
        self.batch_size = batch_size
        self.max_retries = max_retries
        self.retry_base_delay = retry_base_delay
        self.object_slug = object_slug

    def _upsert_with_retry(
        self,
        record: MappedRecord,
        matching_attribute: str = "domains"
    ) -> WriteResult:
        """
        Upsert a single record with retry logic.

        Args:
            record: MappedRecord to upsert.
            matching_attribute: Attribute to match on.

        Returns:
            WriteResult with success/failure info.
        """
        last_error = None
        retries = 0

        for attempt in range(self.max_retries + 1):
            try:
                result = self.client.upsert_record(
                    object_slug=self.object_slug,
                    values=record.values,
                    matching_attribute=matching_attribute
                )

                return WriteResult(
                    signal_id=record.signal_id,
                    account_id=record.account_id,
                    domain=record.matching_value,
                    success=True,
                    record_id=result.record_id,
                    retries=retries
                )

            except AttioRateLimitError as e:
                # Rate limit - wait and retry
                last_error = f"Rate limit: {e}"
                retries += 1
                if attempt < self.max_retries:
                    delay = min(e.retry_after, 60)  # Cap at 60s
                    logger.warning(f"Rate limited, waiting {delay}s before retry")
                    time.sleep(delay)
                continue

            except AttioAuthError as e:
                # Auth error - don't retry
                return WriteResult(
                    signal_id=record.signal_id,
                    account_id=record.account_id,
                    domain=record.matching_value,
                    success=False,
                    error=f"Auth error: {e}",
                    retries=retries
                )

            except AttioValidationError as e:
                # Validation error - don't retry
                return WriteResult(
                    signal_id=record.signal_id,
                    account_id=record.account_id,
                    domain=record.matching_value,
                    success=False,
                    error=f"Validation error: {e}",
                    retries=retries
                )

            except AttioError as e:
                # Other Attio error - retry
                last_error = str(e)
                retries += 1
                if attempt < self.max_retries:
                    delay = self.retry_base_delay * (2 ** attempt)
                    logger.warning(f"Attio error, retrying in {delay}s: {e}")
                    time.sleep(delay)
                continue

            except Exception as e:
                # Unexpected error - log and retry
                last_error = str(e)
                retries += 1
                if attempt < self.max_retries:
                    delay = self.retry_base_delay * (2 ** attempt)
                    logger.warning(f"Unexpected error, retrying in {delay}s: {e}")
                    time.sleep(delay)
                continue

        # All retries exhausted
        return WriteResult(
            signal_id=record.signal_id,
            account_id=record.account_id,
            domain=record.matching_value,
            success=False,
            error=last_error or "Max retries exceeded",
            retries=retries
        )

    def write_records(
        self,
        records: List[MappedRecord],
        matching_attribute: str = "domains"
    ) -> BatchResult:
        """
        Write multiple records to Attio with concurrency control.

        Uses ThreadPoolExecutor for concurrent API calls.

        Args:
            records: List of MappedRecords to write.
            matching_attribute: Attribute to match on.

        Returns:
            BatchResult with aggregated stats.
        """
        if not records:
            return BatchResult(
                status=WriteStatus.SUCCESS,
                total=0,
                succeeded=0,
                failed=0,
                skipped=0,
                duration_seconds=0.0
            )

        start_time = time.time()
        results: List[WriteResult] = []
        errors_by_type: Dict[str, int] = {}

        logger.info(f"Starting batch write of {len(records)} records with concurrency={self.max_concurrency}")

        # Use ThreadPoolExecutor for concurrent writes
        with ThreadPoolExecutor(max_workers=self.max_concurrency) as executor:
            # Submit all tasks
            future_to_record = {
                executor.submit(
                    self._upsert_with_retry,
                    record,
                    matching_attribute
                ): record
                for record in records
            }

            # Collect results as they complete
            for future in as_completed(future_to_record):
                record = future_to_record[future]
                try:
                    result = future.result()
                    results.append(result)

                    if not result.success and result.error:
                        # Categorize error
                        error_type = result.error.split(":")[0]
                        errors_by_type[error_type] = errors_by_type.get(error_type, 0) + 1

                except Exception as e:
                    # Unexpected exception from future
                    logger.error(f"Future failed for record {record.matching_value}: {e}")
                    results.append(WriteResult(
                        signal_id=record.signal_id,
                        account_id=record.account_id,
                        domain=record.matching_value,
                        success=False,
                        error=str(e)
                    ))
                    errors_by_type["Unknown"] = errors_by_type.get("Unknown", 0) + 1

        duration = time.time() - start_time
        succeeded = sum(1 for r in results if r.success)
        failed = sum(1 for r in results if not r.success)

        # Determine overall status
        if failed == 0:
            status = WriteStatus.SUCCESS
        elif succeeded == 0:
            status = WriteStatus.FAILED
        else:
            status = WriteStatus.PARTIAL

        batch_result = BatchResult(
            status=status,
            total=len(records),
            succeeded=succeeded,
            failed=failed,
            skipped=0,
            duration_seconds=duration,
            results=results,
            errors_by_type=errors_by_type
        )

        logger.info(
            f"Batch write completed: {succeeded}/{len(records)} succeeded "
            f"({batch_result.success_rate:.1f}%) in {duration:.2f}s"
        )

        if errors_by_type:
            logger.warning(f"Error breakdown: {errors_by_type}")

        return batch_result

    def write_in_batches(
        self,
        records: List[MappedRecord],
        matching_attribute: str = "domains",
        progress_callback: Optional[callable] = None
    ) -> BatchResult:
        """
        Write records in batches with progress tracking.

        Args:
            records: List of MappedRecords to write.
            matching_attribute: Attribute to match on.
            progress_callback: Optional callback(current, total) for progress.

        Returns:
            Aggregated BatchResult.
        """
        if not records:
            return BatchResult(
                status=WriteStatus.SUCCESS,
                total=0,
                succeeded=0,
                failed=0,
                skipped=0,
                duration_seconds=0.0
            )

        start_time = time.time()
        all_results: List[WriteResult] = []
        all_errors: Dict[str, int] = {}

        # Split into batches
        batches = [
            records[i:i + self.batch_size]
            for i in range(0, len(records), self.batch_size)
        ]

        logger.info(f"Processing {len(records)} records in {len(batches)} batches")

        for batch_idx, batch in enumerate(batches):
            logger.debug(f"Processing batch {batch_idx + 1}/{len(batches)} ({len(batch)} records)")

            batch_result = self.write_records(batch, matching_attribute)
            all_results.extend(batch_result.results)

            # Merge error counts
            for error_type, count in batch_result.errors_by_type.items():
                all_errors[error_type] = all_errors.get(error_type, 0) + count

            # Progress callback
            if progress_callback:
                processed = min((batch_idx + 1) * self.batch_size, len(records))
                progress_callback(processed, len(records))

        duration = time.time() - start_time
        succeeded = sum(1 for r in all_results if r.success)
        failed = sum(1 for r in all_results if not r.success)

        # Determine overall status
        if failed == 0:
            status = WriteStatus.SUCCESS
        elif succeeded == 0:
            status = WriteStatus.FAILED
        else:
            status = WriteStatus.PARTIAL

        return BatchResult(
            status=status,
            total=len(records),
            succeeded=succeeded,
            failed=failed,
            skipped=0,
            duration_seconds=duration,
            results=all_results,
            errors_by_type=all_errors
        )


class AttioSyncTracker:
    """
    Tracks sync state for Attio integration.

    Persists progress to database for resumable syncs.
    """

    def __init__(self, db: Session):
        """Initialize sync tracker with database session."""
        self.db = db
        self.integration_name = "attio"

    def get_sync_state(self) -> Optional[SyncState]:
        """Get current sync state from database."""
        return self.db.query(SyncState).filter(
            SyncState.integration_name == self.integration_name
        ).first()

    def start_sync(self) -> SyncState:
        """Mark sync as started."""
        state = self.get_sync_state()

        if state is None:
            state = SyncState(
                integration_name=self.integration_name,
                status="in_progress",
                last_sync_started_at=datetime.utcnow(),
                records_processed=0,
                records_succeeded=0,
                records_failed=0,
                cursor_data={},
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            self.db.add(state)
        else:
            state.status = "in_progress"
            state.last_sync_started_at = datetime.utcnow()
            state.records_processed = 0
            state.records_succeeded = 0
            state.records_failed = 0
            state.error_summary = None
            state.updated_at = datetime.utcnow()

        self.db.commit()
        return state

    def update_progress(
        self,
        processed: int,
        succeeded: int,
        failed: int,
        cursor_data: Optional[Dict] = None
    ) -> None:
        """Update sync progress."""
        state = self.get_sync_state()
        if state:
            state.records_processed = processed
            state.records_succeeded = succeeded
            state.records_failed = failed
            if cursor_data:
                state.cursor_data = cursor_data
            state.updated_at = datetime.utcnow()
            self.db.commit()

    def complete_sync(self, result: BatchResult) -> SyncState:
        """Mark sync as completed with final result."""
        state = self.get_sync_state()
        if state:
            state.status = "success" if result.status == WriteStatus.SUCCESS else "partial"
            state.last_sync_completed_at = datetime.utcnow()
            state.records_processed = result.total
            state.records_succeeded = result.succeeded
            state.records_failed = result.failed
            state.updated_at = datetime.utcnow()

            if result.errors_by_type:
                state.error_summary = f"Errors: {result.errors_by_type}"

            self.db.commit()
        return state

    def fail_sync(self, error_message: str) -> SyncState:
        """Mark sync as failed."""
        state = self.get_sync_state()
        if state:
            state.status = "failed"
            state.error_summary = error_message
            state.updated_at = datetime.utcnow()
            self.db.commit()
        return state

    def get_sync_status(self) -> Dict[str, Any]:
        """Get formatted sync status for API response."""
        state = self.get_sync_state()

        if state is None:
            return {
                "status": "never_synced",
                "last_sync_at": None,
                "records_processed": 0,
                "records_succeeded": 0,
                "records_failed": 0,
                "error": None
            }

        return {
            "status": state.status,
            "last_sync_started_at": state.last_sync_started_at.isoformat() if state.last_sync_started_at else None,
            "last_sync_completed_at": state.last_sync_completed_at.isoformat() if state.last_sync_completed_at else None,
            "records_processed": state.records_processed,
            "records_succeeded": state.records_succeeded,
            "records_failed": state.records_failed,
            "error": state.error_summary
        }
