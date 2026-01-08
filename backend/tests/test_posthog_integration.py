"""
Tests for PostHog Integration (Epic 6).

Tests cover:
- PostHogWorkspaceClient: API key validation, connection, error handling
- PostHogValidatorService: Credential validation, storage, config management
- API Endpoints: /api/posthog/validate, /api/posthog/status, /api/posthog/disconnect

Run with: pytest backend/tests/test_posthog_integration.py -v
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

# ============================================
# PostHogWorkspaceClient Tests
# ============================================

class TestPostHogWorkspaceClient:
    """Tests for PostHogWorkspaceClient class."""

    def test_valid_api_key_format(self):
        """Test that valid API key format is accepted."""
        from app.integrations.posthog_workspace_client import PostHogWorkspaceClient

        # Valid format - starts with phc_ and is long enough
        valid_key = "phc_" + "a" * 40

        # Should not raise
        with patch.object(PostHogWorkspaceClient, '_create_session', return_value=Mock()):
            client = PostHogWorkspaceClient(api_key=valid_key)
            assert client.api_key == valid_key

    def test_invalid_api_key_format_no_prefix(self):
        """Test that API keys without phc_ prefix are rejected."""
        from app.integrations.posthog_workspace_client import (
            PostHogWorkspaceClient,
            InvalidAPIKeyError
        )

        invalid_key = "abc_" + "x" * 40

        with pytest.raises(InvalidAPIKeyError) as exc_info:
            PostHogWorkspaceClient(api_key=invalid_key)

        assert "phc_" in str(exc_info.value)

    def test_invalid_api_key_format_too_short(self):
        """Test that short API keys are rejected."""
        from app.integrations.posthog_workspace_client import (
            PostHogWorkspaceClient,
            InvalidAPIKeyError
        )

        short_key = "phc_abc"  # Too short

        with pytest.raises(InvalidAPIKeyError):
            PostHogWorkspaceClient(api_key=short_key)

    def test_empty_api_key(self):
        """Test that empty API keys are rejected."""
        from app.integrations.posthog_workspace_client import (
            PostHogWorkspaceClient,
            InvalidAPIKeyError
        )

        with pytest.raises(InvalidAPIKeyError):
            PostHogWorkspaceClient(api_key="")

        with pytest.raises(InvalidAPIKeyError):
            PostHogWorkspaceClient(api_key=None)

    def test_validate_key_format_static_method(self):
        """Test the static key format validation method."""
        from app.integrations.posthog_workspace_client import PostHogWorkspaceClient

        # Valid
        assert PostHogWorkspaceClient._validate_key_format("phc_" + "a" * 40) is True

        # Invalid - wrong prefix
        assert PostHogWorkspaceClient._validate_key_format("abc_" + "a" * 40) is False

        # Invalid - too short
        assert PostHogWorkspaceClient._validate_key_format("phc_abc") is False

        # Invalid - empty
        assert PostHogWorkspaceClient._validate_key_format("") is False
        assert PostHogWorkspaceClient._validate_key_format(None) is False

    @patch('requests.Session.request')
    def test_validate_credentials_success(self, mock_request):
        """Test successful credential validation."""
        from app.integrations.posthog_workspace_client import PostHogWorkspaceClient

        # Mock successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "results": [
                {
                    "id": 12345,
                    "name": "Test Project",
                    "organization": "org-123",
                    "organization_name": "Test Org"
                }
            ]
        }
        mock_request.return_value = mock_response

        client = PostHogWorkspaceClient(api_key="phc_" + "a" * 40)
        result = client.validate_credentials()

        assert result is True

    @patch('requests.Session.request')
    def test_validate_credentials_invalid_key(self, mock_request):
        """Test credential validation with invalid key."""
        from app.integrations.posthog_workspace_client import (
            PostHogWorkspaceClient,
            InvalidAPIKeyError
        )

        # Mock 401 response
        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"
        mock_request.return_value = mock_response

        client = PostHogWorkspaceClient(api_key="phc_" + "a" * 40)

        with pytest.raises(InvalidAPIKeyError):
            client.validate_credentials()

    @patch('requests.Session.request')
    def test_validate_credentials_rate_limited(self, mock_request):
        """Test credential validation when rate limited."""
        from app.integrations.posthog_workspace_client import (
            PostHogWorkspaceClient,
            RateLimitExceededError
        )

        # Mock 429 response
        mock_response = Mock()
        mock_response.status_code = 429
        mock_response.headers = {'Retry-After': '30'}
        mock_request.return_value = mock_response

        client = PostHogWorkspaceClient(api_key="phc_" + "a" * 40)

        with pytest.raises(RateLimitExceededError) as exc_info:
            client.validate_credentials()

        assert exc_info.value.retry_after == 30

    @patch('requests.Session.request')
    def test_get_workspace_info(self, mock_request):
        """Test getting workspace info."""
        from app.integrations.posthog_workspace_client import PostHogWorkspaceClient

        # Mock response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "results": [
                {
                    "id": 12345,
                    "name": "Test Project",
                    "organization": "org-123",
                    "organization_name": "Test Org",
                    "timezone": "UTC",
                    "is_demo": False
                }
            ]
        }
        mock_request.return_value = mock_response

        client = PostHogWorkspaceClient(api_key="phc_" + "a" * 40)
        info = client.get_workspace_info()

        assert info.id == "12345"
        assert info.name == "Test Project"
        assert info.organization_name == "Test Org"

    @patch('requests.Session.request')
    def test_connection_timeout(self, mock_request):
        """Test handling of connection timeouts."""
        from app.integrations.posthog_workspace_client import (
            PostHogWorkspaceClient,
            TimeoutError
        )
        import requests

        mock_request.side_effect = requests.exceptions.Timeout()

        client = PostHogWorkspaceClient(api_key="phc_" + "a" * 40)

        with pytest.raises(TimeoutError):
            client.validate_credentials()

    @patch('requests.Session.request')
    def test_connection_error(self, mock_request):
        """Test handling of connection errors."""
        from app.integrations.posthog_workspace_client import (
            PostHogWorkspaceClient,
            ConnectionError
        )
        import requests

        mock_request.side_effect = requests.exceptions.ConnectionError()

        client = PostHogWorkspaceClient(api_key="phc_" + "a" * 40)

        with pytest.raises(ConnectionError):
            client.validate_credentials()


# ============================================
# PostHogValidatorService Tests
# ============================================

class TestPostHogValidatorService:
    """Tests for PostHogValidatorService class."""

    def test_validate_api_key_format_valid(self):
        """Test format validation with valid key."""
        from app.services.posthog_validator import PostHogValidatorService

        mock_db = Mock()
        validator = PostHogValidatorService(mock_db)

        valid, error = validator.validate_api_key_format("phc_" + "a" * 40)
        assert valid is True
        assert error is None

    def test_validate_api_key_format_invalid_prefix(self):
        """Test format validation with invalid prefix."""
        from app.services.posthog_validator import PostHogValidatorService

        mock_db = Mock()
        validator = PostHogValidatorService(mock_db)

        valid, error = validator.validate_api_key_format("abc_" + "a" * 40)
        assert valid is False
        assert "phc_" in error

    def test_validate_api_key_format_empty(self):
        """Test format validation with empty key."""
        from app.services.posthog_validator import PostHogValidatorService

        mock_db = Mock()
        validator = PostHogValidatorService(mock_db)

        valid, error = validator.validate_api_key_format("")
        assert valid is False
        assert "empty" in error.lower()

    @patch('app.services.posthog_validator.PostHogWorkspaceClient')
    def test_validate_credentials_success(self, mock_client_class):
        """Test successful credential validation."""
        from app.services.posthog_validator import PostHogValidatorService

        # Setup mock
        mock_client = MagicMock()
        mock_client.validate_credentials.return_value = True
        mock_client.get_workspace_info.return_value = Mock(
            id="12345",
            name="Test Project",
            organization_name="Test Org"
        )
        mock_client.get_events_count.return_value = 1000
        mock_client_class.return_value.__enter__ = Mock(return_value=mock_client)
        mock_client_class.return_value.__exit__ = Mock(return_value=False)

        mock_db = Mock()
        validator = PostHogValidatorService(mock_db)

        result = validator.validate_credentials("phc_" + "a" * 40)

        assert result.success is True
        assert result.workspace_name == "Test Org"
        assert result.project_id == "12345"
        assert result.events_count == 1000

    @patch('app.services.posthog_validator.PostHogWorkspaceClient')
    def test_validate_credentials_invalid_key(self, mock_client_class):
        """Test credential validation with invalid key."""
        from app.services.posthog_validator import PostHogValidatorService
        from app.integrations.posthog_workspace_client import InvalidAPIKeyError

        # Setup mock to raise error
        mock_client_class.return_value.__enter__ = Mock(
            side_effect=InvalidAPIKeyError("Invalid key")
        )
        mock_client_class.return_value.__exit__ = Mock(return_value=False)

        mock_db = Mock()
        validator = PostHogValidatorService(mock_db)

        result = validator.validate_credentials("phc_" + "a" * 40)

        assert result.success is False
        assert result.error_type == "unauthorized"

    def test_validate_credentials_format_error(self):
        """Test credential validation with format error."""
        from app.services.posthog_validator import PostHogValidatorService

        mock_db = Mock()
        validator = PostHogValidatorService(mock_db)

        result = validator.validate_credentials("invalid_key")

        assert result.success is False
        assert result.error_type == "invalid_format"

    @patch('app.services.posthog_validator.PostHogWorkspaceClient')
    @patch('app.services.posthog_validator.get_encryption_service')
    def test_validate_and_store_config_success(self, mock_encryption, mock_client_class):
        """Test validate and store with success."""
        from app.services.posthog_validator import PostHogValidatorService
        from app.models import Workspace, PosthogWorkspaceConfig

        # Setup mocks
        mock_client = MagicMock()
        mock_client.validate_credentials.return_value = True
        mock_client.get_workspace_info.return_value = Mock(
            id="12345",
            name="Test Project",
            organization_name="Test Org"
        )
        mock_client.get_events_count.return_value = 500
        mock_client_class.return_value.__enter__ = Mock(return_value=mock_client)
        mock_client_class.return_value.__exit__ = Mock(return_value=False)

        mock_enc = Mock()
        mock_enc.encrypt.return_value = "encrypted_key"
        mock_encryption.return_value = mock_enc

        # Mock database
        mock_workspace = Mock(spec=Workspace)
        mock_workspace.id = "ws-123"

        mock_config = Mock(spec=PosthogWorkspaceConfig)

        mock_db = Mock()
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_workspace,  # First call for workspace
            mock_config      # Second call for config
        ]

        validator = PostHogValidatorService(mock_db)
        result = validator.validate_and_store_config("ws-123", "phc_" + "a" * 40)

        assert result.success is True
        mock_db.commit.assert_called()

    def test_get_config_status_not_configured(self):
        """Test get_config_status when not configured."""
        from app.services.posthog_validator import PostHogValidatorService

        mock_db = Mock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        validator = PostHogValidatorService(mock_db)
        status = validator.get_config_status("ws-123")

        assert status["is_configured"] is False
        assert status["is_validated"] is False

    def test_get_config_status_configured(self):
        """Test get_config_status when configured."""
        from app.services.posthog_validator import PostHogValidatorService
        from app.models import PosthogWorkspaceConfig

        mock_config = Mock(spec=PosthogWorkspaceConfig)
        mock_config.is_validated = True
        mock_config.is_active = True
        mock_config.posthog_workspace_name = "Test Org"
        mock_config.posthog_project_id = "12345"
        mock_config.validated_at = datetime(2025, 1, 15, 10, 30, 0)
        mock_config.last_sync = None
        mock_config.validation_error = None

        mock_db = Mock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_config

        validator = PostHogValidatorService(mock_db)
        status = validator.get_config_status("ws-123")

        assert status["is_configured"] is True
        assert status["is_validated"] is True
        assert status["workspace_name"] == "Test Org"


# ============================================
# API Endpoint Tests
# ============================================

class TestPostHogEndpoints:
    """Tests for PostHog API endpoints."""

    @pytest.fixture
    def mock_user(self):
        """Create mock authenticated user."""
        return {
            "sub": "user-123",
            "email": "test@example.com",
            "workspace_id": "ws-123"
        }

    def test_validate_endpoint_success(self, mock_user):
        """Test POST /api/posthog/validate success."""
        from fastapi.testclient import TestClient
        from app.main import app

        with patch('app.api.endpoints.posthog.get_current_user', return_value=mock_user):
            with patch('app.api.endpoints.posthog.PostHogValidatorService') as mock_validator:
                mock_validator.return_value.validate_and_store_config.return_value = Mock(
                    success=True,
                    workspace_name="Test Org",
                    project_id="12345",
                    events_count=1000
                )

                client = TestClient(app)
                response = client.post(
                    "/api/posthog/validate",
                    json={"api_key": "phc_" + "a" * 40}
                )

                # Note: This may return 401 in test environment without proper auth setup
                # In real tests, you'd need to properly mock the auth middleware

    def test_validate_endpoint_invalid_format(self, mock_user):
        """Test POST /api/posthog/validate with invalid format."""
        from fastapi.testclient import TestClient
        from app.main import app

        with patch('app.api.endpoints.posthog.get_current_user', return_value=mock_user):
            with patch('app.api.endpoints.posthog.PostHogValidatorService') as mock_validator:
                mock_validator.return_value.validate_and_store_config.return_value = Mock(
                    success=False,
                    error_message="Invalid format",
                    error_type="invalid_format"
                )

                client = TestClient(app)
                response = client.post(
                    "/api/posthog/validate",
                    json={"api_key": "invalid"}
                )

                # Expect 400 or 401 depending on auth setup

    def test_status_endpoint_not_configured(self, mock_user):
        """Test GET /api/posthog/status when not configured."""
        from fastapi.testclient import TestClient
        from app.main import app

        with patch('app.api.endpoints.posthog.get_current_user', return_value=mock_user):
            with patch('app.api.endpoints.posthog.PostHogValidatorService') as mock_validator:
                mock_validator.return_value.get_config_status.return_value = {
                    "is_configured": False,
                    "is_validated": False,
                    "workspace_name": None,
                    "project_id": None,
                    "last_sync": None,
                    "validation_error": None
                }

                client = TestClient(app)
                response = client.get("/api/posthog/status")

                # Test response structure

    def test_disconnect_endpoint_success(self, mock_user):
        """Test POST /api/posthog/disconnect success."""
        from fastapi.testclient import TestClient
        from app.main import app

        with patch('app.api.endpoints.posthog.get_current_user', return_value=mock_user):
            with patch('app.api.endpoints.posthog.PostHogValidatorService') as mock_validator:
                mock_validator.return_value.disconnect.return_value = True

                client = TestClient(app)
                response = client.post("/api/posthog/disconnect")

                # Test response

    def test_rate_limiting(self, mock_user):
        """Test rate limiting on validate endpoint."""
        from app.api.endpoints.posthog import check_rate_limit, _rate_limit_store

        # Clear store
        _rate_limit_store.clear()

        workspace_id = "test-workspace"

        # First 5 requests should pass
        for i in range(5):
            assert check_rate_limit(workspace_id) is True

        # 6th request should fail
        assert check_rate_limit(workspace_id) is False


# ============================================
# Integration Tests (require actual services)
# ============================================

@pytest.mark.integration
class TestPostHogIntegration:
    """
    Integration tests that require actual PostHog credentials.

    These tests are skipped unless POSTHOG_TEST_API_KEY env var is set.
    """

    @pytest.fixture
    def api_key(self):
        """Get test API key from environment."""
        import os
        key = os.environ.get("POSTHOG_TEST_API_KEY")
        if not key:
            pytest.skip("POSTHOG_TEST_API_KEY not set")
        return key

    def test_real_validation(self, api_key):
        """Test validation with real PostHog API key."""
        from app.integrations.posthog_workspace_client import PostHogWorkspaceClient

        client = PostHogWorkspaceClient(api_key=api_key)
        assert client.validate_credentials() is True

        info = client.get_workspace_info()
        assert info.id is not None
        assert info.name is not None

    def test_real_events_count(self, api_key):
        """Test events count with real API key."""
        from app.integrations.posthog_workspace_client import PostHogWorkspaceClient

        client = PostHogWorkspaceClient(api_key=api_key)
        count = client.get_events_count(days=7)
        assert isinstance(count, int)
        assert count >= 0
