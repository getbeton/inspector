"""
Configuration manager for managing integration credentials and system settings.
Uses database storage with encryption for API keys.
"""
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models import IntegrationConfig, IntegrationStatus, SystemSetting, SyncState
from app.core.encryption import EncryptionService, EncryptionError

logger = logging.getLogger(__name__)


class ConfigurationError(Exception):
    """Raised when configuration operations fail."""
    pass


class ConfigManager:
    """
    Manages integration configurations and system settings with database storage.

    Features:
    - Encrypted API key storage
    - Environment variable overrides
    - Connection health tracking
    - System settings management

    Usage:
        from app.core.config_manager import ConfigManager
        from app.database import get_db

        db = next(get_db())
        config_manager = ConfigManager(db)

        # Save integration
        config_manager.save_integration(
            name="posthog",
            api_key="phx_...",
            config={"project_id": "123", "host": "https://app.posthog.com"}
        )

        # Get integration
        config = config_manager.get_integration("posthog")
        # Returns: {"api_key": "phx_...", "project_id": "123", "host": "..."}

        # Test connection (you provide the test function)
        config_manager.update_validation_status("posthog", is_valid=True)
    """

    # Default system settings
    DEFAULT_SETTINGS = {
        "query_budget_limit": 2000,
        "cache_ttl_seconds": 3600,
        "attio_batch_size": 100,
        "max_concurrent_requests": 5,
    }

    # Supported integrations
    SUPPORTED_INTEGRATIONS = ["posthog", "attio", "stripe", "apollo"]

    def __init__(self, db: Session, encryption_service: Optional[EncryptionService] = None):
        """
        Initialize config manager.

        Args:
            db: SQLAlchemy database session.
            encryption_service: Optional encryption service. Creates one if not provided.
        """
        self.db = db
        self.encryption = encryption_service or EncryptionService()

        if self.encryption.is_temporary_key:
            logger.warning(
                "ConfigManager using temporary encryption key. "
                "API keys will NOT be recoverable after restart. "
                "Set BETON_ENCRYPTION_KEY in production."
            )

    # ============================================
    # Integration Configuration Methods
    # ============================================

    def save_integration(
        self,
        name: str,
        api_key: str,
        config: Optional[Dict[str, Any]] = None,
        is_active: bool = True
    ) -> IntegrationConfig:
        """
        Save or update an integration configuration.

        Args:
            name: Integration name (e.g., "posthog", "attio").
            api_key: API key to encrypt and store.
            config: Additional configuration (project_id, host, etc.).
            is_active: Whether the integration is enabled.

        Returns:
            The saved IntegrationConfig model.

        Raises:
            ConfigurationError: If save fails.
        """
        if name not in self.SUPPORTED_INTEGRATIONS:
            raise ConfigurationError(
                f"Unsupported integration: {name}. "
                f"Supported: {self.SUPPORTED_INTEGRATIONS}"
            )

        try:
            encrypted_key = self.encryption.encrypt(api_key)
        except EncryptionError as e:
            raise ConfigurationError(f"Failed to encrypt API key: {e}")

        config_json = config or {}

        try:
            # Check if exists
            existing = self.db.query(IntegrationConfig).filter(
                IntegrationConfig.integration_name == name
            ).first()

            if existing:
                # Update - only reset status if API key changed
                old_key = self.encryption.decrypt(existing.api_key_encrypted)
                if old_key != api_key:
                    # API key changed, reset validation status
                    existing.status = IntegrationStatus.DISCONNECTED
                    existing.last_validated_at = None
                existing.api_key_encrypted = encrypted_key
                existing.config_json = config_json
                existing.is_active = is_active
                existing.updated_at = datetime.utcnow()
                self.db.commit()
                self.db.refresh(existing)
                logger.info(f"Updated integration config: {name}")
                return existing
            else:
                # Create
                new_config = IntegrationConfig(
                    integration_name=name,
                    api_key_encrypted=encrypted_key,
                    config_json=config_json,
                    is_active=is_active,
                    status=IntegrationStatus.DISCONNECTED,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )
                self.db.add(new_config)
                self.db.commit()
                self.db.refresh(new_config)
                logger.info(f"Created integration config: {name}")
                return new_config

        except IntegrityError as e:
            self.db.rollback()
            raise ConfigurationError(f"Database error saving integration: {e}")

    def get_integration(self, name: str, include_api_key: bool = True) -> Optional[Dict[str, Any]]:
        """
        Get integration configuration.

        Args:
            name: Integration name.
            include_api_key: Whether to decrypt and include the API key.

        Returns:
            Dictionary with integration config, or None if not found.
            {
                "api_key": "...",  # Only if include_api_key=True
                "api_key_masked": "****abcd",
                "project_id": "123",
                "host": "...",
                "status": "connected",
                "last_validated_at": "2025-01-15T10:00:00Z",
                "is_active": True
            }
        """
        config = self.db.query(IntegrationConfig).filter(
            IntegrationConfig.integration_name == name
        ).first()

        if not config:
            return None

        result = {
            **config.config_json,
            "status": config.status,
            "last_validated_at": config.last_validated_at.isoformat() if config.last_validated_at else None,
            "is_active": config.is_active,
        }

        if include_api_key:
            try:
                result["api_key"] = self.encryption.decrypt(config.api_key_encrypted)
                result["api_key_masked"] = self.encryption.mask_key(result["api_key"])
            except EncryptionError:
                logger.error(f"Failed to decrypt API key for {name}")
                result["api_key"] = None
                result["api_key_masked"] = "[decryption failed]"
                result["decryption_error"] = True
        else:
            # Still provide masked version for display
            try:
                decrypted = self.encryption.decrypt(config.api_key_encrypted)
                result["api_key_masked"] = self.encryption.mask_key(decrypted)
            except EncryptionError:
                result["api_key_masked"] = "[decryption failed]"

        return result

    def get_integration_raw(self, name: str) -> Optional[IntegrationConfig]:
        """
        Get the raw IntegrationConfig model.

        Args:
            name: Integration name.

        Returns:
            IntegrationConfig model or None.
        """
        return self.db.query(IntegrationConfig).filter(
            IntegrationConfig.integration_name == name
        ).first()

    def delete_integration(self, name: str) -> bool:
        """
        Delete an integration configuration.

        Args:
            name: Integration name.

        Returns:
            True if deleted, False if not found.
        """
        config = self.db.query(IntegrationConfig).filter(
            IntegrationConfig.integration_name == name
        ).first()

        if not config:
            return False

        self.db.delete(config)
        self.db.commit()
        logger.info(f"Deleted integration config: {name}")
        return True

    def list_integrations(self) -> List[Dict[str, Any]]:
        """
        List all configured integrations.

        Returns:
            List of integration summaries (without decrypted API keys).
        """
        configs = self.db.query(IntegrationConfig).all()

        result = []
        for config in configs:
            try:
                decrypted = self.encryption.decrypt(config.api_key_encrypted)
                masked = self.encryption.mask_key(decrypted)
            except EncryptionError:
                masked = "[decryption failed]"

            result.append({
                "name": config.integration_name,
                "api_key_masked": masked,
                "status": config.status,
                "is_active": config.is_active,
                "last_validated_at": config.last_validated_at.isoformat() if config.last_validated_at else None,
                "config": config.config_json,
            })

        return result

    def update_validation_status(
        self,
        name: str,
        is_valid: bool,
        error_message: Optional[str] = None
    ) -> bool:
        """
        Update the validation status of an integration.

        Args:
            name: Integration name.
            is_valid: Whether the connection test succeeded.
            error_message: Error message if validation failed.

        Returns:
            True if updated, False if not found.
        """
        config = self.db.query(IntegrationConfig).filter(
            IntegrationConfig.integration_name == name
        ).first()

        if not config:
            return False

        if is_valid:
            config.status = IntegrationStatus.CONNECTED
            config.last_validated_at = datetime.utcnow()
        else:
            config.status = IntegrationStatus.ERROR

        config.updated_at = datetime.utcnow()
        self.db.commit()

        logger.info(f"Updated validation status for {name}: valid={is_valid}")
        return True

    def is_integration_configured(self, name: str) -> bool:
        """Check if an integration is configured and active."""
        config = self.get_integration_raw(name)
        return config is not None and config.is_active

    # ============================================
    # System Settings Methods
    # ============================================

    def get_setting(self, key: str, default: Any = None) -> Any:
        """
        Get a system setting.

        Args:
            key: Setting key.
            default: Default value if not found.

        Returns:
            The setting value (JSON-decoded).
        """
        setting = self.db.query(SystemSetting).filter(
            SystemSetting.key == key
        ).first()

        if not setting:
            # Check defaults
            return self.DEFAULT_SETTINGS.get(key, default)

        try:
            return json.loads(setting.value)
        except json.JSONDecodeError:
            # Return as string if not valid JSON
            return setting.value

    def set_setting(self, key: str, value: Any, description: Optional[str] = None) -> SystemSetting:
        """
        Set a system setting.

        Args:
            key: Setting key.
            value: Setting value (will be JSON-encoded).
            description: Optional description.

        Returns:
            The saved SystemSetting model.
        """
        value_str = json.dumps(value) if not isinstance(value, str) else value

        existing = self.db.query(SystemSetting).filter(
            SystemSetting.key == key
        ).first()

        if existing:
            existing.value = value_str
            if description:
                existing.description = description
            existing.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(existing)
            return existing
        else:
            new_setting = SystemSetting(
                key=key,
                value=value_str,
                description=description,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            self.db.add(new_setting)
            self.db.commit()
            self.db.refresh(new_setting)
            return new_setting

    def get_all_settings(self) -> Dict[str, Any]:
        """
        Get all system settings.

        Returns:
            Dictionary of all settings.
        """
        settings = self.db.query(SystemSetting).all()
        result = {**self.DEFAULT_SETTINGS}  # Start with defaults

        for setting in settings:
            try:
                result[setting.key] = json.loads(setting.value)
            except json.JSONDecodeError:
                result[setting.key] = setting.value

        return result

    # ============================================
    # Sync State Methods
    # ============================================

    def get_sync_state(self, integration_name: str) -> Optional[SyncState]:
        """
        Get sync state for an integration.

        Args:
            integration_name: Integration name.

        Returns:
            SyncState model or None.
        """
        return self.db.query(SyncState).filter(
            SyncState.integration_name == integration_name
        ).first()

    def update_sync_state(
        self,
        integration_name: str,
        status: str,
        records_processed: int = 0,
        records_succeeded: int = 0,
        records_failed: int = 0,
        cursor_data: Optional[Dict] = None,
        error_summary: Optional[str] = None
    ) -> SyncState:
        """
        Update or create sync state for an integration.

        Args:
            integration_name: Integration name.
            status: Sync status ("idle", "in_progress", "success", "failed").
            records_processed: Number of records processed.
            records_succeeded: Number of successful records.
            records_failed: Number of failed records.
            cursor_data: Cursor data for resumable sync.
            error_summary: Error message if failed.

        Returns:
            The updated SyncState model.
        """
        existing = self.db.query(SyncState).filter(
            SyncState.integration_name == integration_name
        ).first()

        now = datetime.utcnow()

        if existing:
            if status == "in_progress" and existing.status != "in_progress":
                existing.last_sync_started_at = now

            if status in ("success", "failed"):
                existing.last_sync_completed_at = now

            existing.status = status
            existing.records_processed = records_processed
            existing.records_succeeded = records_succeeded
            existing.records_failed = records_failed

            if cursor_data is not None:
                existing.cursor_data = cursor_data

            existing.error_summary = error_summary
            existing.updated_at = now

            self.db.commit()
            self.db.refresh(existing)
            return existing
        else:
            new_state = SyncState(
                integration_name=integration_name,
                last_sync_started_at=now if status == "in_progress" else None,
                last_sync_completed_at=now if status in ("success", "failed") else None,
                status=status,
                records_processed=records_processed,
                records_succeeded=records_succeeded,
                records_failed=records_failed,
                cursor_data=cursor_data or {},
                error_summary=error_summary,
                created_at=now,
                updated_at=now,
            )
            self.db.add(new_state)
            self.db.commit()
            self.db.refresh(new_state)
            return new_state


# Dependency injection helper for FastAPI
def get_config_manager(db: Session) -> ConfigManager:
    """
    Create a ConfigManager instance.
    Use as a FastAPI dependency.

    Example:
        @app.get("/settings")
        def get_settings(config: ConfigManager = Depends(get_config_manager)):
            return config.get_all_settings()
    """
    return ConfigManager(db)
