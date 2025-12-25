from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum, JSON, Text, Boolean, Index
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
import enum

Base = declarative_base()

class AccountStatus(str, enum.Enum):
    ACTIVE = "active"
    CHURNED = "churned"
    TRIAL = "trial"

class OpportunityStage(str, enum.Enum):
    DETECTED = "detected"
    QUALIFIED = "qualified"
    IN_PROGRESS = "in_progress"
    CLOSED_WON = "closed_won"
    CLOSED_LOST = "closed_lost"

class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    domain = Column(String, index=True)
    arr = Column(Float, default=0.0)
    plan = Column(String, default="free")
    status = Column(String, default=AccountStatus.ACTIVE)
    health_score = Column(Float, default=0.0)
    fit_score = Column(Float, default=0.0)  # ICP fit score (0.0-1.0)
    last_activity_at = Column(DateTime)  # Track last user activity
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users = relationship("User", back_populates="account", cascade="all, delete-orphan")
    signals = relationship("Signal", back_populates="account", cascade="all, delete-orphan")
    opportunities = relationship("Opportunity", back_populates="account", cascade="all, delete-orphan")
    metric_snapshots = relationship("MetricSnapshot", back_populates="account", cascade="all, delete-orphan")
    heuristic_scores = relationship("HeuristicScore", back_populates="account", cascade="all, delete-orphan")
    account_clusters = relationship("AccountCluster", back_populates="account", cascade="all, delete-orphan")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    email = Column(String, index=True)
    name = Column(String)
    role = Column(String) # e.g. "admin", "member"
    title = Column(String) # e.g. "CTO", "Developer"
    created_at = Column(DateTime, default=datetime.utcnow)

    account = relationship("Account", back_populates="users")

class Signal(Base):
    __tablename__ = "signals"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    type = Column(String, index=True) # e.g. "usage_spike", "billing_increase"
    value = Column(Float) # Quantitative value if applicable
    details = Column(JSON) # Extra context
    timestamp = Column(DateTime, default=datetime.utcnow)
    source = Column(String) # e.g. "posthog", "stripe"

    account = relationship("Account", back_populates="signals")

class Opportunity(Base):
    __tablename__ = "opportunities"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    stage = Column(String, default=OpportunityStage.DETECTED)
    value = Column(Float, default=0.0)
    ai_summary = Column(String) # Gemini generated explanation
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    account = relationship("Account", back_populates="opportunities")


# ============================================
# Settings & Configuration Models (Phase 1)
# ============================================

class IntegrationStatus(str, enum.Enum):
    """Status of an integration connection."""
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"
    VALIDATING = "validating"


class IntegrationConfig(Base):
    """
    Stores encrypted API keys and configuration for integrations.
    Supports: posthog, attio, stripe, apollo
    """
    __tablename__ = "integration_configs"

    id = Column(Integer, primary_key=True, index=True)
    integration_name = Column(String(50), unique=True, nullable=False, index=True)  # "posthog", "attio", etc.
    api_key_encrypted = Column(Text, nullable=False)  # Fernet encrypted API key
    config_json = Column(JSON, nullable=False, default=dict)  # {"project_id": "123", "host": "...", "workspace_id": "..."}
    status = Column(String(20), default=IntegrationStatus.DISCONNECTED)
    last_validated_at = Column(DateTime)  # Last successful connection test
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SystemSetting(Base):
    """
    Key-value store for system-wide settings.
    Examples: query_budget_limit, cache_ttl_seconds, batch_size
    """
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=False)  # JSON-encoded value
    description = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SyncState(Base):
    """
    Tracks sync progress and state for each integration.
    Used for resumable syncs and status tracking.
    """
    __tablename__ = "sync_states"

    id = Column(Integer, primary_key=True, index=True)
    integration_name = Column(String(50), unique=True, nullable=False, index=True)  # "posthog", "attio", etc.
    last_sync_started_at = Column(DateTime)
    last_sync_completed_at = Column(DateTime)
    status = Column(String(20), default="idle")  # "idle", "in_progress", "success", "failed"
    records_processed = Column(Integer, default=0)
    records_succeeded = Column(Integer, default=0)
    records_failed = Column(Integer, default=0)
    cursor_data = Column(JSON, default=dict)  # {"last_signal_id": 123, "last_timestamp": "..."}
    error_summary = Column(Text)  # Last error message if failed
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ============================================
# Rate Limiting & Caching Models (Phase 2)
# ============================================

