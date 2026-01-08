"""
PostHog Workspace Validation Service.

Handles the complete workflow of validating PostHog credentials,
encrypting and storing them, and updating configuration state.

Usage:
    from app.services.posthog_validator import PostHogValidatorService

    validator = PostHogValidatorService(db_session)
    result = validator.validate_and_store_config(
        workspace_id="uuid",
        api_key="phc_..."
    )
"""
import logging
from datetime import datetime
from typing import Optional, Tuple
from dataclasses import dataclass
from sqlalchemy.orm import Session

from app.models import PosthogWorkspaceConfig, Workspace
from app.core.encryption import get_encryption_service, EncryptionError
from app.integrations.posthog_workspace_client import (
    PostHogWorkspaceClient,
    InvalidAPIKeyError,
    WorkspaceNotFoundError,
    RateLimitExceededError,
    ConnectionError,
    TimeoutError,
    PostHogClientError
)

logger = logging.getLogger(__name__)


# ============================================
# Validation Result
# ============================================

@dataclass
class ValidationResult:
    """Result of a PostHog credential validation attempt."""
    success: bool
    workspace_name: Optional[str] = None
    project_id: Optional[str] = None
    events_count: int = 0
    error_message: Optional[str] = None
    error_type: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        result = {
            "success": self.success,
        }
        if self.success:
            result.update({
                "workspace_name": self.workspace_name,
                "project_id": self.project_id,
                "events_count": self.events_count
            })
        else:
            result.update({
                "error": self.error_message,
                "error_type": self.error_type
            })
        return result


# ============================================
# Validator Service
# ============================================

