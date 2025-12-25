"""
PostHog Query Client with rate limiting, caching, and retry logic.
Executes HogQL queries against the PostHog API.
"""
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import requests
from sqlalchemy.orm import Session

from app.core.config_manager import ConfigManager
from app.core.rate_limiter import RateLimiter, RateLimitExceeded, get_rate_limiter
from app.core.query_cache import QueryCacheService, get_query_cache

logger = logging.getLogger(__name__)


@dataclass
class QueryResult:
    """Result of a PostHog query execution."""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    cached: bool = False
    query_time_ms: int = 0


@dataclass
class HealthStatus:
    """Health status of PostHog connection."""
    connected: bool
    message: str
    rate_limit_remaining: int = 0
    rate_limit_percent: float = 0.0
    details: Optional[Dict[str, Any]] = None


class PostHogQueryClient:
    """
    PostHog query client with rate limiting and caching.

    Provides methods to execute HogQL queries, fetch events, and manage
    query budget. Integrates with ConfigManager for credentials.

    Usage:
        client = PostHogQueryClient(db, config_manager)

        # Execute a HogQL query
        result = await client.execute_query("SELECT count() FROM events")

        # Check health
        health = await client.health_check()
    """

    DEFAULT_HOST = "https://app.posthog.com"
    DEFAULT_TIMEOUT = 30

    def __init__(
        self,
        db: Session,
        config_manager: Optional[ConfigManager] = None,
        rate_limiter: Optional[RateLimiter] = None,
        query_cache: Optional[QueryCacheService] = None
    ):
        """
        Initialize PostHog query client.

        Args:
            db: Database session.
            config_manager: ConfigManager for credentials (creates one if not provided).
            rate_limiter: Rate limiter (creates one if not provided).
            query_cache: Query cache (creates one if not provided).
        """
        self.db = db
        self.config_manager = config_manager or ConfigManager(db)
        self.rate_limiter = rate_limiter or get_rate_limiter(db, "posthog")
        self.query_cache = query_cache or get_query_cache(db)

        # Load config
        self._load_config()

    def _load_config(self) -> None:
        """Load PostHog configuration from database or environment."""
        config = self.config_manager.get_integration("posthog", include_api_key=True)

        if config:
            self.api_key = config.get("api_key")
            self.project_id = config.get("project_id")
            self.host = config.get("host", self.DEFAULT_HOST)
            self.is_configured = bool(self.api_key and self.project_id)
        else:
            # Fall back to environment variables
            from app.config import settings
            self.api_key = settings.posthog_api_key
            self.project_id = settings.posthog_project_id
            self.host = settings.posthog_host or self.DEFAULT_HOST
            self.is_configured = bool(self.api_key and self.project_id)

    def _get_headers(self) -> Dict[str, str]:
        """Get request headers with authentication."""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    async def execute_query(
        self,
        query: str,
        refresh: str = "blocking",
        cache_ttl: Optional[int] = None,
        skip_cache: bool = False
    ) -> QueryResult:
        """
        Execute a HogQL query against PostHog.

        Args:
            query: HogQL query string.
            refresh: Refresh mode ("blocking", "async", "force_blocking").
            cache_ttl: Cache TTL in seconds (None uses default).
            skip_cache: Skip cache lookup and force fresh query.

        Returns:
            QueryResult with data or error.
        """
        if not self.is_configured:
            return QueryResult(
                success=False,
                error="PostHog not configured. Set API key and project ID."
            )

        # Check cache first (unless skipped)
        cache_key = {"query": query, "project_id": self.project_id}
        if not skip_cache:
            cached_result = self.query_cache.get("posthog", cache_key)
            if cached_result is not None:
                return QueryResult(
                    success=True,
                    data=cached_result,
                    cached=True
                )

        # Check rate limit
        try:
            self.rate_limiter.check_and_record(endpoint="query")
        except RateLimitExceeded as e:
            return QueryResult(
                success=False,
                error=str(e)
            )

        # Execute query
        start_time = time.time()
        try:
            url = f"{self.host}/api/projects/{self.project_id}/query/"
            payload = {
                "query": {
                    "kind": "HogQLQuery",
                    "query": query
                },
                "refresh": refresh
            }

            response = requests.post(
                url,
                headers=self._get_headers(),
                json=payload,
                timeout=self.DEFAULT_TIMEOUT
            )

            query_time_ms = int((time.time() - start_time) * 1000)

            if response.status_code == 200:
                data = response.json()

                # Cache the result
                self.query_cache.set("posthog", cache_key, data, ttl=cache_ttl)

                return QueryResult(
                    success=True,
                    data=data,
                    query_time_ms=query_time_ms
                )
            elif response.status_code == 429:
                return QueryResult(
                    success=False,
                    error="PostHog rate limit exceeded. Try again later.",
                    query_time_ms=query_time_ms
                )
            elif response.status_code == 401:
                return QueryResult(
                    success=False,
                    error="Invalid PostHog API key.",
                    query_time_ms=query_time_ms
                )
            else:
                error_detail = response.text[:500]
                return QueryResult(
                    success=False,
                    error=f"PostHog API error ({response.status_code}): {error_detail}",
                    query_time_ms=query_time_ms
                )

        except requests.Timeout:
            return QueryResult(
                success=False,
                error="PostHog query timed out."
            )
        except requests.RequestException as e:
            return QueryResult(
                success=False,
                error=f"PostHog request failed: {str(e)}"
            )

    async def get_events(
        self,
        event_name: Optional[str] = None,
        limit: int = 100,
        after: Optional[str] = None,
        before: Optional[str] = None,
        properties: Optional[Dict] = None
    ) -> QueryResult:
        """
        Fetch events from PostHog.

        Args:
            event_name: Filter by event name.
            limit: Maximum events to return.
            after: ISO timestamp for start date.
            before: ISO timestamp for end date.
            properties: Property filters.

        Returns:
            QueryResult with events data.
        """
        if not self.is_configured:
            return QueryResult(
                success=False,
                error="PostHog not configured."
            )

        # Build HogQL query
        conditions = []
        if event_name:
            conditions.append(f"event = '{event_name}'")
        if after:
            conditions.append(f"timestamp >= '{after}'")
        if before:
            conditions.append(f"timestamp <= '{before}'")

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        query = f"""
            SELECT
                uuid,
                event,
                distinct_id,
                properties,
                timestamp
            FROM events
            {where_clause}
            ORDER BY timestamp DESC
            LIMIT {limit}
        """

        return await self.execute_query(query)

    async def get_persons(
        self,
        limit: int = 100,
        search: Optional[str] = None
    ) -> QueryResult:
        """
        Fetch persons from PostHog.

        Args:
            limit: Maximum persons to return.
            search: Search query for email/name.

        Returns:
            QueryResult with persons data.
        """
        if not self.is_configured:
            return QueryResult(
                success=False,
                error="PostHog not configured."
            )

        # Use REST API for persons
        try:
            self.rate_limiter.check_and_record(endpoint="persons")
        except RateLimitExceeded as e:
            return QueryResult(success=False, error=str(e))

        try:
            url = f"{self.host}/api/projects/{self.project_id}/persons/"
            params = {"limit": limit}
            if search:
                params["search"] = search

            response = requests.get(
                url,
                headers=self._get_headers(),
                params=params,
                timeout=self.DEFAULT_TIMEOUT
            )

            if response.status_code == 200:
                return QueryResult(success=True, data=response.json())
            else:
                return QueryResult(
                    success=False,
                    error=f"Failed to fetch persons: {response.status_code}"
                )
        except Exception as e:
            return QueryResult(success=False, error=str(e))

    async def get_projects(self) -> List[Dict[str, Any]]:
        """
        Fetch available PostHog projects.

        Returns:
            List of project dictionaries.
        """
        if not self.api_key:
            return []

        try:
            url = f"{self.host}/api/projects/"
            response = requests.get(
                url,
                headers=self._get_headers(),
                timeout=self.DEFAULT_TIMEOUT
            )

            if response.status_code == 200:
                data = response.json()
                return data.get("results", [])
            else:
                logger.error(f"Failed to fetch projects: {response.status_code}")
                return []
        except Exception as e:
            logger.error(f"Error fetching projects: {e}")
            return []

    async def health_check(self) -> HealthStatus:
        """
        Check PostHog connection health.

        Returns:
            HealthStatus with connection info.
        """
        if not self.is_configured:
            return HealthStatus(
                connected=False,
                message="PostHog not configured"
            )

        try:
            url = f"{self.host}/api/users/@me/"
            response = requests.get(
                url,
                headers=self._get_headers(),
                timeout=10
            )

            rate_status = self.rate_limiter.get_status()

            if response.status_code == 200:
                user_data = response.json()
                return HealthStatus(
                    connected=True,
                    message=f"Connected as {user_data.get('email', 'unknown')}",
                    rate_limit_remaining=rate_status["remaining"],
                    rate_limit_percent=rate_status["usage_percent"],
                    details={
                        "email": user_data.get("email"),
                        "organization": user_data.get("organization", {}).get("name"),
                        "project_id": self.project_id
                    }
                )
            elif response.status_code == 401:
                return HealthStatus(
                    connected=False,
                    message="Invalid API key"
                )
            else:
                return HealthStatus(
                    connected=False,
                    message=f"Connection failed: {response.status_code}"
                )
        except requests.Timeout:
            return HealthStatus(
                connected=False,
                message="Connection timed out"
            )
        except Exception as e:
            return HealthStatus(
                connected=False,
                message=f"Connection error: {str(e)}"
            )

    def get_rate_limit_status(self) -> Dict[str, Any]:
        """Get current rate limit status."""
        return self.rate_limiter.get_status()

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics for PostHog."""
        return self.query_cache.get_stats("posthog")

    def invalidate_cache(self) -> int:
        """Invalidate all PostHog cache entries."""
        return self.query_cache.invalidate_integration("posthog")

    # ============================================
    # Dashboard API Methods
    # ============================================

    def list_dashboards(self, limit: int = 100) -> List[Dict[str, Any]]:
        """
        List all dashboards in the project.

        Args:
            limit: Maximum dashboards to return.

        Returns:
            List of dashboard dictionaries.
        """
        if not self.is_configured:
            return []

        try:
            url = f"{self.host}/api/projects/{self.project_id}/dashboards/"
            params = {"limit": limit}

            response = requests.get(
                url,
                headers=self._get_headers(),
                params=params,
                timeout=self.DEFAULT_TIMEOUT
            )

            if response.status_code == 200:
                data = response.json()
                return data.get("results", [])
            else:
                logger.error(f"Failed to list dashboards: {response.status_code}")
                return []
        except Exception as e:
            logger.error(f"Error listing dashboards: {e}")
            return []

    def create_dashboard(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new dashboard.

        Args:
            payload: Dashboard creation payload with keys:
                - name: Dashboard name
                - description: Optional description
                - tags: Optional list of tags
                - creation_mode: "template" or "default"

        Returns:
            Created dashboard data.

        Raises:
            Exception if creation fails.
        """
        if not self.is_configured:
            raise Exception("PostHog not configured")

        try:
            url = f"{self.host}/api/projects/{self.project_id}/dashboards/"

            response = requests.post(
                url,
                headers=self._get_headers(),
                json=payload,
                timeout=self.DEFAULT_TIMEOUT
            )

            if response.status_code in [200, 201]:
                return response.json()
            else:
                error_msg = response.text[:500]
                raise Exception(f"Failed to create dashboard: {response.status_code} - {error_msg}")

        except Exception as e:
            logger.error(f"Error creating dashboard: {e}")
            raise

    def create_insight(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new insight (chart/visualization).

        Args:
            payload: Insight creation payload with keys:
                - name: Insight name
                - description: Optional description
                - query: Query configuration (HogQLQuery or other)
                - dashboards: List of dashboard IDs to attach to

        Returns:
            Created insight data.

        Raises:
            Exception if creation fails.
        """
        if not self.is_configured:
            raise Exception("PostHog not configured")

        try:
            url = f"{self.host}/api/projects/{self.project_id}/insights/"

            response = requests.post(
                url,
                headers=self._get_headers(),
                json=payload,
                timeout=self.DEFAULT_TIMEOUT
            )

            if response.status_code in [200, 201]:
                return response.json()
            else:
                error_msg = response.text[:500]
                raise Exception(f"Failed to create insight: {response.status_code} - {error_msg}")

        except Exception as e:
            logger.error(f"Error creating insight: {e}")
            raise

    def delete_dashboard(self, dashboard_id: str) -> bool:
        """
        Delete a dashboard.

        Args:
            dashboard_id: Dashboard ID to delete.

        Returns:
            True if deleted successfully.
        """
        if not self.is_configured:
            return False

        try:
            url = f"{self.host}/api/projects/{self.project_id}/dashboards/{dashboard_id}/"

            response = requests.delete(
                url,
                headers=self._get_headers(),
                timeout=self.DEFAULT_TIMEOUT
            )

            return response.status_code in [200, 204]

        except Exception as e:
            logger.error(f"Error deleting dashboard {dashboard_id}: {e}")
            return False

    def get_dashboard(self, dashboard_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific dashboard by ID.

        Args:
            dashboard_id: Dashboard ID.

        Returns:
            Dashboard data or None if not found.
        """
        if not self.is_configured:
            return None

        try:
            url = f"{self.host}/api/projects/{self.project_id}/dashboards/{dashboard_id}/"

            response = requests.get(
                url,
                headers=self._get_headers(),
                timeout=self.DEFAULT_TIMEOUT
            )

            if response.status_code == 200:
                return response.json()
            else:
                return None

        except Exception as e:
            logger.error(f"Error getting dashboard {dashboard_id}: {e}")
            return None


def get_posthog_query_client(db: Session) -> PostHogQueryClient:
    """
    Factory function to create a PostHog query client.

    Args:
        db: Database session.

    Returns:
        Configured PostHogQueryClient instance.
    """
    return PostHogQueryClient(db)