class RateLimitTracking(Base):
    """
    Tracks API query counts for rate limiting.
    Uses sliding window algorithm - records queries per hour window.
    """
    __tablename__ = "rate_limit_tracking"

    id = Column(Integer, primary_key=True, index=True)
    integration_name = Column(String(50), nullable=False, index=True)  # "posthog", "attio"
    window_start = Column(DateTime, nullable=False, index=True)  # Start of the hour window
    query_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('ix_rate_limit_integration_window', 'integration_name', 'window_start'),
    )


class QueryCache(Base):
    """
    Caches HogQL query results to reduce API calls.
    Implements TTL-based expiration with LRU eviction.
    """
    __tablename__ = "query_cache"

    id = Column(Integer, primary_key=True, index=True)
    cache_key = Column(String(64), unique=True, nullable=False, index=True)  # SHA256 hash of normalized query
    query_hash = Column(String(64), nullable=False)  # Hash of the original query for debugging
    result_json = Column(Text, nullable=False)  # JSON-encoded query result
    result_size_bytes = Column(Integer, default=0)  # Size for LRU tracking
    hit_count = Column(Integer, default=0)  # Number of cache hits
    ttl_seconds = Column(Integer, default=3600)  # Time-to-live
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_accessed_at = Column(DateTime, default=datetime.utcnow)


# ============================================
# Dashboard Registry Models (Phase 4)
# ============================================

class DashboardRegistry(Base):
    """
    Tracks PostHog dashboards created by Beton.
    Used for idempotent provisioning and management.
    """
    __tablename__ = "dashboard_registry"

    id = Column(Integer, primary_key=True, index=True)
    beton_dashboard_type = Column(String(100), unique=True, nullable=False, index=True)  # "signals_overview", "lead_activity"
    posthog_dashboard_id = Column(String(255), nullable=False)  # PostHog dashboard ID
    posthog_dashboard_uuid = Column(String(255))  # PostHog dashboard UUID
    posthog_dashboard_url = Column(Text)  # Full URL to dashboard
    folder_path = Column(String(255))  # "Beton/Signals"
    schema_version = Column(String(20), default="1.0.0")  # For migration tracking
    insights_count = Column(Integer, default=0)  # Number of insights on dashboard
    created_at = Column(DateTime, default=datetime.utcnow)
    last_synced_at = Column(DateTime, default=datetime.utcnow)


class InsightRegistry(Base):
    """
    Tracks individual insights within dashboards.
    """
    __tablename__ = "insight_registry"

    id = Column(Integer, primary_key=True, index=True)
    dashboard_id = Column(Integer, ForeignKey("dashboard_registry.id"))
    beton_insight_type = Column(String(100), nullable=False)  # "total_signals", "signals_by_type"
    posthog_insight_id = Column(String(255), nullable=False)
    posthog_insight_uuid = Column(String(255))
    query_hash = Column(String(64))  # Hash of HogQL query for change detection
    created_at = Column(DateTime, default=datetime.utcnow)
    last_synced_at = Column(DateTime, default=datetime.utcnow)

    dashboard = relationship("DashboardRegistry", backref="insights")


# ============================================
# Attio Field Mapping Models (Phase 3)
# ============================================

class AttioFieldMapping(Base):
    """
    Stores field mappings between Beton signals and Attio attributes.
    """
    __tablename__ = "attio_field_mappings"

    id = Column(Integer, primary_key=True, index=True)
    attio_object_slug = Column(String(100), nullable=False, index=True)  # "companies", "people"
    beton_field = Column(String(100), nullable=False)  # "beton_score", "beton_signal"
    attio_attribute_id = Column(String(255))  # Attio attribute UUID
    attio_attribute_slug = Column(String(100))  # Attio attribute slug
    attio_attribute_type = Column(String(50))  # "number", "text", "timestamp"
    is_auto_created = Column(Boolean, default=False)  # Whether Beton created this attribute
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('ix_attio_mapping_object_field', 'attio_object_slug', 'beton_field', unique=True),
    )


