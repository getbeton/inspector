"""
Query cache for caching API responses with TTL.
Stores cache entries in database for persistence.
"""
import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import QueryCache

logger = logging.getLogger(__name__)


class QueryCacheService:
    """
    Database-backed query cache with TTL support.

    Caches query results to reduce API calls and improve response times.
    Supports configurable TTL and automatic cleanup of expired entries.

    Usage:
        cache = QueryCacheService(db, default_ttl=3600)

        # Try to get from cache
        result = cache.get("posthog", query_params)
        if result is None:
            # Cache miss - execute query
            result = execute_query(query_params)
            cache.set("posthog", query_params, result)
    """

    def __init__(self, db: Session, default_ttl: int = 3600):
        """
        Initialize cache service.

        Args:
            db: Database session.
            default_ttl: Default TTL in seconds (default: 1 hour).
        """
        self.db = db
        self.default_ttl = default_ttl

    def _generate_cache_key(self, integration: str, query_params: Any) -> str:
        """
        Generate a unique cache key from query parameters.

        Args:
            integration: Integration name.
            query_params: Query parameters (dict, string, or any JSON-serializable).

        Returns:
            SHA256 hash of the parameters.
        """
        if isinstance(query_params, dict):
            # Sort keys for consistent hashing
            params_str = json.dumps(query_params, sort_keys=True)
        else:
            params_str = str(query_params)

        key_input = f"{integration}:{params_str}"
        return hashlib.sha256(key_input.encode()).hexdigest()

    def get(self, integration: str, query_params: Any) -> Optional[Any]:
        """
        Get cached result if exists and not expired.

        Args:
            integration: Integration name.
            query_params: Query parameters used as cache key.

        Returns:
            Cached result or None if not found/expired.
        """
        cache_key = self._generate_cache_key(integration, query_params)

        entry = self.db.query(QueryCache).filter(
            QueryCache.cache_key == cache_key,
            QueryCache.integration_name == integration
        ).first()

        if entry is None:
            logger.debug(f"Cache miss for {integration}: {cache_key[:16]}...")
            return None

        # Check if expired
        if entry.expires_at and entry.expires_at < datetime.utcnow():
            logger.debug(f"Cache expired for {integration}: {cache_key[:16]}...")
            self.db.delete(entry)
            self.db.commit()
            return None

        # Update hit count and last accessed
        entry.hit_count = (entry.hit_count or 0) + 1
        entry.last_accessed_at = datetime.utcnow()
        self.db.commit()

        logger.debug(f"Cache hit for {integration}: {cache_key[:16]}... (hits: {entry.hit_count})")

        try:
            return json.loads(entry.result_json)
        except json.JSONDecodeError:
            logger.warning(f"Failed to decode cached result for {cache_key}")
            return None

    def set(
        self,
        integration: str,
        query_params: Any,
        result: Any,
        ttl: Optional[int] = None
    ) -> None:
        """
        Store result in cache.

        Args:
            integration: Integration name.
            query_params: Query parameters used as cache key.
            result: Result to cache (must be JSON-serializable).
            ttl: TTL in seconds (uses default if not specified).
        """
        cache_key = self._generate_cache_key(integration, query_params)
        ttl = ttl if ttl is not None else self.default_ttl

        # Serialize result
        try:
            result_json = json.dumps(result)
        except (TypeError, ValueError) as e:
            logger.warning(f"Failed to serialize result for caching: {e}")
            return

        # Calculate expiry
        expires_at = datetime.utcnow() + timedelta(seconds=ttl) if ttl > 0 else None

        # Serialize query hash for storage
        if isinstance(query_params, dict):
            query_hash = json.dumps(query_params, sort_keys=True)[:500]  # Truncate
        else:
            query_hash = str(query_params)[:500]

        # Upsert
        existing = self.db.query(QueryCache).filter(
            QueryCache.cache_key == cache_key
        ).first()

        if existing:
            existing.result_json = result_json
            existing.expires_at = expires_at
            existing.created_at = datetime.utcnow()
            existing.hit_count = 0
        else:
            entry = QueryCache(
                cache_key=cache_key,
                integration_name=integration,
                query_hash=query_hash,
                result_json=result_json,
                created_at=datetime.utcnow(),
                expires_at=expires_at,
                hit_count=0
            )
            self.db.add(entry)

        self.db.commit()
        logger.debug(f"Cached result for {integration}: {cache_key[:16]}... (TTL: {ttl}s)")

    def invalidate(self, integration: str, query_params: Any) -> bool:
        """
        Invalidate a specific cache entry.

        Args:
            integration: Integration name.
            query_params: Query parameters.

        Returns:
            True if entry was invalidated, False if not found.
        """
        cache_key = self._generate_cache_key(integration, query_params)

        deleted = self.db.query(QueryCache).filter(
            QueryCache.cache_key == cache_key
        ).delete()

        self.db.commit()
        return deleted > 0

    def invalidate_integration(self, integration: str) -> int:
        """
        Invalidate all cache entries for an integration.

        Args:
            integration: Integration name.

        Returns:
            Number of entries invalidated.
        """
        deleted = self.db.query(QueryCache).filter(
            QueryCache.integration_name == integration
        ).delete()

        self.db.commit()
        logger.info(f"Invalidated {deleted} cache entries for {integration}")
        return deleted

    def cleanup_expired(self) -> int:
        """
        Remove all expired cache entries.

        Returns:
            Number of entries removed.
        """
        deleted = self.db.query(QueryCache).filter(
            QueryCache.expires_at < datetime.utcnow()
        ).delete()

        self.db.commit()
        logger.info(f"Cleaned up {deleted} expired cache entries")
        return deleted

    def get_stats(self, integration: Optional[str] = None) -> dict:
        """
        Get cache statistics.

        Args:
            integration: Optional integration to filter by.

        Returns:
            Dict with cache statistics.
        """
        query = self.db.query(QueryCache)

        if integration:
            query = query.filter(QueryCache.integration_name == integration)

        entries = query.all()

        total_entries = len(entries)
        total_hits = sum(e.hit_count or 0 for e in entries)
        expired_count = sum(1 for e in entries if e.expires_at and e.expires_at < datetime.utcnow())

        return {
            "total_entries": total_entries,
            "active_entries": total_entries - expired_count,
            "expired_entries": expired_count,
            "total_hits": total_hits,
            "integration": integration,
        }


def get_query_cache(db: Session, ttl: Optional[int] = None) -> QueryCacheService:
    """
    Factory function to create a query cache service.

    Args:
        db: Database session.
        ttl: Default TTL (uses settings if not specified).

    Returns:
        Configured QueryCacheService instance.
    """
    if ttl is None:
        from app.config import settings
        ttl = settings.cache_ttl_seconds

    return QueryCacheService(db, default_ttl=ttl)
