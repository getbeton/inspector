"""
Apollo.io API client for contact enrichment and company domain search.
"""
from typing import List, Dict, Optional
import logging
import httpx

logger = logging.getLogger(__name__)


class ApolloClient:
    """Client for interacting with Apollo.io API."""
    
    BASE_URL = "https://api.apollo.io/v1"
    
    def __init__(self, api_key: str):
        """
        Initialize Apollo client.
        
        Args:
            api_key: Apollo.io API key
        """
        if not api_key:
            raise ValueError("Apollo API key is required")
        
        self.api_key = api_key
        self.headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache"
        }
        logger.info("Apollo client initialized")
    
    async def find_person_by_domain(
        self, 
        domain: str, 
        title_keywords: Optional[List[str]] = None
    ) -> List[Dict]:
        """
        Search for people at a company domain.
        
        Args:
            domain: Company domain (e.g., "example.com")
            title_keywords: Optional list of title keywords to filter (e.g., ["CTO", "VP"])
            
        Returns:
            List of contact dictionaries
        """
        try:
            logger.info(f"Searching for contacts at domain: {domain}")
            
            payload = {
                "api_key": self.api_key,
                "q_organization_domains": domain,
                "page": 1,
                "per_page": 10
            }
            
            if title_keywords:
                payload["person_titles"] = title_keywords
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.BASE_URL}/mixed_people/search",
                    json=payload,
                    headers=self.headers
                )
                response.raise_for_status()
                
                data = response.json()
                contacts = data.get("people", [])
                logger.info(f"Found {len(contacts)} contacts at {domain}")
                return contacts
        
        except httpx.HTTPStatusError as e:
            logger.error(f"Apollo API HTTP error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Error searching Apollo for domain {domain}: {e}")
            raise
    
    async def enrich_contact(self, email: str) -> Dict:
        """
        Enrich a contact with additional data by email.
        
        Args:
            email: Contact email address
            
        Returns:
            Enriched contact dictionary with additional fields
        """
        try:
            logger.info(f"Enriching contact: {email}")
            
            payload = {
                "api_key": self.api_key,
                "email": email
            }
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.BASE_URL}/people/match",
                    json=payload,
                    headers=self.headers
                )
                response.raise_for_status()
                
                data = response.json()
                person = data.get("person", {})
                logger.info(f"Successfully enriched contact: {email}")
                return person
        
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.warning(f"Contact not found in Apollo: {email}")
                return {}
            logger.error(f"Apollo API HTTP error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Error enriching contact {email}: {e}")
            raise
    
    async def test_connection(self) -> bool:
        """
        Test the Apollo API connection.
        
        Returns:
            True if connection is successful, False otherwise
        """
        try:
            # Simple API call to verify credentials
            payload = {
                "api_key": self.api_key,
                "q_organization_domains": "example.com",
                "page": 1,
                "per_page": 1
            }
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{self.BASE_URL}/mixed_people/search",
                    json=payload,
                    headers=self.headers
                )
                response.raise_for_status()
                logger.info("Apollo connection test successful")
                return True
        
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                logger.error("Apollo authentication failed - invalid API key")
            else:
                logger.error(f"Apollo connection test failed: {e.response.status_code}")
            return False
        except Exception as e:
            logger.error(f"Apollo connection test failed: {e}")
            return False
