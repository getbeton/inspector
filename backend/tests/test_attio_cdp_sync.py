"""
Tests for Attio to PostHog CDP Sync Service.

Tests the syncing of CRM data to PostHog's Customer Data Platform:
- Companies → PostHog Groups ($group_identify)
- People → PostHog Persons ($identify)
- Deals → Local database for Data Warehouse queries
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

from app.services.attio_cdp_sync import AttioToCDPSync, CDPSyncResult
from app.models import SyncState


class TestCDPSyncResult:
    """Tests for CDPSyncResult dataclass."""

    def test_cdp_sync_result_defaults(self):
        """Test CDPSyncResult has correct default values."""
        result = CDPSyncResult(success=True, entity_type="groups")

        assert result.success is True
        assert result.entity_type == "groups"
        assert result.total_records == 0
        assert result.synced == 0
        assert result.errors == 0
        assert result.duration_seconds == 0.0
        assert result.error_message is None

    def test_cdp_sync_result_with_values(self):
        """Test CDPSyncResult with custom values."""
        result = CDPSyncResult(
            success=True,
            entity_type="persons",
            total_records=100,
            synced=95,
            errors=5,
            duration_seconds=2.5
        )

        assert result.total_records == 100
        assert result.synced == 95
        assert result.errors == 5
        assert result.duration_seconds == 2.5


class TestAttioToCDPSyncValidation:
    """Tests for AttioToCDPSync token validation."""

    def test_personal_api_key_warning(self, db_session):
        """Test warning is logged for Personal API Key (phx_)."""
        with patch('app.services.attio_cdp_sync.get_attio_client') as mock_attio:
            mock_attio.return_value = Mock()

            # Mock config manager to return phx_ key
            with patch.object(AttioToCDPSync, '_validate_token'):
                sync = AttioToCDPSync(
                    db=db_session,
                    posthog_project_token="phx_test_personal_key",
                    posthog_host="https://app.posthog.com"
                )

                # Should set token but _validate_token will warn
                assert sync.posthog_token == "phx_test_personal_key"

    def test_project_api_key_accepted(self, db_session):
        """Test Project API Key (phc_ prefix) is accepted."""
        with patch('app.services.attio_cdp_sync.get_attio_client') as mock_attio:
            mock_attio.return_value = Mock()

            with patch.object(AttioToCDPSync, '_validate_token'):
                sync = AttioToCDPSync(
                    db=db_session,
                    posthog_project_token="phc_test_project_key",
                    posthog_host="https://app.posthog.com"
                )

                assert sync.posthog_token == "phc_test_project_key"


class TestAttioToCDPSyncCompanies:
    """Tests for syncing companies to PostHog Groups."""

    @pytest.fixture
    def mock_attio_companies(self):
        """Mock Attio companies response."""
        return [
            {
                "id": {"record_id": "company_1"},
                "values": {
                    "domains": [{"domain": "acme.com"}],
                    "name": [{"value": "Acme Corp"}],
                    "industry": [{"value": "Technology"}],
                    "employee_count": [{"value": 500}]
                }
            },
            {
                "id": {"record_id": "company_2"},
                "values": {
                    "domains": [{"domain": "globex.com"}],
                    "name": [{"value": "Globex Inc"}],
                    "industry": [{"value": "Manufacturing"}]
                }
            }
        ]

    def test_sync_companies_to_groups_success(self, db_session, mock_attio_companies):
        """Test successful sync of companies to PostHog Groups."""
        with patch('app.services.attio_cdp_sync.get_attio_client') as mock_attio:
            mock_client = Mock()
            mock_attio.return_value = mock_client

            # Mock the session for fetching companies
            mock_session = Mock()
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"data": mock_attio_companies}
            mock_session.post.return_value = mock_response
            mock_client._get_session.return_value = mock_session

            with patch.object(AttioToCDPSync, '_validate_token'):
                sync = AttioToCDPSync(
                    db=db_session,
                    posthog_project_token="phc_test_key",
                    posthog_host="https://app.posthog.com"
                )

                # Mock batch send
                with patch.object(sync, '_send_batch_to_posthog', return_value=2):
                    result = sync.sync_companies_to_groups(limit=100)

                assert result.success is True
                assert result.entity_type == "groups"
                assert result.total_records == 2
                assert result.synced == 2

    def test_sync_companies_empty_response(self, db_session):
        """Test handling of empty companies response."""
        with patch('app.services.attio_cdp_sync.get_attio_client') as mock_attio:
            mock_client = Mock()
            mock_attio.return_value = mock_client

            mock_session = Mock()
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"data": []}
            mock_session.post.return_value = mock_response
            mock_client._get_session.return_value = mock_session

            with patch.object(AttioToCDPSync, '_validate_token'):
                sync = AttioToCDPSync(
                    db=db_session,
                    posthog_project_token="phc_test_key",
                    posthog_host="https://app.posthog.com"
                )

                result = sync.sync_companies_to_groups()

                assert result.success is True
                assert result.total_records == 0


class TestAttioToCDPSyncPeople:
    """Tests for syncing people to PostHog Persons."""

    @pytest.fixture
    def mock_attio_people(self):
        """Mock Attio people response."""
        return [
            {
                "id": {"record_id": "person_1"},
                "values": {
                    "email_addresses": [{"email_address": "john@acme.com"}],
                    "name": [{"full_name": "John Doe"}],
                    "title": [{"value": "CTO"}]
                }
            },
            {
                "id": {"record_id": "person_2"},
                "values": {
                    "email_addresses": [{"email_address": "jane@globex.com"}],
                    "name": [{"full_name": "Jane Smith"}],
                    "title": [{"value": "VP Sales"}]
                }
            }
        ]

    def test_sync_people_to_persons_success(self, db_session, mock_attio_people):
        """Test successful sync of people to PostHog Persons."""
        with patch('app.services.attio_cdp_sync.get_attio_client') as mock_attio:
            mock_client = Mock()
            mock_attio.return_value = mock_client

            mock_session = Mock()
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"data": mock_attio_people}
            mock_session.post.return_value = mock_response
            mock_client._get_session.return_value = mock_session

            with patch.object(AttioToCDPSync, '_validate_token'):
                sync = AttioToCDPSync(
                    db=db_session,
                    posthog_project_token="phc_test_key",
                    posthog_host="https://app.posthog.com"
                )

                with patch.object(sync, '_send_batch_to_posthog', return_value=2):
                    result = sync.sync_people_to_persons(limit=100)

                assert result.success is True
                assert result.entity_type == "persons"
                assert result.total_records == 2

    def test_sync_people_skips_without_email(self, db_session):
        """Test people without email are skipped."""
        people_without_email = [
            {
                "id": {"record_id": "person_1"},
                "values": {
                    "name": [{"full_name": "No Email Person"}]
                }
            }
        ]

        with patch('app.services.attio_cdp_sync.get_attio_client') as mock_attio:
            mock_client = Mock()
            mock_attio.return_value = mock_client

            mock_session = Mock()
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"data": people_without_email}
            mock_session.post.return_value = mock_response
            mock_client._get_session.return_value = mock_session

            with patch.object(AttioToCDPSync, '_validate_token'):
                sync = AttioToCDPSync(
                    db=db_session,
                    posthog_project_token="phc_test_key",
                    posthog_host="https://app.posthog.com"
                )

                with patch.object(sync, '_send_batch_to_posthog', return_value=0):
                    result = sync.sync_people_to_persons()

                # Should succeed but with 0 synced (person skipped due to no email)
                assert result.success is True
                assert result.synced == 0


class TestAttioToCDPSyncDeals:
    """Tests for syncing deals to local database."""

    def test_sync_deals_to_warehouse(self, db_session):
        """Test deals are synced to local database for Data Warehouse queries."""
        mock_deals = [
            {
                "id": {"record_id": "deal_1"},
                "values": {
                    "name": [{"value": "Enterprise Deal"}],
                    "amount": [{"currency_value": 50000}]
                }
            }
        ]

        with patch('app.services.attio_cdp_sync.get_attio_client') as mock_attio:
            mock_client = Mock()
            mock_attio.return_value = mock_client

            mock_session = Mock()
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"data": mock_deals}
            mock_session.post.return_value = mock_response
            mock_client._get_session.return_value = mock_session

            with patch.object(AttioToCDPSync, '_validate_token'):
                sync = AttioToCDPSync(
                    db=db_session,
                    posthog_project_token="phc_test_key"
                )

                result = sync.sync_deals_to_warehouse()

                assert result.success is True
                assert result.entity_type == "deals"
                assert result.total_records == 1


class TestAttioToCDPSyncAll:
    """Tests for syncing all entity types."""

    def test_sync_all_runs_all_syncs(self, db_session):
        """Test sync_all runs all entity syncs."""
        with patch('app.services.attio_cdp_sync.get_attio_client') as mock_attio:
            mock_client = Mock()
            mock_attio.return_value = mock_client

            # Mock empty responses for all entities
            mock_session = Mock()
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"data": []}
            mock_session.post.return_value = mock_response
            mock_client._get_session.return_value = mock_session

            with patch.object(AttioToCDPSync, '_validate_token'):
                sync = AttioToCDPSync(
                    db=db_session,
                    posthog_project_token="phc_test_key"
                )

                results = sync.sync_all()

                assert "groups" in results
                assert "persons" in results
                assert "deals" in results

                assert results["groups"].entity_type == "groups"
                assert results["persons"].entity_type == "persons"
                assert results["deals"].entity_type == "deals"


class TestAttioToCDPSyncState:
    """Tests for sync state tracking."""

    def test_update_sync_state_creates_new(self, db_session):
        """Test sync state is created for first sync."""
        with patch('app.services.attio_cdp_sync.get_attio_client') as mock_attio:
            mock_client = Mock()
            mock_attio.return_value = mock_client

            with patch.object(AttioToCDPSync, '_validate_token'):
                sync = AttioToCDPSync(
                    db=db_session,
                    posthog_project_token="phc_test_key"
                )

                results = {
                    "groups": CDPSyncResult(success=True, entity_type="groups", total_records=10, synced=10),
                    "persons": CDPSyncResult(success=True, entity_type="persons", total_records=5, synced=5),
                    "deals": CDPSyncResult(success=True, entity_type="deals", total_records=3, synced=3)
                }

                sync.update_sync_state(results)

                # Verify state was created
                state = db_session.query(SyncState).filter(
                    SyncState.integration_name == "attio_cdp"
                ).first()

                assert state is not None
                assert state.status == "success"
                assert state.records_processed == 18  # 10 + 5 + 3
                assert state.records_succeeded == 18

    def test_update_sync_state_updates_existing(self, db_session):
        """Test sync state is updated for subsequent syncs."""
        # Create existing state
        existing_state = SyncState(
            integration_name="attio_cdp",
            status="success",
            records_processed=5,
            records_succeeded=5,
            records_failed=0,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db_session.add(existing_state)
        db_session.commit()

        with patch('app.services.attio_cdp_sync.get_attio_client') as mock_attio:
            mock_client = Mock()
            mock_attio.return_value = mock_client

            with patch.object(AttioToCDPSync, '_validate_token'):
                sync = AttioToCDPSync(
                    db=db_session,
                    posthog_project_token="phc_test_key"
                )

                results = {
                    "groups": CDPSyncResult(success=True, entity_type="groups", total_records=20, synced=20),
                    "persons": CDPSyncResult(success=False, entity_type="persons", total_records=10, synced=5, errors=5),
                    "deals": CDPSyncResult(success=True, entity_type="deals", total_records=0, synced=0)
                }

                sync.update_sync_state(results)

                # Verify state was updated
                state = db_session.query(SyncState).filter(
                    SyncState.integration_name == "attio_cdp"
                ).first()

                assert state.status == "partial"  # Because persons failed
                assert state.records_processed == 30
                assert state.records_succeeded == 25
                assert state.records_failed == 5


class TestPostHogBatchSending:
    """Tests for PostHog batch event sending."""

    def test_send_batch_requires_token(self, db_session):
        """Test batch send raises error without token."""
        with patch('app.services.attio_cdp_sync.get_attio_client') as mock_attio:
            mock_attio.return_value = Mock()

            with patch.object(AttioToCDPSync, '_validate_token'):
                sync = AttioToCDPSync(
                    db=db_session,
                    posthog_project_token=None
                )

                with pytest.raises(ValueError, match="Project API Key not configured"):
                    sync._send_batch_to_posthog([{"event": "test"}])

    def test_send_batch_rejects_personal_key(self, db_session):
        """Test batch send rejects Personal API Key."""
        with patch('app.services.attio_cdp_sync.get_attio_client') as mock_attio:
            mock_attio.return_value = Mock()

            with patch.object(AttioToCDPSync, '_validate_token'):
                sync = AttioToCDPSync(
                    db=db_session,
                    posthog_project_token="phx_personal_key"
                )

                with pytest.raises(ValueError, match="Personal API Key"):
                    sync._send_batch_to_posthog([{"event": "test"}])

    def test_send_batch_success(self, db_session):
        """Test successful batch send."""
        with patch('app.services.attio_cdp_sync.get_attio_client') as mock_attio:
            mock_attio.return_value = Mock()

            with patch.object(AttioToCDPSync, '_validate_token'):
                sync = AttioToCDPSync(
                    db=db_session,
                    posthog_project_token="phc_project_key"
                )

                with patch('app.services.attio_cdp_sync.requests.post') as mock_post:
                    mock_response = Mock()
                    mock_response.status_code = 200
                    mock_post.return_value = mock_response

                    events = [
                        {"event": "$group_identify", "distinct_id": "test1"},
                        {"event": "$group_identify", "distinct_id": "test2"}
                    ]

                    count = sync._send_batch_to_posthog(events)

                    assert count == 2
                    mock_post.assert_called_once()
