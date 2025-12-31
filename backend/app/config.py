from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.

    Environment variables can be set directly or in a .env file.
    Database config can also come from Supabase.
    """

    # Database - loaded from DATABASE_URL env var by pydantic-settings
    database_url: str = "postgresql://postgres:password@localhost:5432/beton"

    # Environment
    env: str = "DEV"

    # Supabase (used for database hosting)
    supabase_url: str = ""
    supabase_key: str = ""

    # ============================================
    # Encryption
    # ============================================
    # IMPORTANT: Set this in production! Generate with:
    # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    beton_encryption_key: str = ""

    # ============================================
    # Integration API Keys (Optional overrides)
    # These can be set via env vars OR stored encrypted in database.
    # Env vars take precedence over database config.
    # ============================================

    # PostHog
    posthog_api_key: str = ""
    posthog_project_id: str = ""
    posthog_host: str = "https://app.posthog.com"  # Can be self-hosted URL

    # Attio CRM
    attio_api_key: str = ""
    attio_workspace_id: str = ""

    # Stripe
    stripe_api_key: str = ""

    # Apollo
    apollo_api_key: str = ""

    # ============================================
    # Sync Configuration
    # ============================================
    sync_enabled: bool = False

    # ============================================
    # Rate Limiting & Performance
    # ============================================
    # PostHog rate limit (queries per hour)
    posthog_query_budget: int = 2000  # Conservative default below 2400 limit

    # Query cache TTL in seconds
    cache_ttl_seconds: int = 3600

    # Attio batch size for bulk operations
    attio_batch_size: int = 100

    # Max concurrent API requests
    max_concurrent_requests: int = 5

    # ============================================
    # Feature Flags
    # ============================================
    enable_attio_integration: bool = True
    enable_dashboard_provisioning: bool = True

    class Config:
        env_file = ".env"
        case_sensitive = False  # Allow case-insensitive env vars

    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.env.upper() == "PROD"

    @property
    def is_development(self) -> bool:
        """Check if running in development environment."""
        return self.env.upper() == "DEV"

    @property
    def has_encryption_key(self) -> bool:
        """Check if a real encryption key is configured."""
        return bool(self.beton_encryption_key)


settings = Settings()
