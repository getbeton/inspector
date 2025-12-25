"""
Tests for PostHog Query Client Dashboard API Methods.

Tests the dashboard-related API methods:
- list_dashboards
- create_dashboard
- create_insight
- delete_dashboard
- get_dashboard
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

from app.integrations.posthog_query_client import PostHogQueryClient, get_posthog_query_client


class TestPostHogQueryClientDashboardList:
    """Tests for list_dashboards method."""

    def test_list_dashboards_not_configured(self, db_session):
        """Test list_dashboards returns empty when not configured."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = False

            result = client.list_dashboards()

            assert result == []

    def test_list_dashboards_success(self, db_session):
        """Test successful dashboard listing."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = True
            client.host = "https://app.posthog.com"
            client.project_id = "12345"
            client.api_key = "phx_test_key"

            with patch('app.integrations.posthog_query_client.requests.get') as mock_get:
                mock_response = Mock()
                mock_response.status_code = 200
                mock_response.json.return_value = {
                    "results": [
                        {"id": "1", "name": "Dashboard 1"},
                        {"id": "2", "name": "Dashboard 2"}
                    ]
                }
                mock_get.return_value = mock_response

                result = client.list_dashboards()

                assert len(result) == 2
                assert result[0]["name"] == "Dashboard 1"

    def test_list_dashboards_with_limit(self, db_session):
        """Test dashboard listing respects limit parameter."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = True
            client.host = "https://app.posthog.com"
            client.project_id = "12345"
            client.api_key = "phx_test_key"

            with patch('app.integrations.posthog_query_client.requests.get') as mock_get:
                mock_response = Mock()
                mock_response.status_code = 200
                mock_response.json.return_value = {"results": []}
                mock_get.return_value = mock_response

                client.list_dashboards(limit=50)

                # Verify limit was passed in params
                call_args = mock_get.call_args
                assert call_args[1]["params"]["limit"] == 50

    def test_list_dashboards_api_error(self, db_session):
        """Test list_dashboards handles API errors gracefully."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = True
            client.host = "https://app.posthog.com"
            client.project_id = "12345"
            client.api_key = "phx_test_key"

            with patch('app.integrations.posthog_query_client.requests.get') as mock_get:
                mock_response = Mock()
                mock_response.status_code = 500
                mock_get.return_value = mock_response

                result = client.list_dashboards()

                assert result == []


class TestPostHogQueryClientCreateDashboard:
    """Tests for create_dashboard method."""

    def test_create_dashboard_not_configured(self, db_session):
        """Test create_dashboard raises when not configured."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = False

            with pytest.raises(Exception, match="not configured"):
                client.create_dashboard({"name": "Test"})

    def test_create_dashboard_success(self, db_session):
        """Test successful dashboard creation."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = True
            client.host = "https://app.posthog.com"
            client.project_id = "12345"
            client.api_key = "phx_test_key"

            with patch('app.integrations.posthog_query_client.requests.post') as mock_post:
                mock_response = Mock()
                mock_response.status_code = 201
                mock_response.json.return_value = {
                    "id": "new_dashboard_123",
                    "name": "Beton Dashboard",
                    "uuid": "uuid-123"
                }
                mock_post.return_value = mock_response

                payload = {
                    "name": "Beton Dashboard",
                    "description": "Test dashboard",
                    "tags": ["beton-managed"]
                }

                result = client.create_dashboard(payload)

                assert result["id"] == "new_dashboard_123"
                mock_post.assert_called_once()

    def test_create_dashboard_api_error(self, db_session):
        """Test create_dashboard raises on API error."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = True
            client.host = "https://app.posthog.com"
            client.project_id = "12345"
            client.api_key = "phx_test_key"

            with patch('app.integrations.posthog_query_client.requests.post') as mock_post:
                mock_response = Mock()
                mock_response.status_code = 400
                mock_response.text = "Bad request"
                mock_post.return_value = mock_response

                with pytest.raises(Exception, match="Failed to create dashboard"):
                    client.create_dashboard({"name": "Test"})


