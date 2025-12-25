"""
Attio CRM API Client.

Provides functionality for:
- Connection validation
- Object/attribute discovery
- Record upserts (create or update)
- Batch operations with rate limiting
"""
import logging
import hashlib
from datetime import datetime
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from enum import Enum

import requests
from sqlalchemy.orm import Session

from app.core.config_manager import ConfigManager

logger = logging.getLogger(__name__)


class AttioError(Exception):
    """Base exception for Attio API errors."""
    pass


class AttioAuthError(AttioError):
    """Authentication failed."""
    pass


class AttioRateLimitError(AttioError):
    """Rate limit exceeded."""
    def __init__(self, message: str, retry_after: int = 60):
        super().__init__(message)
        self.retry_after = retry_after


class AttioNotFoundError(AttioError):
    """Resource not found."""
    pass


class AttioValidationError(AttioError):
    """Request validation failed."""
    pass


@dataclass
class AttioObject:
    """Represents an Attio object (e.g., companies, people)."""
    id: str
    slug: str
    singular_noun: str
    plural_noun: str


@dataclass
class AttioAttribute:
    """Represents an Attio attribute on an object."""
    id: str
    slug: str
    title: str
    type: str
    is_required: bool = False
    is_unique: bool = False
    is_writable: bool = True


@dataclass
class AttioRecord:
    """Represents an Attio record."""
    id: str
    object_slug: str
    values: Dict[str, Any]
    created_at: Optional[datetime] = None


@dataclass
class AttioUpsertResult:
    """Result of an upsert operation."""
    record_id: str
    action: str  # "created" or "updated"
    matching_attribute: Optional[str] = None


