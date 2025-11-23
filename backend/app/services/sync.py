"""
Sync service for orchestrating data ingestion from external sources.
Transforms PostHog events and Stripe data into Signal records.
"""
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import logging

from app.models import Signal, Account
from app.integrations.posthog import PostHogClient
from app.integrations.stripe import StripeClient

logger = logging.getLogger(__name__)


class SyncService:
    """Service for syncing data from external integrations into the database."""
    
    def __init__(
        self, 
        db: Session, 
        posthog_client: Optional[PostHogClient] = None,
        stripe_client: Optional[StripeClient] = None
    ):
        """
        Initialize sync service.
        
        Args:
            db: SQLAlchemy database session
            posthog_client: Optional PostHog client for event syncing
            stripe_client: Optional Stripe client for revenue syncing
        """
        self.db = db
        self.posthog_client = posthog_client
        self.stripe_client = stripe_client
        logger.info("SyncService initialized")
    
    def sync_all(self) -> Dict:
        """
        Run all sync operations.
        
        Returns:
            Dictionary with sync summary statistics
        """
        logger.info("Starting full data sync")
        results = {
            "started_at": datetime.utcnow().isoformat(),
            "posthog": {},
            "stripe": {},
            "errors": []
        }
        
        # Sync PostHog events
        if self.posthog_client:
            try:
                results["posthog"] = self.sync_posthog_events()
            except Exception as e:
                error_msg = f"PostHog sync failed: {str(e)}"
                logger.error(error_msg)
                results["errors"].append(error_msg)
        else:
            logger.warning("PostHog client not configured, skipping sync")
        
        # Sync Stripe revenue
        if self.stripe_client:
            try:
                results["stripe"] = self.sync_stripe_revenue()
            except Exception as e:
                error_msg = f"Stripe sync failed: {str(e)}"
                logger.error(error_msg)
                results["errors"].append(error_msg)
        else:
            logger.warning("Stripe client not configured, skipping sync")
        
        results["completed_at"] = datetime.utcnow().isoformat()
        logger.info(f"Sync completed: {results}")
        return results
    
    def sync_posthog_events(self) -> Dict:
        """
        Fetch PostHog events and transform to Signals.
        
        Returns:
            Dictionary with sync statistics
        """
        logger.info("Syncing PostHog events")
        
        # Fetch events from last 30 days
        start_date = datetime.utcnow() - timedelta(days=30)
        events = self.posthog_client.get_events(start_date=start_date)
        
        signals_created = 0
        signals_skipped = 0
        
        for event in events:
            try:
                # Map event to account (simplified - in production, you'd have proper mapping)
                account = self._get_or_create_account_from_event(event)
                
                if not account:
                    signals_skipped += 1
                    continue
                
                # Check if signal already exists (deduplication)
                event_id = event.get("id") or event.get("uuid")
                if event_id and self._signal_exists(event_id, "posthog"):
                    signals_skipped += 1
                    continue
                
                # Transform event to signal
                signal = self._transform_posthog_to_signal(event, account.id)
                
                if signal:
                    self.db.add(signal)
                    signals_created += 1
            
            except Exception as e:
                logger.error(f"Error processing PostHog event: {e}")
                continue
        
        self.db.commit()
        
        result = {
            "events_processed": len(events),
            "signals_created": signals_created,
            "signals_skipped": signals_skipped
        }
        logger.info(f"PostHog sync result: {result}")
        return result
    
    def sync_stripe_revenue(self) -> Dict:
        """
        Fetch Stripe data and transform to Signals.
        
        Returns:
            Dictionary with sync statistics
        """
        logger.info("Syncing Stripe revenue data")
        
        signals_created = 0
        signals_skipped = 0
        
        # Fetch subscriptions
        subscriptions = self.stripe_client.get_subscriptions()
        
        for sub in subscriptions:
            try:
                # Map subscription to account
                account = self._get_or_create_account_from_stripe(sub)
                
                if not account:
                    signals_skipped += 1
                    continue
                
                # Check if signal already exists
                if self._signal_exists(sub.id, "stripe"):
                    signals_skipped += 1
                    continue
                
                # Transform subscription to signal
                signal = self._transform_stripe_to_signal(sub, account.id)
                
                if signal:
                    self.db.add(signal)
                    signals_created += 1
            
            except Exception as e:
                logger.error(f"Error processing Stripe subscription: {e}")
                continue
        
        self.db.commit()
        
        result = {
            "subscriptions_processed": len(subscriptions),
            "signals_created": signals_created,
            "signals_skipped": signals_skipped
        }
        logger.info(f"Stripe sync result: {result}")
        return result
    
    def _transform_posthog_to_signal(self, event: Dict, account_id: int) -> Optional[Signal]:
        """
        Transform a PostHog event into a Signal.
        
        Args:
            event: PostHog event dictionary
            account_id: Account ID to associate signal with
            
        Returns:
            Signal object or None if transformation fails
        """
        try:
            event_name = event.get("event", "unknown")
            properties = event.get("properties", {})
            
            # Determine signal type based on event
            signal_type = self._map_posthog_event_to_signal_type(event_name)
            
            # Extract value if available
            value = properties.get("value", 0.0)
            
            # Create signal
            signal = Signal(
                account_id=account_id,
                type=signal_type,
                value=float(value),
                details={
                    "event_name": event_name,
                    "properties": properties,
                    "distinct_id": event.get("distinct_id"),
                    "event_id": event.get("id") or event.get("uuid")
                },
                timestamp=datetime.fromisoformat(event.get("timestamp")) if event.get("timestamp") else datetime.utcnow(),
                source="posthog"
            )
            
            return signal
        
        except Exception as e:
            logger.error(f"Error transforming PostHog event to signal: {e}")
            return None
    
    def _transform_stripe_to_signal(self, subscription: any, account_id: int) -> Optional[Signal]:
        """
        Transform Stripe subscription data into a Signal.
        
        Args:
            subscription: Stripe Subscription object
            account_id: Account ID to associate signal with
            
        Returns:
            Signal object or None if transformation fails
        """
        try:
            # Determine signal type based on subscription status
            status = subscription.get("status")
            
            if status == "active":
                signal_type = "subscription_active"
            elif status == "canceled":
                signal_type = "subscription_canceled"
            elif status == "trialing":
                signal_type = "trial_started"
            else:
                signal_type = "subscription_updated"
            
            # Calculate subscription value (MRR for this subscription)
            value = 0.0
            for item in subscription.get("items", {}).get("data", []):
                price = item.get("price", {})
                quantity = item.get("quantity", 1)
                amount = price.get("unit_amount", 0) / 100.0
                
                # Normalize to monthly
                if price.get("recurring", {}).get("interval") == "month":
                    value += amount * quantity
                elif price.get("recurring", {}).get("interval") == "year":
                    value += (amount * quantity) / 12.0
            
            # Create signal
            signal = Signal(
                account_id=account_id,
                type=signal_type,
                value=value,
                details={
                    "subscription_id": subscription.get("id"),
                    "status": status,
                    "customer_id": subscription.get("customer"),
                    "plan": subscription.get("items", {}).get("data", [{}])[0].get("price", {}).get("nickname", "unknown"),
                    "billing_interval": subscription.get("items", {}).get("data", [{}])[0].get("price", {}).get("recurring", {}).get("interval")
                },
                timestamp=datetime.fromtimestamp(subscription.get("created")) if subscription.get("created") else datetime.utcnow(),
                source="stripe"
            )
            
            return signal
        
        except Exception as e:
            logger.error(f"Error transforming Stripe subscription to signal: {e}")
            return None
    
    def _map_posthog_event_to_signal_type(self, event_name: str) -> str:
        """
        Map PostHog event names to signal types.
        
        Args:
            event_name: PostHog event name
            
        Returns:
            Signal type string
        """
        # Simple mapping - extend based on your PostHog events
        event_mapping = {
            "user_login": "user_activity",
            "feature_used": "feature_usage",
            "api_call": "api_usage",
            "pageview": "engagement",
            "signup": "user_signup",
        }
        
        return event_mapping.get(event_name.lower(), "usage_spike")
    
    def _get_or_create_account_from_event(self, event: Dict) -> Optional[Account]:
        """
        Get or create an Account based on PostHog event data.
        
        Args:
            event: PostHog event dictionary
            
        Returns:
            Account object or None
        """
        # In production, you'd extract domain/account info from event properties
        # For now, return the first account or create a default one
        account = self.db.query(Account).first()
        
        if not account:
            # Create a default account for testing
            account = Account(
                name="Default Account",
                domain="example.com",
                plan="free",
                status="active"
            )
            self.db.add(account)
            self.db.commit()
        
        return account
    
    def _get_or_create_account_from_stripe(self, subscription: any) -> Optional[Account]:
        """
        Get or create an Account based on Stripe subscription data.
        
        Args:
            subscription: Stripe Subscription object
            
        Returns:
            Account object or None
        """
        customer_id = subscription.get("customer")
        
        if not customer_id:
            return None
        
        # Try to find account by Stripe customer ID in details
        # In production, you'd have a proper mapping table
        account = self.db.query(Account).first()
        
        if not account:
            account = Account(
                name=f"Customer {customer_id}",
                domain="stripe-customer.com",
                plan="paid",
                status="active"
            )
            self.db.add(account)
            self.db.commit()
        
        return account
    
    def _signal_exists(self, external_id: str, source: str) -> bool:
        """
        Check if a signal already exists for deduplication.
        
        Args:
            external_id: External ID from the source system
            source: Source system name ("posthog" or "stripe")
            
        Returns:
            True if signal exists, False otherwise
        """
        # Check if we already have a signal with this external ID
        existing = self.db.query(Signal).filter(
            Signal.source == source,
            Signal.details.contains({"event_id": external_id})
        ).first()
        
        return existing is not None
