"""
PostHog API client for fetching events, user properties, and activity data.
"""
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import time
import logging
from posthog import Posthog

logger = logging.getLogger(__name__)


class PostHogClient:
    """Client for interacting with PostHog API."""
    
    def __init__(self, api_key: str, project_id: str):
        """
        Initialize PostHog client.
        
        Args:
            api_key: PostHog API key (personal or project API key)
            project_id: PostHog project identifier
        """
        if not api_key or not project_id:
            raise ValueError("PostHog API key and project ID are required")
        
        self.api_key = api_key
        self.project_id = project_id
        self.client = Posthog(
            project_api_key=api_key,
            host='https://app.posthog.com'
        )
        logger.info(f"PostHog client initialized for project {project_id}")
    
    def get_events(
        self, 
        start_date: Optional[datetime] = None, 
        end_date: Optional[datetime] = None,
        event_type: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict]:
        """
        Fetch events from PostHog within a date range.
        
        Args:
            start_date: Start of date range (defaults to 30 days ago)
            end_date: End of date range (defaults to now)
            event_type: Filter by specific event type (optional)
            limit: Maximum number of events to return
            
        Returns:
            List of event dictionaries
        """
        if start_date is None:
            start_date = datetime.utcnow() - timedelta(days=30)
        if end_date is None:
            end_date = datetime.utcnow()
        
        try:
            # PostHog doesn't have a direct events API via the SDK
            # We'd typically use the PostHog API directly via requests
            # For now, this is a placeholder structure
            logger.info(
                f"Fetching events from {start_date} to {end_date}, "
                f"type={event_type}, limit={limit}"
            )
            
            # In production, you'd use:
            # import requests
            # url = f"https://app.posthog.com/api/projects/{self.project_id}/events"
            # headers = {"Authorization": f"Bearer {self.api_key}"}
            # params = {"after": start_date.isoformat(), "before": end_date.isoformat()}
            # response = requests.get(url, headers=headers, params=params)
            # return response.json()["results"]
            
            return []
        
        except Exception as e:
            logger.error(f"Error fetching PostHog events: {e}")
            raise
    
    def get_user_properties(self, distinct_id: str) -> Dict:
        """
        Get properties for a specific user.
        
        Args:
            distinct_id: The unique identifier for the user in PostHog
            
        Returns:
            Dictionary of user properties
        """
        try:
            logger.info(f"Fetching user properties for {distinct_id}")
            
            # In production, use the PostHog API:
            # url = f"https://app.posthog.com/api/projects/{self.project_id}/persons"
            # params = {"distinct_id": distinct_id}
            # response = requests.get(url, headers=headers, params=params)
            
            return {
                "distinct_id": distinct_id,
                "properties": {}
            }
        
        except Exception as e:
            logger.error(f"Error fetching user properties: {e}")
            raise
    
    def get_active_users(self, days: int = 30) -> List[Dict]:
        """
        Get list of active users in the last N days.
        
        Args:
            days: Number of days to look back (default: 30)
            
        Returns:
            List of active user dictionaries with their activity counts
        """
        try:
            start_date = datetime.utcnow() - timedelta(days=days)
            logger.info(f"Fetching active users since {start_date}")
            
            # In production, use PostHog's insights API:
            # url = f"https://app.posthog.com/api/projects/{self.project_id}/insights/trend"
            # This would query for unique users who triggered any event
            
            return []
        
        except Exception as e:
            logger.error(f"Error fetching active users: {e}")
            raise
    
    def _handle_rate_limit(self, retry_after: int = 1):
        """
        Handle rate limiting with exponential backoff.
        
        Args:
            retry_after: Seconds to wait before retry
        """
        wait_time = min(retry_after * 2, 60)  # Max 60 seconds
        logger.warning(f"Rate limited. Waiting {wait_time} seconds...")
        time.sleep(wait_time)
    
    def close(self):
        """Close the PostHog client connection."""
        if self.client:
            self.client.shutdown()
            logger.info("PostHog client closed")