class AttioClient:
    """
    Attio CRM API client.

    Usage:
        client = AttioClient(db, config_manager)

        # Validate connection
        if await client.validate_connection():
            # Discover objects
            objects = await client.discover_objects()

            # Upsert a record
            result = await client.upsert_record("companies", {...})
    """

    BASE_URL = "https://api.attio.com/v2"

    def __init__(
        self,
        db: Session,
        config_manager: ConfigManager,
        api_key: Optional[str] = None
    ):
        """
        Initialize Attio client.

        Args:
            db: Database session.
            config_manager: Configuration manager for getting Attio credentials.
            api_key: Optional API key override (useful for testing).
        """
        self.db = db
        self.config_manager = config_manager
        self._api_key = api_key
        self._workspace_id: Optional[str] = None
        self._session: Optional[requests.Session] = None

    def _get_credentials(self) -> tuple[str, Optional[str]]:
        """Get API key and workspace ID from config or override."""
        if self._api_key:
            return self._api_key, self._workspace_id

        config = self.config_manager.get_integration("attio")
        if not config:
            raise AttioAuthError("Attio integration not configured")

        api_key = config.get("api_key")
        if not api_key:
            raise AttioAuthError("Attio API key not found in configuration")

        workspace_id = config.get("config", {}).get("workspace_id")
        return api_key, workspace_id

    def _get_session(self) -> requests.Session:
        """Get or create HTTP session with auth headers."""
        if self._session is None:
            api_key, _ = self._get_credentials()
            self._session = requests.Session()
            self._session.headers.update({
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json"
            })
        return self._session

    def _handle_response(self, response: requests.Response) -> Dict[str, Any]:
        """Handle API response and raise appropriate exceptions."""
        if response.status_code == 200 or response.status_code == 201:
            return response.json()

        error_body = {}
        try:
            error_body = response.json()
        except:
            pass

        error_message = error_body.get("message", response.text)

        if response.status_code == 401:
            raise AttioAuthError(f"Authentication failed: {error_message}")
        elif response.status_code == 403:
            raise AttioAuthError(f"Access forbidden: {error_message}")
        elif response.status_code == 404:
            raise AttioNotFoundError(f"Resource not found: {error_message}")
        elif response.status_code == 422:
            raise AttioValidationError(f"Validation failed: {error_message}")
        elif response.status_code == 429:
            retry_after = int(response.headers.get("Retry-After", 60))
            raise AttioRateLimitError(f"Rate limit exceeded: {error_message}", retry_after)
        else:
            raise AttioError(f"API error ({response.status_code}): {error_message}")

    def validate_connection(self) -> Dict[str, Any]:
        """
        Validate API key and get workspace info.

        Returns:
            Dict with workspace info on success.

        Raises:
            AttioAuthError: If authentication fails.
        """
        session = self._get_session()

        try:
            response = session.get(f"{self.BASE_URL}/self")
            data = self._handle_response(response)

            logger.info(f"Attio connection validated. Workspace: {data.get('workspace', {}).get('name', 'Unknown')}")
            return {
                "valid": True,
                "workspace_id": data.get("workspace", {}).get("id"),
                "workspace_name": data.get("workspace", {}).get("name"),
                "user_email": data.get("user", {}).get("email_address")
            }
        except AttioError:
            raise
        except Exception as e:
            logger.error(f"Failed to validate Attio connection: {e}")
            raise AttioError(f"Connection validation failed: {e}")

    def discover_objects(self) -> List[AttioObject]:
        """
        Fetch all available objects in the workspace.

        Returns:
            List of AttioObject instances.
        """
        session = self._get_session()

        response = session.get(f"{self.BASE_URL}/objects")
        data = self._handle_response(response)

        objects = []
        for obj in data.get("data", []):
            objects.append(AttioObject(
                id=obj.get("id", {}).get("object_id", ""),
                slug=obj.get("api_slug", ""),
                singular_noun=obj.get("singular_noun", ""),
                plural_noun=obj.get("plural_noun", "")
            ))

        logger.info(f"Discovered {len(objects)} Attio objects")
        return objects

    def get_object_attributes(self, object_slug: str) -> List[AttioAttribute]:
        """
        Get all attributes for an object.

        Args:
            object_slug: The object slug (e.g., "companies").

        Returns:
            List of AttioAttribute instances.
        """
        session = self._get_session()

        response = session.get(f"{self.BASE_URL}/objects/{object_slug}/attributes")
        data = self._handle_response(response)

        attributes = []
        for attr in data.get("data", []):
            attributes.append(AttioAttribute(
                id=attr.get("id", {}).get("attribute_id", ""),
                slug=attr.get("api_slug", ""),
                title=attr.get("title", ""),
                type=attr.get("type", ""),
                is_required=attr.get("is_required", False),
                is_unique=attr.get("is_unique", False),
                is_writable=attr.get("is_writable", True)
            ))

        logger.debug(f"Found {len(attributes)} attributes for {object_slug}")
        return attributes

    def create_attribute(
        self,
        object_slug: str,
        title: str,
        api_slug: str,
        attr_type: str = "text",
        is_required: bool = False,
        is_unique: bool = False
    ) -> AttioAttribute:
        """
        Create a new attribute on an object.

        Args:
            object_slug: The object slug (e.g., "companies").
            title: Human-readable attribute title.
            api_slug: API slug for the attribute.
            attr_type: Attribute type (text, number, timestamp, etc.).
            is_required: Whether the attribute is required.
            is_unique: Whether values must be unique.

        Returns:
            Created AttioAttribute.
        """
        session = self._get_session()

        payload = {
            "title": title,
            "api_slug": api_slug,
            "type": attr_type,
            "is_required": is_required,
            "is_unique": is_unique
        }

        response = session.post(
            f"{self.BASE_URL}/objects/{object_slug}/attributes",
            json=payload
        )
        data = self._handle_response(response)

        attr = data.get("data", {})
        logger.info(f"Created attribute {api_slug} on {object_slug}")

        return AttioAttribute(
            id=attr.get("id", {}).get("attribute_id", ""),
            slug=attr.get("api_slug", api_slug),
            title=attr.get("title", title),
            type=attr.get("type", attr_type),
            is_required=is_required,
            is_unique=is_unique,
            is_writable=True
        )

    def ensure_attributes(
        self,
        object_slug: str,
        required_attributes: List[Dict[str, Any]]
    ) -> Dict[str, AttioAttribute]:
        """
        Ensure required attributes exist on an object, creating them if needed.

        Args:
            object_slug: The object slug.
            required_attributes: List of attribute specs with keys:
                - api_slug: str
                - title: str
                - type: str (text, number, timestamp, etc.)

        Returns:
            Dict mapping api_slug to AttioAttribute.
        """
        existing = {attr.slug: attr for attr in self.get_object_attributes(object_slug)}
        result = {}

        for attr_spec in required_attributes:
            api_slug = attr_spec["api_slug"]

            if api_slug in existing:
                result[api_slug] = existing[api_slug]
                logger.debug(f"Attribute {api_slug} already exists on {object_slug}")
            else:
                # Create the attribute
                try:
                    created = self.create_attribute(
                        object_slug=object_slug,
                        title=attr_spec["title"],
                        api_slug=api_slug,
                        attr_type=attr_spec.get("type", "text"),
                        is_required=attr_spec.get("is_required", False),
                        is_unique=attr_spec.get("is_unique", False)
                    )
                    result[api_slug] = created
                except AttioValidationError as e:
                    # Attribute might already exist with different casing
                    logger.warning(f"Failed to create attribute {api_slug}: {e}")
                    # Try to find it again with fresh fetch
                    refreshed = {a.slug: a for a in self.get_object_attributes(object_slug)}
                    if api_slug in refreshed:
                        result[api_slug] = refreshed[api_slug]

        return result

    def upsert_record(
        self,
        object_slug: str,
        values: Dict[str, Any],
        matching_attribute: str = "domain"
    ) -> AttioUpsertResult:
        """
        Create or update a record based on matching attribute.

        Args:
            object_slug: The object slug (e.g., "companies").
            values: Dict of attribute_slug -> value.
            matching_attribute: Attribute to use for finding existing records.

        Returns:
            AttioUpsertResult with record ID and action taken.
        """
        session = self._get_session()

        # Format values for Attio API
        formatted_values = {}
        for key, value in values.items():
            if value is not None:
                formatted_values[key] = value

        payload = {
            "data": {
                "values": formatted_values
            }
        }

        # Add matching attribute for upsert
        if matching_attribute and matching_attribute in values:
            payload["data"]["matching_attribute"] = matching_attribute

        response = session.put(
            f"{self.BASE_URL}/objects/{object_slug}/records",
            json=payload
        )
        data = self._handle_response(response)

        record = data.get("data", {})
        record_id = record.get("id", {}).get("record_id", "")

        # Determine if created or updated based on response
        # Attio API doesn't explicitly indicate this, so we check created_at
        action = "upserted"

        logger.debug(f"Upserted record {record_id} in {object_slug}")

        return AttioUpsertResult(
            record_id=record_id,
            action=action,
            matching_attribute=matching_attribute
        )

    def get_record(
        self,
        object_slug: str,
        record_id: str
    ) -> Optional[AttioRecord]:
        """
        Get a specific record by ID.

        Args:
            object_slug: The object slug.
            record_id: The record ID.

        Returns:
            AttioRecord or None if not found.
        """
        session = self._get_session()

        try:
            response = session.get(
                f"{self.BASE_URL}/objects/{object_slug}/records/{record_id}"
            )
            data = self._handle_response(response)

            record = data.get("data", {})
            return AttioRecord(
                id=record.get("id", {}).get("record_id", ""),
                object_slug=object_slug,
                values=record.get("values", {}),
                created_at=record.get("created_at")
            )
        except AttioNotFoundError:
            return None

    def search_records(
        self,
        object_slug: str,
        filter_attribute: str,
        filter_value: Any,
        limit: int = 100
    ) -> List[AttioRecord]:
        """
        Search for records by attribute value.

        Args:
            object_slug: The object slug.
            filter_attribute: Attribute to filter on.
            filter_value: Value to search for.
            limit: Maximum records to return.

        Returns:
            List of matching AttioRecords.
        """
        session = self._get_session()

        payload = {
            "filter": {
                filter_attribute: filter_value
            },
            "limit": limit
        }

        response = session.post(
            f"{self.BASE_URL}/objects/{object_slug}/records/query",
            json=payload
        )
        data = self._handle_response(response)

        records = []
        for record in data.get("data", []):
            records.append(AttioRecord(
                id=record.get("id", {}).get("record_id", ""),
                object_slug=object_slug,
                values=record.get("values", {}),
                created_at=record.get("created_at")
            ))

        return records

    def health_check(self) -> Dict[str, Any]:
        """
        Perform a health check on the Attio integration.

        Returns:
            Dict with health status info.
        """
        try:
            validation = self.validate_connection()
            return {
                "healthy": True,
                "status": "connected",
                "workspace_name": validation.get("workspace_name"),
                "user_email": validation.get("user_email"),
                "error": None
            }
        except AttioAuthError as e:
            return {
                "healthy": False,
                "status": "auth_error",
                "workspace_name": None,
                "user_email": None,
                "error": str(e)
            }
        except AttioError as e:
            return {
                "healthy": False,
                "status": "error",
                "workspace_name": None,
                "user_email": None,
                "error": str(e)
            }
        except Exception as e:
            return {
                "healthy": False,
                "status": "unknown_error",
                "workspace_name": None,
                "user_email": None,
                "error": str(e)
            }


def get_attio_client(db: Session, config_manager: ConfigManager) -> AttioClient:
    """Factory function to create an Attio client."""
    return AttioClient(db, config_manager)
