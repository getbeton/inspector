"""
Tests for Dashboard Provisioner Service.

Tests the provisioning of PostHog dashboards:
- Dashboard creation with tags
- Insight creation with HogQL queries
- Idempotent provisioning (tag-based detection)
- Dashboard registry tracking
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

from app.services.dashboard_provisioner import (
    DashboardProvisioner,
    DashboardSpec,
    InsightSpec,
    ProvisioningResult,
    get_available_dashboard_types,
    get_dashboard_spec,
    DASHBOARD_SPECS,
    SIGNALS_OVERVIEW_DASHBOARD,
    ACCOUNT_HEALTH_DASHBOARD
)
from app.models import DashboardRegistry, InsightRegistry


class TestInsightSpec:
    """Tests for InsightSpec dataclass."""

    def test_insight_spec_defaults(self):
        """Test InsightSpec has correct default values."""
        spec = InsightSpec(
            name="Test Insight",
            description="Test description",
            query="SELECT count() FROM events"
        )

        assert spec.name == "Test Insight"
        assert spec.visualization == "BoldNumber"
        assert spec.display_type == "single_stat"

    def test_insight_spec_custom_visualization(self):
        """Test InsightSpec with custom visualization."""
        spec = InsightSpec(
            name="Test Chart",
            description="Test",
            query="SELECT * FROM events",
            visualization="ActionsLineGraph",
            display_type="line"
        )

        assert spec.visualization == "ActionsLineGraph"
        assert spec.display_type == "line"


class TestDashboardSpec:
    """Tests for DashboardSpec dataclass."""

    def test_dashboard_spec_defaults(self):
        """Test DashboardSpec has correct default values."""
        spec = DashboardSpec(
            beton_type="test_dashboard",
            name="Test Dashboard",
            description="Test description"
        )

        assert spec.folder == "Beton"
        assert spec.tags == ["beton-managed"]
        assert spec.insights == []
        assert spec.schema_version == "1.0.0"

    def test_dashboard_spec_with_insights(self):
        """Test DashboardSpec with insights."""
        insights = [
            InsightSpec(name="Insight 1", description="Desc", query="SELECT 1"),
            InsightSpec(name="Insight 2", description="Desc", query="SELECT 2")
        ]

        spec = DashboardSpec(
            beton_type="test",
            name="Test",
            description="Test",
            insights=insights
        )

        assert len(spec.insights) == 2


class TestProvisioningResult:
    """Tests for ProvisioningResult dataclass."""

    def test_provisioning_result_success(self):
        """Test successful provisioning result."""
        result = ProvisioningResult(
            success=True,
            dashboard_id="123",
            dashboard_url="https://app.posthog.com/dashboard/123",
            insights_created=4,
            message="Dashboard created"
        )

        assert result.success is True
        assert result.dashboard_id == "123"
        assert result.error is None

    def test_provisioning_result_failure(self):
        """Test failed provisioning result."""
        result = ProvisioningResult(
            success=False,
            error="API error"
        )

        assert result.success is False
        assert result.error == "API error"
        assert result.dashboard_id is None


class TestPredefinedDashboards:
    """Tests for predefined dashboard specifications."""

    def test_signals_overview_dashboard(self):
        """Test Signals Overview dashboard spec."""
        assert SIGNALS_OVERVIEW_DASHBOARD.beton_type == "signals_overview"
        assert "signals" in SIGNALS_OVERVIEW_DASHBOARD.tags
        assert len(SIGNALS_OVERVIEW_DASHBOARD.insights) == 4

    def test_account_health_dashboard(self):
        """Test Account Health dashboard spec."""
        assert ACCOUNT_HEALTH_DASHBOARD.beton_type == "account_health"
        assert "health" in ACCOUNT_HEALTH_DASHBOARD.tags
        assert len(ACCOUNT_HEALTH_DASHBOARD.insights) == 2

    def test_dashboard_specs_registered(self):
        """Test all dashboards are registered."""
        assert "signals_overview" in DASHBOARD_SPECS
        assert "account_health" in DASHBOARD_SPECS

    def test_get_available_dashboard_types(self):
        """Test getting available dashboard types."""
        types = get_available_dashboard_types()

        assert isinstance(types, list)
        assert "signals_overview" in types
        assert "account_health" in types

    def test_get_dashboard_spec(self):
        """Test getting specific dashboard spec."""
        spec = get_dashboard_spec("signals_overview")

        assert spec is not None
        assert spec.beton_type == "signals_overview"

    def test_get_dashboard_spec_unknown(self):
        """Test getting unknown dashboard spec returns None."""
        spec = get_dashboard_spec("unknown_dashboard")

        assert spec is None


class TestDashboardProvisionerInit:
    """Tests for DashboardProvisioner initialization."""

    def test_provisioner_initialization(self, db_session):
        """Test provisioner can be initialized."""
        mock_posthog = Mock()

        provisioner = DashboardProvisioner(db=db_session, posthog_client=mock_posthog)

        assert provisioner.db == db_session
        assert provisioner.posthog == mock_posthog

    def test_provisioner_beton_tag(self, db_session):
        """Test provisioner has correct Beton tag."""
        mock_posthog = Mock()

        provisioner = DashboardProvisioner(db=db_session, posthog_client=mock_posthog)

        assert provisioner.BETON_TAG == "beton-managed"


class TestDashboardProvisionerFindExisting:
    """Tests for finding existing dashboards."""

    def test_find_existing_dashboard_by_tags(self, db_session):
        """Test finding existing dashboard by tags."""
        mock_posthog = Mock()
        mock_posthog.list_dashboards.return_value = [
            {
                "id": "123",
                "name": "Beton: Signals Overview",
                "tags": ["beton-managed", "signals", "signals_overview"]
            }
        ]

        provisioner = DashboardProvisioner(db=db_session, posthog_client=mock_posthog)

        spec = get_dashboard_spec("signals_overview")
        existing = provisioner._find_existing_dashboard(spec)

        assert existing is not None
        assert existing["id"] == "123"

    def test_find_existing_dashboard_not_found(self, db_session):
        """Test finding dashboard when not exists."""
        mock_posthog = Mock()
        mock_posthog.list_dashboards.return_value = [
            {
                "id": "456",
                "name": "Other Dashboard",
                "tags": ["other"]
            }
        ]

        provisioner = DashboardProvisioner(db=db_session, posthog_client=mock_posthog)

        spec = get_dashboard_spec("signals_overview")
        existing = provisioner._find_existing_dashboard(spec)

        assert existing is None


class TestDashboardProvisionerCreate:
    """Tests for creating dashboards."""

    def test_create_dashboard(self, db_session):
        """Test creating a new dashboard."""
        mock_posthog = Mock()
        mock_posthog.project_id = "12345"
        mock_posthog.host = "https://app.posthog.com"
        mock_posthog.create_dashboard.return_value = {
            "id": "new_dash_123",
            "uuid": "uuid-123"
        }

        provisioner = DashboardProvisioner(db=db_session, posthog_client=mock_posthog)

        spec = DashboardSpec(
            beton_type="test",
            name="Test Dashboard",
            description="Test",
            tags=["beton-managed", "test"]
        )

        result = provisioner.create_dashboard(spec)

        assert result["id"] == "new_dash_123"
        mock_posthog.create_dashboard.assert_called_once()

    def test_create_insight(self, db_session):
        """Test creating an insight."""
        mock_posthog = Mock()
        mock_posthog.create_insight.return_value = {
            "id": "insight_123",
            "uuid": "uuid-456"
        }

        provisioner = DashboardProvisioner(db=db_session, posthog_client=mock_posthog)

        insight_spec = InsightSpec(
            name="Test Insight",
            description="Test",
            query="SELECT count() FROM events"
        )

        result = provisioner.create_insight("123", insight_spec)

        assert result["id"] == "insight_123"
        mock_posthog.create_insight.assert_called_once()


class TestDashboardProvisionerProvision:
    """Tests for provisioning dashboards."""

    def test_provision_dashboard_new(self, db_session):
        """Test provisioning a new dashboard."""
        mock_posthog = Mock()
        mock_posthog.project_id = "12345"
        mock_posthog.host = "https://app.posthog.com"
        mock_posthog.list_dashboards.return_value = []  # No existing
        mock_posthog.create_dashboard.return_value = {"id": "123", "uuid": "uuid"}
        mock_posthog.create_insight.return_value = {"id": "insight_1"}

        provisioner = DashboardProvisioner(db=db_session, posthog_client=mock_posthog)

        result = provisioner.provision_dashboard("signals_overview")

        assert result.success is True
        assert result.dashboard_id == "123"
        assert result.insights_created > 0

    def test_provision_dashboard_existing(self, db_session):
        """Test provisioning returns existing dashboard."""
        mock_posthog = Mock()
        mock_posthog.project_id = "12345"
        mock_posthog.host = "https://app.posthog.com"
        mock_posthog.list_dashboards.return_value = [
            {
                "id": "existing_123",
                "uuid": "uuid-existing",
                "url": "https://app.posthog.com/dashboard/existing_123",
                "tags": ["beton-managed", "signals_overview", "signals"]
            }
        ]

        provisioner = DashboardProvisioner(db=db_session, posthog_client=mock_posthog)

        result = provisioner.provision_dashboard("signals_overview")

        assert result.success is True
        assert result.dashboard_id == "existing_123"
        assert result.insights_created == 0  # Not recreated
        assert "already exists" in result.message

    def test_provision_dashboard_force_recreate(self, db_session):
        """Test force recreating existing dashboard."""
        mock_posthog = Mock()
        mock_posthog.project_id = "12345"
        mock_posthog.host = "https://app.posthog.com"
        mock_posthog.list_dashboards.return_value = [
            {"id": "old_123", "tags": ["beton-managed", "signals_overview"]}
        ]
        mock_posthog.create_dashboard.return_value = {"id": "new_456", "uuid": "uuid"}
        mock_posthog.create_insight.return_value = {"id": "insight"}

        provisioner = DashboardProvisioner(db=db_session, posthog_client=mock_posthog)

        result = provisioner.provision_dashboard("signals_overview", force_recreate=True)

        assert result.success is True
        assert result.dashboard_id == "new_456"
        mock_posthog.create_dashboard.assert_called_once()

    def test_provision_dashboard_unknown_type(self, db_session):
        """Test provisioning unknown dashboard type fails."""
        mock_posthog = Mock()

        provisioner = DashboardProvisioner(db=db_session, posthog_client=mock_posthog)

        result = provisioner.provision_dashboard("unknown_type")

        assert result.success is False
        assert "Unknown dashboard type" in result.error


class TestDashboardProvisionerProvisionAll:
    """Tests for provisioning all dashboards."""

    def test_provision_all(self, db_session):
        """Test provisioning all dashboards."""
        mock_posthog = Mock()
        mock_posthog.project_id = "12345"
        mock_posthog.host = "https://app.posthog.com"
        mock_posthog.list_dashboards.return_value = []
        mock_posthog.create_dashboard.return_value = {"id": "new", "uuid": "uuid"}
        mock_posthog.create_insight.return_value = {"id": "insight"}

        provisioner = DashboardProvisioner(db=db_session, posthog_client=mock_posthog)

        results = provisioner.provision_all()

        assert "signals_overview" in results
        assert "account_health" in results
        assert all(r.success for r in results.values())


class TestDashboardProvisionerRegistry:
    """Tests for dashboard registry management."""

    def test_create_registry_entry(self, db_session):
        """Test creating registry entry for new dashboard."""
        mock_posthog = Mock()

        provisioner = DashboardProvisioner(db=db_session, posthog_client=mock_posthog)

        spec = get_dashboard_spec("signals_overview")
        entry = provisioner._create_registry_entry(
            spec,
            posthog_id="123",
            posthog_uuid="uuid-123",
            posthog_url="https://app.posthog.com/dashboard/123"
        )

        assert entry is not None
        assert entry.beton_dashboard_type == "signals_overview"
        assert entry.posthog_dashboard_id == "123"

        # Verify in database
        db_entry = db_session.query(DashboardRegistry).filter(
            DashboardRegistry.beton_dashboard_type == "signals_overview"
        ).first()
        assert db_entry is not None

    def test_update_registry_entry(self, db_session):
        """Test updating existing registry entry."""
        # Create existing entry
        existing = DashboardRegistry(
            beton_dashboard_type="signals_overview",
            posthog_dashboard_id="old_123",
            schema_version="1.0.0",
            created_at=datetime.utcnow()
        )
        db_session.add(existing)
        db_session.commit()

        mock_posthog = Mock()

        provisioner = DashboardProvisioner(db=db_session, posthog_client=mock_posthog)

        spec = get_dashboard_spec("signals_overview")
        entry = provisioner._create_registry_entry(
            spec,
            posthog_id="new_456",
            posthog_uuid="uuid-456"
        )

        # Should update, not create new
        assert entry.posthog_dashboard_id == "new_456"

        count = db_session.query(DashboardRegistry).filter(
            DashboardRegistry.beton_dashboard_type == "signals_overview"
        ).count()
        assert count == 1

    def test_get_registry(self, db_session):
        """Test getting all registry entries."""
        # Create entries
        entry1 = DashboardRegistry(
            beton_dashboard_type="signals_overview",
            posthog_dashboard_id="123",
            folder_path="Beton/Signals",
            schema_version="1.0.0",
            insights_count=4,
            created_at=datetime.utcnow(),
            last_synced_at=datetime.utcnow()
        )
        entry2 = DashboardRegistry(
            beton_dashboard_type="account_health",
            posthog_dashboard_id="456",
            folder_path="Beton/Accounts",
            schema_version="1.0.0",
            insights_count=2,
            created_at=datetime.utcnow(),
            last_synced_at=datetime.utcnow()
        )
        db_session.add_all([entry1, entry2])
        db_session.commit()

        mock_posthog = Mock()

        provisioner = DashboardProvisioner(db=db_session, posthog_client=mock_posthog)

        registry = provisioner.get_registry()

        assert len(registry) == 2
        types = [e["beton_type"] for e in registry]
        assert "signals_overview" in types
        assert "account_health" in types


class TestDashboardProvisionerDelete:
    """Tests for deleting dashboards."""

    def test_delete_dashboard(self, db_session):
        """Test deleting a dashboard."""
        # Create registry entry
        entry = DashboardRegistry(
            beton_dashboard_type="signals_overview",
            posthog_dashboard_id="123",
            created_at=datetime.utcnow()
        )
        db_session.add(entry)
        db_session.commit()

        mock_posthog = Mock()
        mock_posthog.delete_dashboard.return_value = True

        provisioner = DashboardProvisioner(db=db_session, posthog_client=mock_posthog)

        success = provisioner.delete_dashboard("signals_overview")

        assert success is True
        mock_posthog.delete_dashboard.assert_called_with("123")

        # Verify removed from registry
        remaining = db_session.query(DashboardRegistry).filter(
            DashboardRegistry.beton_dashboard_type == "signals_overview"
        ).first()
        assert remaining is None

    def test_delete_dashboard_not_found(self, db_session):
        """Test deleting non-existent dashboard."""
        mock_posthog = Mock()

        provisioner = DashboardProvisioner(db=db_session, posthog_client=mock_posthog)

        success = provisioner.delete_dashboard("unknown_type")

        assert success is False
        mock_posthog.delete_dashboard.assert_not_called()
