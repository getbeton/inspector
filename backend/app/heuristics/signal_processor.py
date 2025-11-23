"""
SignalProcessor service - Epic 4 Task #1
Ingests raw events and calculates metrics, then detects signals.
"""
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
from datetime import datetime, date, timedelta
from collections import defaultdict

from app.models import Signal, Account
from .models import MetricSnapshot
from .signals import *
from .utils import load_scoring_config


class SignalProcessor:
    """
    Processes raw events into metric snapshots and detects signals.
    Core service for the heuristics engine.
    """
    
    def __init__(self, db_session: Session, config: Dict = None):
        """
        Initialize SignalProcessor.
        
        Args:
            db_session: Database session
            config: Optional scoring configuration
        """
        self.db = db_session
        self.config = config or load_scoring_config()
        self._init_signal_detectors()
    
    def _init_signal_detectors(self):
        """Initialize all Phase 1 signal detectors."""
        self.detectors = [
            UsageSpikeDetector(self.db, self.config),
            UsageDropDetector(self.db, self.config),
            NearingPaywallDetector(self.db, self.config),
            DirectorSignupDetector(self.db, self.config),
            InvitesSentDetector(self.db, self.config),
            NewDepartmentUserDetector(self.db, self.config),
            HighNPSDetector(self.db, self.config),
            LowNPSDetector(self.db, self.config),
            InactivityDetector(self.db, self.config),
            UsageWoWDeclineDetector(self.db, self.config),
            TrialEndingDetector(self.db, self.config),
            UpcomingRenewalDetector(self.db, self.config),
            FreeDecisionMakerDetector(self.db, self.config),
            UpgradePageVisitDetector(self.db, self.config),
            ApproachingSeatLimitDetector(self.db, self.config),
            OverageDetector(self.db, self.config),
            HealthScoreDecreaseDetector(self.db, self.config),
            ARRDecreaseDetector(self.db, self.config),
            IncompleteOnboardingDetector(self.db, self.config),
            FutureCancellationDetector(self.db, self.config),
        ]
    
    def process_events(self, events: List[Dict]) -> List[MetricSnapshot]:
        """
        Process raw events into metric snapshots.
        Handles deduplication and batch processing.
        
        Args:
            events: List of event dictionaries from PostHog, Stripe, etc.
        
        Returns:
            List of created MetricSnapshot records
        """
        if not events:
            return []
        
        # Group events by account and date
        metrics_by_account_date = defaultdict(lambda: defaultdict(list))
        
        for event in events:
            account_id = event.get('account_id')
            timestamp = event.get('timestamp')
            
            if not account_id or not timestamp:
                continue
            
            # Convert timestamp to date
            if isinstance(timestamp, str):
                timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            event_date = timestamp.date()
            
            metrics_by_account_date[account_id][event_date].append(event)
        
        # Create metric snapshots
        snapshots = []
        batch_size = self.config['signal_processing'].get('batch_size', 100)
        
        for account_id, date_events in metrics_by_account_date.items():
            for event_date, day_events in date_events.items():
                # Calculate daily metrics for this account
                daily_metrics = self._calculate_daily_metrics(account_id, day_events, event_date)
                
                # Create snapshot records
                for metric_name, metric_value in daily_metrics.items():
                    snapshot = MetricSnapshot(
                        account_id=account_id,
                        metric_name=metric_name,
                        metric_value=metric_value,
                        snapshot_date=event_date,
                        created_at=datetime.utcnow()
                    )
                    snapshots.append(snapshot)
                    
                    # Batch commit
                    if len(snapshots) >= batch_size:
                        self.db.bulk_save_objects(snapshots)
                        self.db.commit()
                        snapshots = []
        
        # Commit remaining
        if snapshots:
            self.db.bulk_save_objects(snapshots)
            self.db.commit()
        
        return snapshots
    
    def _calculate_daily_metrics(
        self,
        account_id: int,
        events: List[Dict],
        event_date: date
    ) -> Dict[str, float]:
        """
        Calculate daily metrics from raw events.
        
        Args:
            account_id: Account ID
            events: Events for this account and date
            event_date: Date of events
        
        Returns:
            Dictionary of metric_name -> value
        """
        metrics = {}
        
        # Count events by type
        event_counts = defaultdict(int)
        for event in events:
            event_type = event.get('event', 'unknown')
            event_counts[event_type] += 1
        
        # Standard metrics
        metrics['total_events'] = len(events)
        metrics['unique_event_types'] = len(event_counts)
        
        # Specific event counts
        for event_type, count in event_counts.items():
            metrics[f'{event_type}_count'] = count
        
        # Active users (unique distinct_ids)
        unique_users = set(event.get('distinct_id') for event in events if event.get('distinct_id'))
        metrics['active_users'] = len(unique_users)
        
        return metrics
    
    def detect_signals(self, account_id: int) -> List[Signal]:
        """
        Run all signal detectors for an account.
        
        Args:
            account_id: Account ID to check
        
        Returns:
            List of detected signals
        """
        detected_signals = []
        
        for detector in self.detectors:
            try:
                signal = detector.detect(account_id)
                if signal:
                    detected_signals.append(signal)
            except Exception as e:
                # Log error but continue with other detectors
                print(f"Error in {detector.__class__.__name__}: {e}")
                continue
        
        return detected_signals
    
    def process_account(self, account_id: int) -> Dict:
        """
        Full processing for a single account: detect all signals.
        
        Args:
            account_id: Account ID
        
        Returns:
            Dictionary with processing results
        """
        signals = self.detect_signals(account_id)
        
        return {
            'account_id': account_id,
            'signals_detected': len(signals),
            'signal_types': [s.type for s in signals],
            'timestamp': datetime.utcnow().isoformat()
        }
    
    def process_all_accounts(self) -> List[Dict]:
        """
        Process signals for all accounts.
        
        Returns:
            List of processing results per account
        """
        accounts = self.db.query(Account).all()
        results = []
        
        for account in accounts:
            result = self.process_account(account.id)
            results.append(result)
        
        return results
