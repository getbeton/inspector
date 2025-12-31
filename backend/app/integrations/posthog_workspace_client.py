"""
PostHog Workspace Client for validating and connecting to customer PostHog instances.

This client is specifically designed for workspace configuration validation,
separate from the analytics PostHogClient used for event fetching.

Usage:
    client = PostHogWorkspaceClient(api_key="phc_...")

    # Validate credentials
    if client.validate_credentials():
        info = client.get_workspace_info()
        print(f"Connected to: {info['name']}")
"""
import time
import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)


# ============================================
# Custom Exceptions
# ============================================

class PostHogClientError(Exception):
    """Base exception for PostHog client errors."""
    pass


class InvalidAPIKeyError(PostHogClientError):
    """Raised when the API key is invalid or unauthorized."""
    pass


class WorkspaceNotFoundError(PostHogClientError):
    """Raised when the workspace/project cannot be found."""
    pass


class RateLimitExceededError(PostHogClientError):
    """Raised when PostHog rate limit is exceeded."""
    def __init__(self, message: str, retry_after: int = 60):
        super().__init__(message)
        self.retry_after = retry_after


class ConnectionError(PostHogClientError):
    """Raised when connection to PostHog fails."""
    pass


class TimeoutError(PostHogClientError):
    """Raised when request times out."""
    pass


# ============================================
# PostHog Workspace Client
# ============================================

@dataclass
class WorkspaceInfo:
    """Information about a PostHog workspace/project."""
    id: str
    name: str
    organization_id: str
    organization_name: str
    uuid: Optional[str] = None
    api_token: Optional[str] = None
    timezone: str = "UTC"
    is_demo: bool = False