class PostHogValidatorService:
    """
    Service for validating and storing PostHog workspace configurations.

    Handles:
    - API key format validation
    - PostHog API credential verification
    - Encrypted storage of credentials
    - Configuration state management

    Attributes:
        db: SQLAlchemy database session

    Example:
        >>> from sqlalchemy.orm import Session
        >>> db = Session(...)
        >>> validator = PostHogValidatorService(db)
        >>> result = validator.validate_and_store_config(
        ...     workspace_id="ws-123",
        ...     api_key="phc_abc123..."
        ... )
        >>> if result.success:
        ...     print(f"Connected to {result.workspace_name}")
    """

    def __init__(self, db: Session):
        """
        Initialize the validator service.

        Args:
            db: SQLAlchemy database session
        """
        self.db = db
        self._encryption = get_encryption_service()

    def validate_api_key_format(self, api_key: str) -> Tuple[bool, Optional[str]]:
        """
        Validate that the API key has the correct format.

        PostHog personal API keys should:
        - Start with 'phc_'
        - Be at least 24 characters long

        Args:
            api_key: The API key to validate

        Returns:
            Tuple of (is_valid, error_message)

        Example:
            >>> validator = PostHogValidatorService(db)
            >>> valid, error = validator.validate_api_key_format("phc_abc123...")
            >>> if not valid:
            ...     print(f"Invalid: {error}")
        """
        if not api_key:
            return False, "API key cannot be empty"

        if not isinstance(api_key, str):
            return False, "API key must be a string"

        api_key = api_key.strip()

        if not api_key.startswith('phc_'):
            return False, "Invalid API key format. PostHog personal API keys start with 'phc_'"

        if len(api_key) < 24:
            return False, "API key is too short. Please provide a complete PostHog API key"

        return True, None

    def validate_credentials(self, api_key: str) -> ValidationResult:
        """
        Validate PostHog credentials by making a test API call.

        Does not store anything - just validates the credentials work.

        Args:
            api_key: PostHog personal API key

        Returns:
            ValidationResult with success status and workspace info or error

        Example:
            >>> result = validator.validate_credentials("phc_abc123...")
            >>> if result.success:
            ...     print(f"Valid! Project: {result.project_id}")
        """
        # First check format
        valid, error = self.validate_api_key_format(api_key)
        if not valid:
            return ValidationResult(
                success=False,
                error_message=error,
                error_type="invalid_format"
            )

        # Try to connect to PostHog
        try:
            with PostHogWorkspaceClient(api_key=api_key.strip()) as client:
                # Validate credentials
                client.validate_credentials()

                # Get workspace info
                info = client.get_workspace_info()

                # Get events count (non-blocking, best effort)
                try:
                    events_count = client.get_events_count(days=30)
                except Exception:
                    events_count = 0

                logger.info(f"PostHog credentials validated: project={info.id}, name={info.name}")

                return ValidationResult(
                    success=True,
                    workspace_name=info.organization_name or info.name,
                    project_id=info.id,
                    events_count=events_count
                )

        except InvalidAPIKeyError as e:
            logger.warning(f"Invalid PostHog API key: {e}")
            return ValidationResult(
                success=False,
                error_message=str(e),
                error_type="unauthorized"
            )

        except WorkspaceNotFoundError as e:
            logger.warning(f"PostHog workspace not found: {e}")
            return ValidationResult(
                success=False,
                error_message=str(e),
                error_type="not_found"
            )

        except RateLimitExceededError as e:
            logger.warning(f"PostHog rate limit exceeded: {e}")
            return ValidationResult(
                success=False,
                error_message=f"Rate limit exceeded. Please retry after {e.retry_after} seconds.",
                error_type="rate_limited"
            )

        except (ConnectionError, TimeoutError) as e:
            logger.error(f"PostHog connection error: {e}")
            return ValidationResult(
                success=False,
                error_message=str(e),
                error_type="connection_error"
            )

        except PostHogClientError as e:
            logger.error(f"PostHog client error: {e}")
            return ValidationResult(
                success=False,
                error_message=str(e),
                error_type="api_error"
            )

        except Exception as e:
            logger.exception(f"Unexpected error validating PostHog credentials: {e}")
            return ValidationResult(
                success=False,
                error_message="An unexpected error occurred while validating credentials",
                error_type="internal_error"
            )

    def validate_and_store_config(
        self,
        workspace_id: str,
        api_key: str
    ) -> ValidationResult:
        """
        Validate PostHog credentials and store them if valid.

        This is the main method for setting up PostHog integration:
        1. Validates API key format
        2. Tests connection to PostHog
        3. Encrypts and stores the API key
        4. Creates/updates the posthog_workspace_config record

        Args:
            workspace_id: The Beton workspace ID to configure
            api_key: PostHog personal API key

        Returns:
            ValidationResult with success status and workspace info or error

        Raises:
            ValueError: If workspace_id is invalid

        Example:
            >>> result = validator.validate_and_store_config(
            ...     workspace_id="ws-123",
            ...     api_key="phc_abc123..."
            ... )
            >>> if result.success:
            ...     print("PostHog integration configured!")
        """
        # Verify workspace exists
        workspace = self.db.query(Workspace).filter(Workspace.id == workspace_id).first()
        if not workspace:
            raise ValueError(f"Workspace not found: {workspace_id}")

        # Validate credentials first
        result = self.validate_credentials(api_key)

        if not result.success:
            # Update config with validation error (if exists)
            config = self._get_or_create_config(workspace_id)
            config.is_validated = False
            config.validation_error = result.error_message
            config.updated_at = datetime.utcnow()
            self.db.commit()
            return result

        # Credentials valid - encrypt and store
        try:
            encrypted_key = self._encryption.encrypt(api_key.strip())
        except EncryptionError as e:
            logger.error(f"Failed to encrypt API key: {e}")
            return ValidationResult(
                success=False,
                error_message="Failed to securely store credentials",
                error_type="encryption_error"
            )

        # Create or update config
        config = self._get_or_create_config(workspace_id)
        config.posthog_api_key = encrypted_key
        config.posthog_workspace_name = result.workspace_name
        config.posthog_project_id = result.project_id
        config.is_validated = True
        config.validated_at = datetime.utcnow()
        config.validation_error = None
        config.is_active = True
        config.updated_at = datetime.utcnow()

        try:
            self.db.commit()
            logger.info(f"PostHog config stored for workspace {workspace_id}")
        except Exception as e:
            self.db.rollback()
            logger.exception(f"Failed to store PostHog config: {e}")
            return ValidationResult(
                success=False,
                error_message="Failed to save configuration",
                error_type="database_error"
            )

        return result

    def _get_or_create_config(self, workspace_id: str) -> PosthogWorkspaceConfig:
        """
        Get existing config or create a new one.

        Args:
            workspace_id: The workspace ID

        Returns:
            PosthogWorkspaceConfig instance
        """
        config = self.db.query(PosthogWorkspaceConfig).filter(
            PosthogWorkspaceConfig.workspace_id == workspace_id
        ).first()

        if not config:
            config = PosthogWorkspaceConfig(
                workspace_id=workspace_id,
                posthog_api_key="",  # Placeholder, will be set
                posthog_project_id="",  # Placeholder, will be set
                is_validated=False
            )
            self.db.add(config)

        return config

    def get_config_status(self, workspace_id: str) -> dict:
        """
        Get the current PostHog configuration status for a workspace.

        Args:
            workspace_id: The workspace ID

        Returns:
            Dictionary with configuration status

        Example:
            >>> status = validator.get_config_status("ws-123")
            >>> if status["is_configured"]:
            ...     print(f"Connected to {status['workspace_name']}")
        """
        config = self.db.query(PosthogWorkspaceConfig).filter(
            PosthogWorkspaceConfig.workspace_id == workspace_id
        ).first()

        if not config:
            return {
                "is_configured": False,
                "is_validated": False,
                "workspace_name": None,
                "project_id": None,
                "last_sync": None,
                "validation_error": None
            }

        return {
            "is_configured": True,
            "is_validated": config.is_validated,
            "is_active": config.is_active,
            "workspace_name": config.posthog_workspace_name,
            "project_id": config.posthog_project_id,
            "validated_at": config.validated_at.isoformat() if config.validated_at else None,
            "last_sync": config.last_sync.isoformat() if config.last_sync else None,
            "validation_error": config.validation_error
        }

    def disconnect(self, workspace_id: str) -> bool:
        """
        Disconnect/deactivate PostHog integration for a workspace.

        Does not delete the config, just marks it as inactive.

        Args:
            workspace_id: The workspace ID

        Returns:
            True if disconnected, False if no config found
        """
        config = self.db.query(PosthogWorkspaceConfig).filter(
            PosthogWorkspaceConfig.workspace_id == workspace_id
        ).first()

        if not config:
            return False

        config.is_active = False
        config.updated_at = datetime.utcnow()
        self.db.commit()

        logger.info(f"PostHog disconnected for workspace {workspace_id}")
        return True

    def get_decrypted_api_key(self, workspace_id: str) -> Optional[str]:
        """
        Get the decrypted API key for a workspace (for internal use).

        Args:
            workspace_id: The workspace ID

        Returns:
            Decrypted API key or None if not configured

        Raises:
            EncryptionError: If decryption fails
        """
        config = self.db.query(PosthogWorkspaceConfig).filter(
            PosthogWorkspaceConfig.workspace_id == workspace_id,
            PosthogWorkspaceConfig.is_active == True
        ).first()

        if not config or not config.posthog_api_key:
            return None

        try:
            return self._encryption.decrypt(config.posthog_api_key)
        except EncryptionError:
            logger.error(f"Failed to decrypt API key for workspace {workspace_id}")
            raise