class TestPostHogQueryClientCreateInsight:
    """Tests for create_insight method."""

    def test_create_insight_not_configured(self, db_session):
        """Test create_insight raises when not configured."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = False

            with pytest.raises(Exception, match="not configured"):
                client.create_insight({"name": "Test Insight"})

    def test_create_insight_success(self, db_session):
        """Test successful insight creation."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = True
            client.host = "https://app.posthog.com"
            client.project_id = "12345"
            client.api_key = "phx_test_key"

            with patch('app.integrations.posthog_query_client.requests.post') as mock_post:
                mock_response = Mock()
                mock_response.status_code = 201
                mock_response.json.return_value = {
                    "id": "insight_123",
                    "name": "Signal Count",
                    "uuid": "uuid-456"
                }
                mock_post.return_value = mock_response

                payload = {
                    "name": "Signal Count",
                    "description": "Count of signals",
                    "query": {
                        "kind": "HogQLQuery",
                        "query": "SELECT count() FROM events"
                    },
                    "dashboards": [123]
                }

                result = client.create_insight(payload)

                assert result["id"] == "insight_123"
                mock_post.assert_called_once()

    def test_create_insight_with_hogql_query(self, db_session):
        """Test insight creation with HogQL query payload."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = True
            client.host = "https://app.posthog.com"
            client.project_id = "12345"
            client.api_key = "phx_test_key"

            with patch('app.integrations.posthog_query_client.requests.post') as mock_post:
                mock_response = Mock()
                mock_response.status_code = 200
                mock_response.json.return_value = {"id": "insight_1"}
                mock_post.return_value = mock_response

                payload = {
                    "name": "HogQL Insight",
                    "query": {
                        "kind": "HogQLQuery",
                        "query": """
                            SELECT
                                toDate(timestamp) as date,
                                COUNT(*) as count
                            FROM events
                            WHERE event = 'signal_detected'
                            GROUP BY date
                            ORDER BY date
                        """
                    },
                    "dashboards": [456]
                }

                client.create_insight(payload)

                # Verify payload was sent
                call_args = mock_post.call_args
                assert call_args[1]["json"]["query"]["kind"] == "HogQLQuery"


class TestPostHogQueryClientDeleteDashboard:
    """Tests for delete_dashboard method."""

    def test_delete_dashboard_not_configured(self, db_session):
        """Test delete_dashboard returns False when not configured."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = False

            result = client.delete_dashboard("123")

            assert result is False

    def test_delete_dashboard_success(self, db_session):
        """Test successful dashboard deletion."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = True
            client.host = "https://app.posthog.com"
            client.project_id = "12345"
            client.api_key = "phx_test_key"

            with patch('app.integrations.posthog_query_client.requests.delete') as mock_delete:
                mock_response = Mock()
                mock_response.status_code = 204
                mock_delete.return_value = mock_response

                result = client.delete_dashboard("dashboard_123")

                assert result is True
                mock_delete.assert_called_once()
                assert "dashboard_123" in mock_delete.call_args[0][0]

    def test_delete_dashboard_not_found(self, db_session):
        """Test delete_dashboard returns False when not found."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = True
            client.host = "https://app.posthog.com"
            client.project_id = "12345"
            client.api_key = "phx_test_key"

            with patch('app.integrations.posthog_query_client.requests.delete') as mock_delete:
                mock_response = Mock()
                mock_response.status_code = 404
                mock_delete.return_value = mock_response

                result = client.delete_dashboard("nonexistent")

                assert result is False


class TestPostHogQueryClientGetDashboard:
    """Tests for get_dashboard method."""

    def test_get_dashboard_not_configured(self, db_session):
        """Test get_dashboard returns None when not configured."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = False

            result = client.get_dashboard("123")

            assert result is None

    def test_get_dashboard_success(self, db_session):
        """Test successful dashboard retrieval."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = True
            client.host = "https://app.posthog.com"
            client.project_id = "12345"
            client.api_key = "phx_test_key"

            with patch('app.integrations.posthog_query_client.requests.get') as mock_get:
                mock_response = Mock()
                mock_response.status_code = 200
                mock_response.json.return_value = {
                    "id": "dashboard_123",
                    "name": "Test Dashboard",
                    "tiles": [],
                    "tags": ["beton-managed"]
                }
                mock_get.return_value = mock_response

                result = client.get_dashboard("dashboard_123")

                assert result is not None
                assert result["id"] == "dashboard_123"
                assert result["name"] == "Test Dashboard"

    def test_get_dashboard_not_found(self, db_session):
        """Test get_dashboard returns None when not found."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = True
            client.host = "https://app.posthog.com"
            client.project_id = "12345"
            client.api_key = "phx_test_key"

            with patch('app.integrations.posthog_query_client.requests.get') as mock_get:
                mock_response = Mock()
                mock_response.status_code = 404
                mock_get.return_value = mock_response

                result = client.get_dashboard("nonexistent")

                assert result is None


class TestPostHogQueryClientFactory:
    """Tests for get_posthog_query_client factory function."""

    def test_factory_creates_client(self, db_session):
        """Test factory function creates client instance."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = get_posthog_query_client(db_session)

            assert isinstance(client, PostHogQueryClient)
            assert client.db == db_session


class TestPostHogQueryClientHeaders:
    """Tests for authentication headers."""

    def test_get_headers_includes_auth(self, db_session):
        """Test _get_headers includes Bearer token."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.api_key = "phx_test_api_key"

            headers = client._get_headers()

            assert "Authorization" in headers
            assert headers["Authorization"] == "Bearer phx_test_api_key"
            assert headers["Content-Type"] == "application/json"


class TestPostHogQueryClientURLConstruction:
    """Tests for URL construction."""

    def test_dashboard_url_construction(self, db_session):
        """Test dashboard API URL is constructed correctly."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = True
            client.host = "https://eu.posthog.com"
            client.project_id = "99999"
            client.api_key = "phx_key"

            with patch('app.integrations.posthog_query_client.requests.get') as mock_get:
                mock_response = Mock()
                mock_response.status_code = 200
                mock_response.json.return_value = {"results": []}
                mock_get.return_value = mock_response

                client.list_dashboards()

                call_url = mock_get.call_args[0][0]
                assert "eu.posthog.com" in call_url
                assert "99999" in call_url
                assert "/dashboards/" in call_url

    def test_insight_url_construction(self, db_session):
        """Test insight API URL is constructed correctly."""
        with patch.object(PostHogQueryClient, '_load_config'):
            client = PostHogQueryClient(db=db_session)
            client.is_configured = True
            client.host = "https://app.posthog.com"
            client.project_id = "12345"
            client.api_key = "phx_key"

            with patch('app.integrations.posthog_query_client.requests.post') as mock_post:
                mock_response = Mock()
                mock_response.status_code = 201
                mock_response.json.return_value = {"id": "1"}
                mock_post.return_value = mock_response

                client.create_insight({"name": "Test"})

                call_url = mock_post.call_args[0][0]
                assert "/insights/" in call_url
