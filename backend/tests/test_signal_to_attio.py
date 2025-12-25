"""
Tests for Signal to Attio Deal Pipeline.

Tests the piping of detected signals to Attio CRM as deals:
- Signal matching to Attio companies via domain
- Deal creation with signal data
- Note addition with signal details
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

from app.services.signal_to_attio import (
    SignalToAttioPipeline,
    DealPipeResult,
    SignalPipelineResult,
    DEAL_ATTRIBUTES
)
from app.models import Signal, Account, SyncState


class TestDealPipeResult:
    """Tests for DealPipeResult dataclass."""

    def test_deal_pipe_result_success(self):
        """Test successful deal pipe result."""
        result = DealPipeResult(
            signal_id=1,
            account_id=1,
            domain="acme.com",
            success=True,
            attio_deal_id="deal_123",
            attio_company_id="company_456"
        )

        assert result.success is True
        assert result.signal_id == 1
        assert result.attio_deal_id == "deal_123"
        assert result.error is None

    def test_deal_pipe_result_failure(self):
        """Test failed deal pipe result."""
        result = DealPipeResult(
            signal_id=1,
            account_id=1,
            domain="acme.com",
            success=False,
            error="API error"
        )

        assert result.success is False
        assert result.error == "API error"
        assert result.attio_deal_id is None


class TestSignalPipelineResult:
    """Tests for SignalPipelineResult dataclass."""

    def test_pipeline_result_defaults(self):
        """Test SignalPipelineResult default values."""
        result = SignalPipelineResult(success=True)

        assert result.success is True
        assert result.total_signals == 0
        assert result.deals_created == 0
        assert result.companies_matched == 0
        assert result.errors == 0
        assert result.results == []

    def test_pipeline_result_with_results(self):
        """Test SignalPipelineResult with deal results."""
        deal_results = [
            DealPipeResult(signal_id=1, account_id=1, domain="a.com", success=True),
            DealPipeResult(signal_id=2, account_id=2, domain="b.com", success=False, error="Failed")
        ]

        result = SignalPipelineResult(
            success=False,
            total_signals=2,
            deals_created=1,
            errors=1,
            results=deal_results
        )

        assert len(result.results) == 2
        assert result.deals_created == 1
        assert result.errors == 1


class TestDealAttributes:
    """Tests for deal attribute specifications."""

    def test_deal_attributes_defined(self):
        """Test required deal attributes are defined."""
        assert len(DEAL_ATTRIBUTES) > 0

        # Check required attributes exist
        slugs = [attr["api_slug"] for attr in DEAL_ATTRIBUTES]
        assert "beton_signal_type" in slugs
        assert "beton_signal_value" in slugs
        assert "beton_signal_source" in slugs
        assert "beton_signal_id" in slugs

    def test_deal_attributes_have_required_fields(self):
        """Test each attribute has required fields."""
        for attr in DEAL_ATTRIBUTES:
            assert "api_slug" in attr
            assert "title" in attr
            assert "type" in attr
            assert "description" in attr


class TestSignalToAttioPipelineInit:
    """Tests for SignalToAttioPipeline initialization."""

    def test_pipeline_initialization(self, db_session):
        """Test pipeline can be initialized."""
        with patch('app.services.signal_to_attio.get_attio_client') as mock_attio:
            mock_attio.return_value = Mock()

            pipeline = SignalToAttioPipeline(db=db_session)

            assert pipeline.db == db_session
            assert pipeline._company_cache == {}

    def test_pipeline_with_custom_attio_client(self, db_session):
        """Test pipeline with custom Attio client."""
        mock_client = Mock()

        pipeline = SignalToAttioPipeline(
            db=db_session,
            attio_client=mock_client
        )

        assert pipeline.attio == mock_client


class TestSignalToAttioPipelineCompanyMatching:
    """Tests for company matching in the pipeline."""

    def test_find_attio_company_success(self, db_session):
        """Test finding Attio company by domain."""
        with patch('app.services.signal_to_attio.get_attio_client') as mock_attio:
            mock_client = Mock()
            mock_attio.return_value = mock_client

            # Mock company search response
            mock_session = Mock()
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "data": [{"id": {"record_id": "company_123"}}]
            }
            mock_session.post.return_value = mock_response
            mock_client._get_session.return_value = mock_session

            pipeline = SignalToAttioPipeline(db=db_session)
            company_id = pipeline._find_attio_company("acme.com")

            assert company_id == "company_123"

    def test_find_attio_company_not_found(self, db_session):
        """Test handling when company is not found."""
        with patch('app.services.signal_to_attio.get_attio_client') as mock_attio:
            mock_client = Mock()
            mock_attio.return_value = mock_client

            mock_session = Mock()
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"data": []}
            mock_session.post.return_value = mock_response
            mock_client._get_session.return_value = mock_session

            pipeline = SignalToAttioPipeline(db=db_session)
            company_id = pipeline._find_attio_company("unknown.com")

            assert company_id is None

    def test_find_attio_company_caches_result(self, db_session):
        """Test company lookup is cached."""
        with patch('app.services.signal_to_attio.get_attio_client') as mock_attio:
            mock_client = Mock()
            mock_attio.return_value = mock_client

            mock_session = Mock()
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "data": [{"id": {"record_id": "company_123"}}]
            }
            mock_session.post.return_value = mock_response
            mock_client._get_session.return_value = mock_session

            pipeline = SignalToAttioPipeline(db=db_session)

            # First call
            result1 = pipeline._find_attio_company("acme.com")
            # Second call (should use cache)
            result2 = pipeline._find_attio_company("acme.com")

            assert result1 == result2 == "company_123"
            # Should only call API once due to caching
            assert mock_session.post.call_count == 1


class TestSignalToAttioPipelineDealCreation:
    """Tests for deal creation in the pipeline."""

    @pytest.fixture
    def sample_signal_and_account(self, db_session):
        """Create sample signal and account for testing."""
        account = Account(
            id=1,
            name="Test Company",
            domain="test.com",
            health_score=75.0,
            status="active"
        )
        db_session.add(account)
        db_session.commit()

        signal = Signal(
            id=1,
            account_id=account.id,
            type="usage_spike",
            value=150.0,
            source="posthog",
            timestamp=datetime.utcnow(),
            details={"event": "feature_used", "count": 100}
        )
        db_session.add(signal)
        db_session.commit()

        return signal, account

    def test_create_deal_from_signal_success(self, db_session, sample_signal_and_account):
        """Test successful deal creation from signal."""
        signal, account = sample_signal_and_account

        with patch('app.services.signal_to_attio.get_attio_client') as mock_attio:
            mock_client = Mock()
            mock_attio.return_value = mock_client

            # Mock deal search (none existing)
            mock_session = Mock()
            mock_search_response = Mock()
            mock_search_response.status_code = 200
            mock_search_response.json.return_value = {"data": []}

            # Mock deal creation
            mock_create_response = Mock()
            mock_create_response.status_code = 201
            mock_create_response.json.return_value = {
                "data": {"id": {"record_id": "deal_123"}}
            }

            mock_session.post.return_value = mock_search_response
            mock_session.put.return_value = mock_create_response
            mock_client._get_session.return_value = mock_session

            pipeline = SignalToAttioPipeline(db=db_session)
            result = pipeline._create_deal_from_signal(signal, account, "company_123")

            assert result.success is True
            assert result.attio_deal_id == "deal_123"
            assert result.signal_id == signal.id

    def test_create_deal_handles_existing(self, db_session, sample_signal_and_account):
        """Test deal creation skips if already exists."""
        signal, account = sample_signal_and_account

        with patch('app.services.signal_to_attio.get_attio_client') as mock_attio:
            mock_client = Mock()
            mock_attio.return_value = mock_client

            # Mock existing deal found
            mock_session = Mock()
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "data": [{"id": {"record_id": "existing_deal"}}]
            }
            mock_session.post.return_value = mock_response
            mock_client._get_session.return_value = mock_session

            pipeline = SignalToAttioPipeline(db=db_session)
            result = pipeline._create_deal_from_signal(signal, account)

            assert result.success is True
            assert result.attio_deal_id == "existing_deal"


class TestSignalToAttioPipelinePipeSignals:
    """Tests for the main pipe_signals method."""

    def test_pipe_signals_no_signals(self, db_session):
        """Test pipe_signals with no signals to process."""
        with patch('app.services.signal_to_attio.get_attio_client') as mock_attio:
            mock_client = Mock()
            mock_attio.return_value = mock_client

            pipeline = SignalToAttioPipeline(db=db_session)
            result = pipeline.pipe_signals()

            assert result.success is True
            assert result.total_signals == 0
            assert result.deals_created == 0

    def test_pipe_signals_with_signals(self, db_session):
        """Test pipe_signals processes signals correctly."""
        # Create test data
        account = Account(
            name="Test Corp",
            domain="testcorp.com",
            health_score=80.0
        )
        db_session.add(account)
        db_session.commit()

        signal = Signal(
            account_id=account.id,
            type="billing_increase",
            value=500.0,
            source="stripe",
            timestamp=datetime.utcnow()
        )
        db_session.add(signal)
        db_session.commit()

        with patch('app.services.signal_to_attio.get_attio_client') as mock_attio:
            mock_client = Mock()
            mock_attio.return_value = mock_client

            # Mock ensure_attributes
            mock_client.ensure_attributes.return_value = {}

            # Mock company search
            mock_session = Mock()
            mock_search_response = Mock()
            mock_search_response.status_code = 200
            mock_search_response.json.return_value = {
                "data": [{"id": {"record_id": "company_1"}}]
            }

            # Mock deal creation
            mock_create_response = Mock()
            mock_create_response.status_code = 201
            mock_create_response.json.return_value = {
                "data": {"id": {"record_id": "deal_1"}}
            }

            mock_session.post.return_value = mock_search_response
            mock_session.put.return_value = mock_create_response
            mock_client._get_session.return_value = mock_session

            pipeline = SignalToAttioPipeline(db=db_session)

            with patch.object(pipeline, '_ensure_deal_attributes', return_value=True):
                result = pipeline.pipe_signals(limit=10)

            assert result.total_signals == 1
            assert result.companies_matched == 1

    def test_pipe_signals_filters_by_type(self, db_session):
        """Test pipe_signals filters by signal type."""
        account = Account(name="Test", domain="test.com")
        db_session.add(account)
        db_session.commit()

        # Create signals of different types
        signal1 = Signal(
            account_id=account.id,
            type="usage_spike",
            source="posthog",
            timestamp=datetime.utcnow()
        )
        signal2 = Signal(
            account_id=account.id,
            type="billing_increase",
            source="stripe",
            timestamp=datetime.utcnow()
        )
        db_session.add_all([signal1, signal2])
        db_session.commit()

        with patch('app.services.signal_to_attio.get_attio_client') as mock_attio:
            mock_attio.return_value = Mock()

            pipeline = SignalToAttioPipeline(db=db_session)

            with patch.object(pipeline, '_ensure_deal_attributes', return_value=True):
                with patch.object(pipeline, '_find_attio_company', return_value=None):
                    with patch.object(pipeline, '_create_deal_from_signal') as mock_create:
                        mock_create.return_value = DealPipeResult(
                            signal_id=1, account_id=1, domain="test.com", success=True
                        )

                        # Filter to only usage_spike
                        result = pipeline.pipe_signals(signal_types=["usage_spike"])

                        # Should only process 1 signal
                        assert mock_create.call_count == 1


class TestSignalToAttioPipelineSyncState:
    """Tests for sync state tracking."""

    def test_update_sync_state_creates_new(self, db_session):
        """Test sync state is created for first pipeline run."""
        with patch('app.services.signal_to_attio.get_attio_client') as mock_attio:
            mock_attio.return_value = Mock()

            pipeline = SignalToAttioPipeline(db=db_session)

            result = SignalPipelineResult(
                success=True,
                total_signals=10,
                deals_created=8,
                companies_matched=7,
                errors=2
            )

            pipeline.update_sync_state(result)

            state = db_session.query(SyncState).filter(
                SyncState.integration_name == "signal_to_attio"
            ).first()

            assert state is not None
            assert state.status == "success"
            assert state.records_processed == 10
            assert state.records_succeeded == 8
            assert state.records_failed == 2

    def test_update_sync_state_partial_on_errors(self, db_session):
        """Test sync state shows partial status on errors."""
        with patch('app.services.signal_to_attio.get_attio_client') as mock_attio:
            mock_attio.return_value = Mock()

            pipeline = SignalToAttioPipeline(db=db_session)

            result = SignalPipelineResult(
                success=False,
                total_signals=10,
                deals_created=5,
                errors=5,
                error_message="Some deals failed"
            )

            pipeline.update_sync_state(result)

            state = db_session.query(SyncState).filter(
                SyncState.integration_name == "signal_to_attio"
            ).first()

            assert state.status == "partial"
            assert state.error_summary == "Some deals failed"


class TestSignalToAttioPipelineNotes:
    """Tests for adding notes to deals."""

    def test_add_signal_note(self, db_session):
        """Test adding a note with signal details."""
        signal = Mock()
        signal.type = "usage_spike"
        signal.timestamp = datetime.utcnow()
        signal.source = "posthog"
        signal.value = 150.0
        signal.details = {"feature": "api_calls", "increase": "50%"}

        with patch('app.services.signal_to_attio.get_attio_client') as mock_attio:
            mock_client = Mock()
            mock_attio.return_value = mock_client

            mock_session = Mock()
            mock_response = Mock()
            mock_response.status_code = 200
            mock_session.post.return_value = mock_response
            mock_client._get_session.return_value = mock_session

            pipeline = SignalToAttioPipeline(db=db_session)
            success = pipeline._add_signal_note("deal_123", signal)

            assert success is True
            # Verify note API was called
            assert mock_session.post.called
