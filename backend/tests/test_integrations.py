"""
Integration tests for PostHog, Stripe, and Apollo clients.
These tests require valid API keys to be set in environment variables.
"""
import pytest
import os
from datetime import datetime, timedelta

from app.integrations.posthog import PostHogClient
from app.integrations.stripe import StripeClient
from app.integrations.apollo import ApolloClient
from app.services.sync import SyncService
from app.models import Account, Signal


# Skip tests if API keys are not set
POSTHOG_API_KEY = os.getenv("POSTHOG_API_KEY", "")
POSTHOG_PROJECT_ID = os.getenv("POSTHOG_PROJECT_ID", "")
STRIPE_API_KEY = os.getenv("STRIPE_API_KEY", "")
APOLLO_API_KEY = os.getenv("APOLLO_API_KEY", "")

skip_posthog = pytest.mark.skipif(
    not POSTHOG_API_KEY or not POSTHOG_PROJECT_ID,
    reason="POSTHOG_API_KEY and POSTHOG_PROJECT_ID not set"
)
skip_stripe = pytest.mark.skipif(
    not STRIPE_API_KEY,
    reason="STRIPE_API_KEY not set"
)
skip_apollo = pytest.mark.skipif(
    not APOLLO_API_KEY,
    reason="APOLLO_API_KEY not set"
)


class TestPostHogClient:
    """Tests for PostHog API client."""
    
    @skip_posthog
    def test_posthog_initialization(self):
        """Test PostHog client can be initialized."""
        client = PostHogClient(
            api_key=POSTHOG_API_KEY,
            project_id=POSTHOG_PROJECT_ID
        )
        assert client is not None
        assert client.api_key == POSTHOG_API_KEY
        assert client.project_id == POSTHOG_PROJECT_ID
    
    def test_posthog_requires_credentials(self):
        """Test PostHog client raises error without credentials."""
        with pytest.raises(ValueError):
            PostHogClient(api_key="", project_id="")
    
    @skip_posthog
    def test_get_events(self):
        """Test fetching events from PostHog."""
        client = PostHogClient(
            api_key=POSTHOG_API_KEY,
            project_id=POSTHOG_PROJECT_ID
        )
        
        # Fetch events from last 7 days
        start_date = datetime.utcnow() - timedelta(days=7)
        events = client.get_events(start_date=start_date)
        
        # Should return a list (may be empty)
        assert isinstance(events, list)
    
    @skip_posthog
    def test_get_user_properties(self):
        """Test fetching user properties."""
        client = PostHogClient(
            api_key=POSTHOG_API_KEY,
            project_id=POSTHOG_PROJECT_ID
        )
        
        user_props = client.get_user_properties("test-user")
        assert isinstance(user_props, dict)
    
    @skip_posthog
    def test_get_active_users(self):
        """Test fetching active users."""
        client = PostHogClient(
            api_key=POSTHOG_API_KEY,
            project_id=POSTHOG_PROJECT_ID
        )
        
        active_users = client.get_active_users(days=30)
        assert isinstance(active_users, list)


class TestStripeClient:
    """Tests for Stripe API client."""
    
    @skip_stripe
    def test_stripe_initialization(self):
        """Test Stripe client can be initialized."""
        client = StripeClient(api_key=STRIPE_API_KEY)
        assert client is not None
        assert client.api_key == STRIPE_API_KEY
    
    def test_stripe_requires_api_key(self):
        """Test Stripe client raises error without API key."""
        with pytest.raises(ValueError):
            StripeClient(api_key="")
    
    @skip_stripe
    def test_stripe_connection(self):
        """Test Stripe connection."""
        client = StripeClient(api_key=STRIPE_API_KEY)
        connected = client.test_connection()
        assert connected is True
    
    @skip_stripe
    def test_get_customers(self):
        """Test fetching customers from Stripe."""
        client = StripeClient(api_key=STRIPE_API_KEY)
        customers = client.get_customers(limit=10)
        
        assert isinstance(customers, list)
        # May be empty if no test customers exist
    
    @skip_stripe
    def test_get_subscriptions(self):
        """Test fetching subscriptions from Stripe."""
        client = StripeClient(api_key=STRIPE_API_KEY)
        subscriptions = client.get_subscriptions()
        
        assert isinstance(subscriptions, list)
    
    @skip_stripe
    def test_get_mrr(self):
        """Test calculating MRR from Stripe."""
        client = StripeClient(api_key=STRIPE_API_KEY)
        mrr = client.get_mrr()
        
        assert isinstance(mrr, float)
        assert mrr >= 0.0
    
    @skip_stripe
    def test_get_invoices(self):
        """Test fetching invoices from Stripe."""
        client = StripeClient(api_key=STRIPE_API_KEY)
        invoices = client.get_invoices(limit=10)
        
        assert isinstance(invoices, list)


