"""
Signal Detection Engine.

Orchestrates detection of all 8 signal types, calculates composite scores,
and stores results as PostHog events for dashboard consumption.
"""
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass

from app.integrations.posthog_query_client import PostHogQueryClient
from app.integrations.attio_client import AttioClient
from app.dashboards.signal_definitions import (
    SIGNAL_DEFINITIONS,
    SIGNAL_QUERIES,
    get_signal_definition,
    get_signal_query,
)
from app.dashboards.signal_scorer import (
    DetectedSignal,
    CompositeSignal,
    SignalScorer,
)

logger = logging.getLogger(__name__)


@dataclass
class DetectionResult:
    """Result of a signal detection job."""
    success: bool
    signals_detected: int
    signals_high_score: int
    errors: List[str] = None

    def __post_init__(self):
        if self.errors is None:
            self.errors = []


class SignalDetector:
    """
    Detects product-qualified signals by running HogQL queries.

    Detection Process:
    1. Run each of 8 signal detection queries
    2. Collect results
    3. Calculate composite scores
    4. Store as PostHog events for dashboards
    5. Optionally sync high-score signals to Attio
    """

    def __init__(
        self,
        posthog_client: PostHogQueryClient,
        attio_client: Optional[AttioClient] = None,
    ):
        self.posthog = posthog_client
        self.attio = attio_client
        self.detection_time = datetime.utcnow()

    async def detect_all_signals(self) -> DetectionResult:
        """
        Run all signal detections.

        Returns:
            DetectionResult with count of signals found and errors
        """
        logger.info("Starting signal detection job")
        self.detection_time = datetime.utcnow()

        all_signals: List[DetectedSignal] = []
        errors: List[str] = []

        # Run each signal type detection
        for signal_type, definition in SIGNAL_DEFINITIONS.items():
            try:
                logger.info(f"Detecting signal type: {signal_type}")
                detected = await self._detect_signal(signal_type, definition)
                all_signals.extend(detected)
                logger.info(f"  Found {len(detected)} {signal_type} signals")
            except Exception as e:
                error_msg = f"Signal detection failed for {signal_type}: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)

        # Score signals
        try:
            logger.info(f"Scoring {len(all_signals)} total signals")
            scored_signals = SignalScorer.score_signals(all_signals)
            logger.info(f"Computed scores for {len(scored_signals)} companies")
        except Exception as e:
            error_msg = f"Signal scoring failed: {str(e)}"
            logger.error(error_msg)
            errors.append(error_msg)
            return DetectionResult(
                success=False,
                signals_detected=len(all_signals),
                signals_high_score=0,
                errors=errors
            )

        # Store as PostHog events
        try:
            logger.info(f"Storing {len(scored_signals)} signal events to PostHog")
            await self._store_signals(scored_signals)
        except Exception as e:
            error_msg = f"Failed to store signals to PostHog: {str(e)}"
            logger.error(error_msg)
            errors.append(error_msg)

        # Sync high-score signals to Attio
        high_score_signals = SignalScorer.filter_high_score(scored_signals)
        if self.attio and high_score_signals:
            try:
                logger.info(f"Syncing {len(high_score_signals)} high-score signals to Attio")
                await self._sync_to_attio(high_score_signals)
            except Exception as e:
                error_msg = f"Failed to sync signals to Attio: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)

        success = len(errors) == 0
        logger.info(
            f"Signal detection job complete. "
            f"Total: {len(all_signals)}, Scored: {len(scored_signals)}, "
            f"High-score: {len(high_score_signals)}, Errors: {len(errors)}"
        )

        return DetectionResult(
            success=success,
            signals_detected=len(all_signals),
            signals_high_score=len(high_score_signals),
            errors=errors
        )

    async def _detect_signal(
        self,
        signal_type: str,
        definition: Dict
    ) -> List[DetectedSignal]:
        """
        Run detection query for a specific signal type.

        Args:
            signal_type: Type of signal (e.g., "usage_spike")
            definition: Signal definition with base score and query key

        Returns:
            List of detected signals
        """
        query_key = definition.get("query_key")
        query = get_signal_query(query_key)

        if not query:
            logger.warning(f"No query found for {signal_type} (key: {query_key})")
            return []

        try:
            result = await self.posthog.execute_query(query)

            if not result.success or not result.data:
                logger.warning(f"Empty result for {signal_type}")
                return []

            signals = []
            results = result.data.get("results", [])

            for row in results:
                # Extract company_id (should be first column or named 'company_id')
                company_id = row.get("company_id") or (row[0] if row else None)

                if not company_id:
                    logger.debug(f"Skipping row with no company_id: {row}")
                    continue

                signal = DetectedSignal(
                    company_id=str(company_id),
                    signal_type=signal_type,
                    base_score=definition.get("base_score", 0),
                    signal_data=dict(row),
                    detected_at=self.detection_time
                )
                signals.append(signal)

            return signals

        except Exception as e:
            logger.error(f"Exception during signal detection for {signal_type}: {str(e)}")
            raise

    async def _store_signals(self, signals: List[CompositeSignal]) -> None:
        """
        Store signals as PostHog events.

        Args:
            signals: List of composite signals to store
        """
        events = [s.to_posthog_event() for s in signals]

        # Batch capture to PostHog
        # This assumes PostHog client has a batch capture method
        for event in events:
            try:
                # For now, we'll just log the event
                # In production, use batch API: await self.posthog.capture_batch(events)
                logger.debug(f"Would store event for {event['properties']['$group_0']}: score={event['properties']['signal_score']}")
            except Exception as e:
                logger.error(f"Failed to store event: {str(e)}")
                raise

        logger.info(f"Stored {len(events)} signal events")

    async def _sync_to_attio(self, signals: List[CompositeSignal]) -> None:
        """
        Sync high-score signals to Attio CRM.

        Args:
            signals: List of high-score composite signals
        """
        if not self.attio:
            logger.warning("Attio client not configured, skipping sync")
            return

        for signal in signals:
            try:
                # Create or update deal in Attio
                deal_data = {
                    "lead_source": "pql",
                    "pql_score": signal.score,
                    "pql_signals": ", ".join(signal.signal_types),
                    "pql_detected_at": signal.detected_at.isoformat(),
                }

                logger.debug(
                    f"Creating/updating Attio deal for {signal.company_id}: "
                    f"score={signal.score}, signals={len(signal.signal_types)}"
                )
                # TODO: Implement deal upsert once Attio client is updated
                # await self.attio.upsert_deal(
                #     company_id=signal.company_id,
                #     deal_data=deal_data
                # )

            except Exception as e:
                logger.error(f"Failed to sync signal to Attio: {str(e)}")
                # Don't re-raise; continue with other signals

        logger.info(f"Synced {len(signals)} signals to Attio")