class PostHogWorkspaceClient:
    """
    Client for validating PostHog workspace credentials and fetching workspace info.

    Designed for workspace configuration validation, with retry logic and
    comprehensive error handling.

    Attributes:
        api_key: PostHog personal API key (starts with 'phc_')
        host: PostHog host URL (default: https://app.posthog.com)
        timeout: Request timeout in seconds (default: 10)
        max_retries: Maximum number of retry attempts (default: 3)

    Example:
        >>> client = PostHogWorkspaceClient(api_key="phc_abc123...")
        >>> if client.validate_credentials():
        ...     info = client.get_workspace_info()
        ...     print(f"Connected to {info.name}")
    """

    DEFAULT_HOST = "https://app.posthog.com"
    DEFAULT_TIMEOUT = 10
    MAX_RETRIES = 3
    BACKOFF_FACTOR = 0.5  # Exponential backoff: 0.5, 1, 2 seconds

    def __init__(
        self,
        api_key: str,
        host: str = DEFAULT_HOST,
        timeout: int = DEFAULT_TIMEOUT,
        max_retries: int = MAX_RETRIES
    ):
        """
        Initialize the PostHog workspace client.

        Args:
            api_key: PostHog personal API key (format: phc_XXXX)
            host: PostHog API host URL
            timeout: Request timeout in seconds
            max_retries: Maximum retry attempts for transient failures

        Raises:
            InvalidAPIKeyError: If API key format is invalid
        """
        if not api_key:
            raise InvalidAPIKeyError("API key cannot be empty")

        if not self._validate_key_format(api_key):
            raise InvalidAPIKeyError(
                f"Invalid API key format. PostHog personal API keys start with 'phc_'. "
                f"Got: {api_key[:10]}..."
            )

        self.api_key = api_key
        self.host = host.rstrip('/')
        self.timeout = timeout
        self.max_retries = max_retries
        self._session = self._create_session()
        self._cached_projects: Optional[List[Dict]] = None

        logger.debug(f"PostHogWorkspaceClient initialized for host: {self.host}")

    @staticmethod
    def _validate_key_format(api_key: str) -> bool:
        """
        Validate that the API key has the correct format.

        PostHog personal API keys start with 'phc_' followed by alphanumeric chars.

        Args:
            api_key: The API key to validate

        Returns:
            True if format is valid, False otherwise
        """
        if not api_key or not isinstance(api_key, str):
            return False

        # PostHog personal API keys start with 'phc_'
        if not api_key.startswith('phc_'):
            return False

        # Should have reasonable length (phc_ + at least 20 chars)
        if len(api_key) < 24:
            return False

        return True

    def _create_session(self) -> requests.Session:
        """
        Create a requests session with retry configuration.

        Returns:
            Configured requests.Session
        """
        session = requests.Session()

        # Configure retry strategy with exponential backoff
        retry_strategy = Retry(
            total=self.max_retries,
            backoff_factor=self.BACKOFF_FACTOR,
            status_forcelist=[500, 502, 503, 504],
            allowed_methods=["GET", "POST"]
        )

        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("https://", adapter)
        session.mount("http://", adapter)

        # Set default headers
        session.headers.update({
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Beton-Inspector/1.0"
        })

        return session

    def _make_request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict] = None,
        data: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Make an HTTP request to the PostHog API with error handling.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            params: Query parameters
            data: Request body data

        Returns:
            JSON response as dictionary

        Raises:
            InvalidAPIKeyError: 401 response
            WorkspaceNotFoundError: 404 response
            RateLimitExceededError: 429 response
            ConnectionError: Network errors
            TimeoutError: Request timeout
        """
        url = f"{self.host}/api{endpoint}"

        try:
            response = self._session.request(
                method=method,
                url=url,
                params=params,
                json=data,
                timeout=self.timeout
            )

            # Handle different response codes
            if response.status_code == 200:
                return response.json()

            elif response.status_code == 401:
                logger.warning(f"PostHog API key unauthorized: {url}")
                raise InvalidAPIKeyError(
                    "Invalid or unauthorized API key. Please check your PostHog personal API key."
                )

            elif response.status_code == 403:
                logger.warning(f"PostHog API access forbidden: {url}")
                raise InvalidAPIKeyError(
                    "Access forbidden. Your API key may not have sufficient permissions."
                )

            elif response.status_code == 404:
                logger.warning(f"PostHog resource not found: {url}")
                raise WorkspaceNotFoundError(
                    "Workspace or project not found. Please verify your project ID."
                )

            elif response.status_code == 429:
                retry_after = int(response.headers.get('Retry-After', 60))
                logger.warning(f"PostHog rate limit exceeded. Retry after {retry_after}s")
                raise RateLimitExceededError(
                    f"Rate limit exceeded. Please retry after {retry_after} seconds.",
                    retry_after=retry_after
                )

            else:
                error_detail = response.text[:200] if response.text else "No details"
                logger.error(f"PostHog API error {response.status_code}: {error_detail}")
                raise PostHogClientError(
                    f"PostHog API error: {response.status_code} - {error_detail}"
                )

        except requests.exceptions.Timeout:
            logger.error(f"PostHog request timed out: {url}")
            raise TimeoutError(
                f"Request timed out after {self.timeout} seconds. "
                "PostHog may be temporarily unavailable."
            )

        except requests.exceptions.ConnectionError as e:
            logger.error(f"PostHog connection error: {e}")
            raise ConnectionError(
                f"Failed to connect to PostHog at {self.host}. "
                "Please check your network connection and host URL."
            )

        except requests.exceptions.RequestException as e:
            logger.error(f"PostHog request failed: {e}")
            raise PostHogClientError(f"Request failed: {e}")

    def validate_credentials(self) -> bool:
        """
        Validate the API key by making a test request to PostHog.

        Makes a lightweight request to the /api/projects/ endpoint
        to verify the API key is valid and has access.

        Returns:
            True if credentials are valid

        Raises:
            InvalidAPIKeyError: If API key is invalid
            ConnectionError: If connection fails
            TimeoutError: If request times out

        Example:
            >>> client = PostHogWorkspaceClient(api_key="phc_...")
            >>> try:
            ...     if client.validate_credentials():
            ...         print("Credentials valid!")
            ... except InvalidAPIKeyError:
            ...     print("Invalid API key")
        """
        try:
            # Fetch projects to validate - this is the lightest endpoint
            response = self._make_request("GET", "/projects/")

            # If we get here, credentials are valid
            # Cache the projects for later use
            if isinstance(response, dict) and 'results' in response:
                self._cached_projects = response['results']
            elif isinstance(response, list):
                self._cached_projects = response

            logger.info("PostHog credentials validated successfully")
            return True

        except (InvalidAPIKeyError, WorkspaceNotFoundError):
            raise
        except PostHogClientError as e:
            logger.error(f"Credential validation failed: {e}")
            raise

    def get_workspace_info(self) -> WorkspaceInfo:
        """
        Get information about the connected PostHog workspace/project.

        Returns the first project associated with the API key.

        Returns:
            WorkspaceInfo object with workspace details

        Raises:
            WorkspaceNotFoundError: If no projects found
            InvalidAPIKeyError: If API key is invalid

        Example:
            >>> client = PostHogWorkspaceClient(api_key="phc_...")
            >>> info = client.get_workspace_info()
            >>> print(f"Project: {info.name} (ID: {info.id})")
        """
        # Use cached projects if available
        if self._cached_projects is None:
            response = self._make_request("GET", "/projects/")
            if isinstance(response, dict) and 'results' in response:
                self._cached_projects = response['results']
            elif isinstance(response, list):
                self._cached_projects = response
            else:
                self._cached_projects = []

        if not self._cached_projects:
            raise WorkspaceNotFoundError(
                "No projects found for this API key. "
                "Please ensure your API key has access to at least one project."
            )

        # Get first project
        project = self._cached_projects[0]

        return WorkspaceInfo(
            id=str(project.get('id', '')),
            name=project.get('name', 'Unknown'),
            organization_id=str(project.get('organization', '')),
            organization_name=project.get('organization_name', ''),
            uuid=project.get('uuid'),
            api_token=project.get('api_token'),
            timezone=project.get('timezone', 'UTC'),
            is_demo=project.get('is_demo', False)
        )

    def get_events_count(self, days: int = 30) -> int:
        """
        Get approximate count of events in the project.

        Uses the events endpoint to get a count of recent events.

        Args:
            days: Number of days to look back (default: 30)

        Returns:
            Approximate event count

        Example:
            >>> client = PostHogWorkspaceClient(api_key="phc_...")
            >>> count = client.get_events_count(days=7)
            >>> print(f"Events in last 7 days: {count}")
        """
        try:
            # Get workspace info to get project ID
            info = self.get_workspace_info()

            # Query events count using insights API
            response = self._make_request(
                "GET",
                f"/projects/{info.id}/insights/trend/",
                params={
                    "events": '[{"id": "$pageview"}]',
                    "date_from": f"-{days}d",
                    "interval": "month"
                }
            )

            # Sum up the results
            if 'result' in response and response['result']:
                total = sum(
                    sum(r.get('data', []))
                    for r in response['result']
                )
                return total

            return 0

        except PostHogClientError:
            logger.warning("Could not get events count, returning 0")
            return 0

    def get_feature_flags(self) -> List[Dict[str, Any]]:
        """
        Get list of feature flags in the project.

        Returns:
            List of feature flag dictionaries

        Example:
            >>> client = PostHogWorkspaceClient(api_key="phc_...")
            >>> flags = client.get_feature_flags()
            >>> for flag in flags:
            ...     print(f"Flag: {flag['key']} - Active: {flag['active']}")
        """
        try:
            info = self.get_workspace_info()
            response = self._make_request(
                "GET",
                f"/projects/{info.id}/feature_flags/"
            )

            if isinstance(response, dict) and 'results' in response:
                return response['results']
            elif isinstance(response, list):
                return response

            return []

        except PostHogClientError as e:
            logger.warning(f"Could not get feature flags: {e}")
            return []

    def get_all_projects(self) -> List[Dict[str, Any]]:
        """
        Get all projects accessible with this API key.

        Returns:
            List of project dictionaries
        """
        if self._cached_projects is None:
            response = self._make_request("GET", "/projects/")
            if isinstance(response, dict) and 'results' in response:
                self._cached_projects = response['results']
            elif isinstance(response, list):
                self._cached_projects = response
            else:
                self._cached_projects = []

        return self._cached_projects

    def close(self):
        """Close the HTTP session."""
        if self._session:
            self._session.close()
            logger.debug("PostHogWorkspaceClient session closed")

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()
        return False