class TestApolloClient:
    """Tests for Apollo.io API client."""
    
    @skip_apollo
    def test_apollo_initialization(self):
        """Test Apollo client can be initialized."""
        client = ApolloClient(api_key=APOLLO_API_KEY)
        assert client is not None
        assert client.api_key == APOLLO_API_KEY
    
    def test_apollo_requires_api_key(self):
        """Test Apollo client raises error without API key."""
        with pytest.raises(ValueError):
            ApolloClient(api_key="")
    
    @skip_apollo
    @pytest.mark.asyncio
    async def test_apollo_connection(self):
        """Test Apollo connection."""
        client = ApolloClient(api_key=APOLLO_API_KEY)
        connected = await client.test_connection()
        assert connected is True
    
    @skip_apollo
    @pytest.mark.asyncio
    async def test_find_person_by_domain(self):
        """Test searching for contacts by domain."""
        client = ApolloClient(api_key=APOLLO_API_KEY)
        
        # Search for contacts at a known domain
        contacts = await client.find_person_by_domain("apollo.io")
        
        assert isinstance(contacts, list)
        # May be empty depending on API limits
    
    @skip_apollo
    @pytest.mark.asyncio
    async def test_enrich_contact(self):
        """Test enriching a contact by email."""
        client = ApolloClient(api_key=APOLLO_API_KEY)
        
        # Try to enrich a test email
        # This may return empty dict if not found
        result = await client.enrich_contact("test@apollo.io")
        
        assert isinstance(result, dict)


class TestSyncService:
    """Tests for sync service."""
    
    def test_sync_service_initialization(self, db_session):
        """Test sync service can be initialized."""
        service = SyncService(db=db_session)
        assert service is not None
        assert service.db == db_session
    
    def test_transform_posthog_to_signal(self, db_session, sample_posthog_event):
        """Test transforming PostHog event to Signal."""
        # Create a test account
        account = Account(
            name="Test Account",
            domain="test.com",
            plan="pro",
            status="active"
        )
        db_session.add(account)
        db_session.commit()
        
        service = SyncService(db=db_session)
        signal = service._transform_posthog_to_signal(sample_posthog_event, account.id)
        
        assert signal is not None
        assert signal.account_id == account.id
        assert signal.source == "posthog"
        assert signal.type == "user_activity"
        assert signal.value == 100.0
    
    def test_transform_stripe_to_signal(self, db_session, sample_stripe_subscription):
        """Test transforming Stripe subscription to Signal."""
        # Create a test account
        account = Account(
            name="Test Account",
            domain="test.com",
            plan="pro",
            status="active"
        )
        db_session.add(account)
        db_session.commit()
        
        service = SyncService(db=db_session)
        signal = service._transform_stripe_to_signal(sample_stripe_subscription, account.id)
        
        assert signal is not None
        assert signal.account_id == account.id
        assert signal.source == "stripe"
        assert signal.type == "subscription_active"
        assert signal.value == 99.0  # $99/month
    
    @skip_posthog
    @skip_stripe
    def test_full_sync(self, db_session):
        """Test full sync with real API clients."""
        # Initialize clients
        posthog_client = PostHogClient(
            api_key=POSTHOG_API_KEY,
            project_id=POSTHOG_PROJECT_ID
        )
        stripe_client = StripeClient(api_key=STRIPE_API_KEY)
        
        # Create sync service
        service = SyncService(
            db=db_session,
            posthog_client=posthog_client,
            stripe_client=stripe_client
        )
        
        # Run sync
        results = service.sync_all()
        
        assert "posthog" in results
        assert "stripe" in results
        assert "started_at" in results
        assert "completed_at" in results