# ============================================
# Statistical Test Run Models
# ============================================

class StatTestStatus(str, enum.Enum):
    """Status of a statistical test run."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class StatTestRun(Base):
    """
    Stores individual stat test runs for users.
    Tracks backtesting and signal validation runs.
    """
    __tablename__ = "stat_test_runs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Optional: can be system-triggered
    signal_id = Column(Integer, ForeignKey("signals.id"), nullable=True)  # Optional: test specific signal

    # Test configuration
    test_name = Column(String(100), nullable=False, index=True)  # "backtest", "precision_recall", "lift_analysis"
    test_type = Column(String(50), nullable=False)  # "user_signal", "global_signal", "segment"
    parameters_json = Column(JSON, default=dict)  # {"date_range": "30d", "segment": "enterprise", ...}

    # Test execution
    status = Column(String(20), default=StatTestStatus.PENDING)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    duration_seconds = Column(Float)

    # Test results (aggregates)
    results_json = Column(JSON, default=dict)  # Full results object
    precision = Column(Float)  # Precision score (0-1)
    recall = Column(Float)  # Recall score (0-1)
    f1_score = Column(Float)  # F1 score (0-1)
    lift = Column(Float)  # Lift over baseline
    conversion_rate = Column(Float)  # Conversion rate for this signal
    sample_size = Column(Integer)  # Number of records tested

    # Metadata
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref="stat_test_runs")
    signal = relationship("Signal", backref="stat_test_runs")


class SignalAggregate(Base):
    """
    Stores aggregated signal performance metrics.
    Updated periodically with overall signal statistics.
    """
    __tablename__ = "signal_aggregates"

    id = Column(Integer, primary_key=True, index=True)
    signal_type = Column(String(100), unique=True, nullable=False, index=True)  # "usage_spike", "billing_increase"

    # Volume metrics
    total_count = Column(Integer, default=0)  # Total signals of this type
    count_last_7d = Column(Integer, default=0)  # Signals in last 7 days
    count_last_30d = Column(Integer, default=0)  # Signals in last 30 days

    # Performance metrics (from stat tests)
    avg_precision = Column(Float)
    avg_recall = Column(Float)
    avg_f1_score = Column(Float)
    avg_lift = Column(Float)
    avg_conversion_rate = Column(Float)

    # Quality metrics
    confidence_score = Column(Float)  # Overall confidence in this signal (0-1)
    quality_grade = Column(String(5))  # "A+", "A", "B", "C", "D", "F"

    # Revenue impact
    total_arr_influenced = Column(Float, default=0.0)  # Total ARR influenced by this signal
    avg_deal_size = Column(Float)  # Average deal size from this signal
    win_rate = Column(Float)  # Historical win rate for this signal

    # Timing
    avg_days_to_close = Column(Float)  # Average sales cycle length

    # Metadata
    last_calculated_at = Column(DateTime)
    calculation_window_days = Column(Integer, default=90)  # How many days of data used
    sample_size = Column(Integer)  # Number of records in calculation
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserSignalPreference(Base):
    """
    Stores user-specific signal preferences and performance tracking.
    """
    __tablename__ = "user_signal_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    signal_type = Column(String(100), nullable=False, index=True)

    # User preferences
    is_enabled = Column(Boolean, default=True)  # User can disable signals
    priority = Column(Integer, default=0)  # User-defined priority (higher = more important)
    custom_threshold = Column(Float)  # User-specific threshold override
    notification_enabled = Column(Boolean, default=True)

    # User-specific performance (tracked per user)
    user_conversion_rate = Column(Float)  # This user's conversion rate for this signal
    user_win_rate = Column(Float)
    user_avg_response_time_hours = Column(Float)  # Avg time to respond to this signal
    signals_received_count = Column(Integer, default=0)
    signals_acted_on_count = Column(Integer, default=0)

    # Metadata
    last_signal_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref="signal_preferences")

    __table_args__ = (
        Index('ix_user_signal_pref_user_signal', 'user_id', 'signal_type', unique=True),
    )


# ============================================
# Authentication & Multi-Tenancy Models (Epic 1)
# ============================================

class Workspace(Base):
    """
    Represents a customer organization/tenant.
    Each workspace is completely isolated from others via RLS.
    """
    __tablename__ = "workspaces"

    id = Column(String(36), primary_key=True, default=lambda: str(__import__('uuid').uuid4()))  # UUID
    name = Column(String(255), nullable=False)  # e.g., "Acme Corp"
    slug = Column(String(100), nullable=False, unique=True)  # e.g., "acme-corp"

    # Billing (populated by Epic 4)
    stripe_customer_id = Column(String(255), unique=True, nullable=True)
    stripe_subscription_id = Column(String(255), nullable=True)
    subscription_status = Column(String(50), default="active")  # active, past_due, canceled
    billing_cycle_start = Column(DateTime, nullable=True)
    next_billing_date = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    members = relationship("WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan")


class WorkspaceMember(Base):
    """
    Links users to workspaces with role-based access.
    Enables team collaboration and future multi-workspace support.
    """
    __tablename__ = "workspace_members"

    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(String(36), primary_key=True)  # Supabase auth.users.id (not a local foreign key)
    role = Column(String(50), default="member")  # owner, admin, member
    joined_at = Column(DateTime, default=datetime.utcnow)

    workspace = relationship("Workspace", back_populates="members")


class VaultSecret(Base):
    """
    Stores encrypted integration credentials using Supabase Vault.
    Secret column is auto-encrypted by Vault extension.
    """
    __tablename__ = "vault_secrets"

    id = Column(String(36), primary_key=True, default=lambda: str(__import__('uuid').uuid4()))  # UUID
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)  # e.g., "posthog_api_key"
    secret = Column(Text, nullable=False)  # Encrypted by Vault
    secret_metadata = Column(JSON, default=dict)  # {project_id, project_name} - not encrypted
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('ix_vault_secrets_workspace_name', 'workspace_id', 'name', unique=True),
    )


class TrackedIdentity(Base):
    """
    Tracks PostHog persons for billing.
    Updated daily by sync job, never deleted (soft delete via is_active).
    """
    __tablename__ = "tracked_identities"

    id = Column(String(36), primary_key=True, default=lambda: str(__import__('uuid').uuid4()))  # UUID
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    person_id = Column(String(255), nullable=False)  # PostHog person ID
    email = Column(String(255), nullable=True)  # PostHog person email if captured
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    last_seen_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('ix_tracked_identities_workspace_person', 'workspace_id', 'person_id', unique=True),
        Index('ix_tracked_identities_workspace_active', 'workspace_id', 'is_active'),
    )


class APIKey(Base):
    """
    Stores API keys for authentication (replacing JWT).
    Keys are hashed with bcrypt - only hash is stored in database.
    One key per workspace/user.
    Keys expire after 90 days.
    """
    __tablename__ = "api_keys"

    id = Column(String(36), primary_key=True, default=lambda: str(__import__('uuid').uuid4()))  # UUID
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(255), nullable=False)  # Supabase auth user ID
    key_hash = Column(String(255), nullable=False, unique=True)  # bcrypt hash of actual key
    name = Column(String(100), nullable=False, default="Default Key")  # Display name
    last_used_at = Column(DateTime, nullable=True)  # Track usage
    expires_at = Column(DateTime, nullable=False)  # Expires 90 days after creation
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_api_keys_workspace_id', 'workspace_id'),
        Index('ix_api_keys_created_at', 'created_at'),
        # Unique constraint: one key per workspace
        # (removed - allowing key_hash to be the unique identifier)
    )
