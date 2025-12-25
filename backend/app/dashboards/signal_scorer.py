"""
Signal scoring and composite PQL score calculation.

Combines individual signal scores with diversity bonuses
to calculate final PQL scores (0-100).
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)


@dataclass
class DetectedSignal:
    """A signal detected for a company."""
    company_id: str
    signal_type: str
    base_score: int
    signal_data: dict
    detected_at: datetime


@dataclass
class CompositeSignal:
    """Aggregated signals with composite score."""
    company_id: str
    score: int
    signal_types: List[str]
    signals: List[DetectedSignal]
    detected_at: datetime

    def to_posthog_event(self) -> dict:
        """Convert to PostHog event format."""
        return {
            "event": "beton_signal_fired",
            "properties": {
                "$group_0": self.company_id,
                "signal_score": self.score,
                "signal_types": self.signal_types,
                "signal_count": len(self.signals),
                "detected_at": self.detected_at.isoformat()
            },
            "timestamp": self.detected_at.isoformat()
        }


class SignalScorer:
    """
    Calculates composite PQL scores combining multiple signal types.

    Scoring Algorithm:
    1. Sum individual signal base scores (capped at 80)
    2. Add diversity bonus: 5 points per unique signal type (max 20 points)
    3. Final score range: 0-100
    """

    BASE_SCORE_CAP = 80
    DIVERSITY_BONUS_PER_TYPE = 5
    DIVERSITY_BONUS_CAP = 20
    ROUTING_THRESHOLD = 60

    @staticmethod
    def calculate_composite_score(signals: List[DetectedSignal]) -> int:
        """
        Calculate final PQL score.

        Args:
            signals: List of detected signals for a single company

        Returns:
            Composite score (0-100)
        """
        if not signals:
            return 0

        # Sum individual signal scores (capped)
        base_total = sum(s.base_score for s in signals)
        base_score = min(base_total, SignalScorer.BASE_SCORE_CAP)

        # Diversity bonus: multiple signal types = stronger signal
        unique_types = len(set(s.signal_type for s in signals))
        diversity_bonus = min(
            unique_types * SignalScorer.DIVERSITY_BONUS_PER_TYPE,
            SignalScorer.DIVERSITY_BONUS_CAP
        )

        # Final composite
        final_score = min(base_score + diversity_bonus, 100)

        logger.debug(
            f"Score calculation: {len(signals)} signals, "
            f"base={base_score}/{SignalScorer.BASE_SCORE_CAP}, "
            f"diversity={diversity_bonus}, final={final_score}"
        )

        return final_score

    @staticmethod
    def score_signals(
        signals: List[DetectedSignal],
    ) -> List[CompositeSignal]:
        """
        Score signals grouped by company.

        Args:
            signals: List of detected signals

        Returns:
            List of composite scores, one per company
        """
        # Group signals by company
        by_company: Dict[str, List[DetectedSignal]] = {}
        for signal in signals:
            company_id = signal.company_id
            if company_id not in by_company:
                by_company[company_id] = []
            by_company[company_id].append(signal)

        # Calculate composite scores
        scored = []
        for company_id, company_signals in by_company.items():
            score = SignalScorer.calculate_composite_score(company_signals)
            signal_types = list(set(s.signal_type for s in company_signals))

            composite = CompositeSignal(
                company_id=company_id,
                score=score,
                signal_types=signal_types,
                signals=company_signals,
                detected_at=company_signals[0].detected_at
            )
            scored.append(composite)

        return scored

    @staticmethod
    def filter_high_score(
        signals: List[CompositeSignal],
        threshold: int = ROUTING_THRESHOLD
    ) -> List[CompositeSignal]:
        """
        Filter signals above score threshold for Attio routing.

        Args:
            signals: List of composite signals
            threshold: Score threshold (default: 60)

        Returns:
            Filtered list
        """
        return [s for s in signals if s.score >= threshold]
