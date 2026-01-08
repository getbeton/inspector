---
description: Add a new signal type to the heuristics engine
globs:
  - "backend/app/heuristics/*.py"
  - "backend/tests/test_heuristics.py"
---

# /add-signal - Add New Signal Type

Use this skill to add a new signal type to Beton's heuristics engine. Signals detect product usage patterns that indicate expansion, churn risk, or sales opportunities.

## Workflow

### Step 1: Define the signal detector

Add to `backend/app/heuristics/signals.py` (or create a new file in the heuristics folder):

```python
class <SignalName>Detector(BaseSignalDetector):
    """
    Detects <description of what this signal identifies>.

    Triggers when:
    - <Condition 1>
    - <Condition 2>

    Signal value: <what the value represents>
    """

    SIGNAL_TYPE = "<signal_type_snake_case>"
    SIGNAL_CATEGORY = "<expansion|churn|engagement|billing>"

    def __init__(self, db: Session, config: Dict):
        super().__init__(db, config)
        # Get thresholds from config
        self.threshold = config.get('signals', {}).get(
            '<signal_type>_threshold', <default_value>
        )

    def detect(self, account_id: int) -> Optional[Signal]:
        """
        Detect <signal_type> for an account.

        Args:
            account_id: Account to check

        Returns:
            Signal if detected, None otherwise
        """
        account = self.db.query(Account).get(account_id)
        if not account:
            return None

        # Your detection logic here
        # Example: Check metrics, events, or account state
        metric_value = self._get_metric(account_id, '<metric_name>')

        if metric_value and metric_value > self.threshold:
            return Signal(
                account_id=account_id,
                workspace_id=account.workspace_id,
                type=self.SIGNAL_TYPE,
                value=metric_value,
                category=self.SIGNAL_CATEGORY,
                timestamp=datetime.utcnow(),
                metadata={
                    'threshold': self.threshold,
                    'actual_value': metric_value,
                    # Add context for the signal
                }
            )

        return None

    def _get_metric(self, account_id: int, metric_name: str) -> Optional[float]:
        """Get latest metric value for account."""
        from .models import MetricSnapshot

        snapshot = self.db.query(MetricSnapshot).filter(
            MetricSnapshot.account_id == account_id,
            MetricSnapshot.metric_name == metric_name
        ).order_by(MetricSnapshot.snapshot_date.desc()).first()

        return snapshot.metric_value if snapshot else None
```

### Step 2: Register the detector

Add to `backend/app/heuristics/signal_processor.py` in `_init_signal_detectors()`:

```python
def _init_signal_detectors(self):
    """Initialize all signal detectors."""
    self.detectors = [
        # ... existing detectors ...
        <SignalName>Detector(self.db, self.config),
    ]
```

### Step 3: Add configuration (optional)

Add thresholds to `backend/app/heuristics/config.yaml` or the scoring config:

```yaml
signals:
  <signal_type>_threshold: <value>
  <signal_type>_weight: <scoring_weight>
```

### Step 4: Update scoring weights

If the signal affects health/expansion/churn scores, add to `backend/app/heuristics/heuristics_engine.py`:

```python
SIGNAL_WEIGHTS = {
    # ... existing weights ...
    '<signal_type>': {
        'health_impact': <-10 to +10>,      # Negative = bad for health
        'expansion_impact': <-10 to +10>,   # Positive = expansion opportunity
        'churn_impact': <-10 to +10>,       # Positive = churn risk
    },
}
```

### Step 5: Create tests

Add to `backend/tests/test_heuristics.py`:

```python
class Test<SignalName>Detector:
    """Tests for <signal_type> detection."""

    def test_detects_when_threshold_exceeded(self, db_session, test_account):
        """Signal fires when metric exceeds threshold."""
        # Setup: Create metric above threshold
        from app.heuristics.models import MetricSnapshot

        MetricSnapshot(
            account_id=test_account.id,
            metric_name='<metric_name>',
            metric_value=<above_threshold>,
            snapshot_date=date.today()
        )
        db_session.commit()

        # Act
        detector = <SignalName>Detector(db_session, {})
        signal = detector.detect(test_account.id)

        # Assert
        assert signal is not None
        assert signal.type == '<signal_type>'
        assert signal.value == <expected_value>

    def test_no_signal_when_below_threshold(self, db_session, test_account):
        """No signal when metric is below threshold."""
        # Setup: Create metric below threshold
        # ...

        detector = <SignalName>Detector(db_session, {})
        signal = detector.detect(test_account.id)

        assert signal is None

    def test_no_signal_when_no_data(self, db_session, test_account):
        """No signal when account has no metric data."""
        detector = <SignalName>Detector(db_session, {})
        signal = detector.detect(test_account.id)

        assert signal is None
```

---

## Existing Signal Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| `expansion` | Upsell/upgrade opportunities | Usage spike, nearing paywall, seat limit |
| `churn` | Churn risk indicators | Usage drop, inactivity, low NPS |
| `engagement` | User engagement patterns | Director signup, invites sent |
| `billing` | Revenue-related signals | ARR decrease, upcoming renewal |

## Existing Detectors (Reference)

Located in `backend/app/heuristics/signals.py`:

- `UsageSpikeDetector` - Detects sudden usage increases
- `UsageDropDetector` - Detects usage declines
- `NearingPaywallDetector` - Approaching plan limits
- `DirectorSignupDetector` - Decision-maker signed up
- `InvitesSentDetector` - Team expansion activity
- `HighNPSDetector` / `LowNPSDetector` - NPS-based signals
- `InactivityDetector` - No recent activity
- `TrialEndingDetector` - Trial expiration approaching
- `UpcomingRenewalDetector` - Contract renewal due
- ... and more (see `signal_processor.py:36-57`)

---

## Checklist

- [ ] Created detector class in `backend/app/heuristics/signals.py`
- [ ] Registered detector in `signal_processor.py`
- [ ] Added configuration thresholds (if needed)
- [ ] Updated scoring weights in `heuristics_engine.py`
- [ ] Created tests in `backend/tests/test_heuristics.py`
- [ ] Tested locally: `docker-compose exec backend pytest -k test_<signal>`
