"""
Stripe API client for fetching customers, subscriptions, invoices, and MRR data.
"""
from typing import List, Dict, Optional
import logging
import stripe

logger = logging.getLogger(__name__)


class StripeClient:
    """Client for interacting with Stripe API."""
    
    def __init__(self, api_key: str):
        """
        Initialize Stripe client.
        
        Args:
            api_key: Stripe API secret key (use test key for development)
        """
        if not api_key:
            raise ValueError("Stripe API key is required")
        
        stripe.api_key = api_key
        self.api_key = api_key
        logger.info("Stripe client initialized")
    
    def get_customers(self, limit: int = 100) -> List[stripe.Customer]:
        """
        Fetch customers with automatic pagination.
        
        Args:
            limit: Maximum number of customers to return
            
        Returns:
            List of Stripe Customer objects
        """
        try:
            logger.info(f"Fetching up to {limit} customers from Stripe")
            customers = []
            
            # Stripe's list() method handles pagination automatically
            for customer in stripe.Customer.list(limit=limit).auto_paging_iter():
                customers.append(customer)
                if len(customers) >= limit:
                    break
            
            logger.info(f"Fetched {len(customers)} customers")
            return customers
        
        except stripe.error.StripeError as e:
            logger.error(f"Stripe API error fetching customers: {e}")
            raise
        except Exception as e:
            logger.error(f"Error fetching customers: {e}")
            raise
    
    def get_subscriptions(self, customer_id: Optional[str] = None) -> List[stripe.Subscription]:
        """
        Fetch subscriptions, optionally filtered by customer.
        
        Args:
            customer_id: Optional customer ID to filter subscriptions
            
        Returns:
            List of Stripe Subscription objects
        """
        try:
            params = {}
            if customer_id:
                params['customer'] = customer_id
                logger.info(f"Fetching subscriptions for customer {customer_id}")
            else:
                logger.info("Fetching all subscriptions")
            
            subscriptions = []
            for subscription in stripe.Subscription.list(**params).auto_paging_iter():
                subscriptions.append(subscription)
            
            logger.info(f"Fetched {len(subscriptions)} subscriptions")
            return subscriptions
        
        except stripe.error.StripeError as e:
            logger.error(f"Stripe API error fetching subscriptions: {e}")
            raise
        except Exception as e:
            logger.error(f"Error fetching subscriptions: {e}")
            raise
    
    def get_usage_records(self, subscription_item_id: str) -> List[Dict]:
        """
        Get usage records for metered billing.
        
        Args:
            subscription_item_id: The subscription item ID with metered usage
            
        Returns:
            List of usage record summaries
        """
        try:
            logger.info(f"Fetching usage records for subscription item {subscription_item_id}")
            
            # Fetch usage record summaries
            usage_records = stripe.SubscriptionItem.list_usage_record_summaries(
                subscription_item_id,
                limit=100
            )
            
            records = [record.to_dict() for record in usage_records.auto_paging_iter()]
            logger.info(f"Fetched {len(records)} usage records")
            return records
        
        except stripe.error.StripeError as e:
            logger.error(f"Stripe API error fetching usage records: {e}")
            raise
        except Exception as e:
            logger.error(f"Error fetching usage records: {e}")
            raise
    
    def get_mrr(self) -> float:
        """
        Calculate Monthly Recurring Revenue from all active subscriptions.
        
        Returns:
            Total MRR in dollars
        """
        try:
            logger.info("Calculating MRR from active subscriptions")
            mrr = 0.0
            
            # Get all active subscriptions
            subscriptions = stripe.Subscription.list(status='active').auto_paging_iter()
            
            for sub in subscriptions:
                # Sum up all subscription items
                for item in sub['items']['data']:
                    price = item['price']
                    quantity = item['quantity']
                    
                    # Convert amount to dollars (Stripe uses cents)
                    amount = price['unit_amount'] / 100.0 if price['unit_amount'] else 0
                    
                    # Normalize to monthly
                    if price['recurring']['interval'] == 'month':
                        monthly_amount = amount * quantity
                    elif price['recurring']['interval'] == 'year':
                        monthly_amount = (amount * quantity) / 12.0
                    elif price['recurring']['interval'] == 'week':
                        monthly_amount = (amount * quantity) * 4.33  # Average weeks per month
                    elif price['recurring']['interval'] == 'day':
                        monthly_amount = (amount * quantity) * 30
                    else:
                        monthly_amount = 0
                    
                    mrr += monthly_amount
            
            logger.info(f"Total MRR: ${mrr:,.2f}")
            return mrr
        
        except stripe.error.StripeError as e:
            logger.error(f"Stripe API error calculating MRR: {e}")
            raise
        except Exception as e:
            logger.error(f"Error calculating MRR: {e}")
            raise
    
    def get_invoices(
        self, 
        customer_id: Optional[str] = None, 
        limit: int = 100
    ) -> List[stripe.Invoice]:
        """
        Fetch invoices, optionally filtered by customer.
        
        Args:
            customer_id: Optional customer ID to filter invoices
            limit: Maximum number of invoices to return
            
        Returns:
            List of Stripe Invoice objects
        """
        try:
            params = {'limit': limit}
            if customer_id:
                params['customer'] = customer_id
                logger.info(f"Fetching invoices for customer {customer_id}")
            else:
                logger.info("Fetching all invoices")
            
            invoices = []
            for invoice in stripe.Invoice.list(**params).auto_paging_iter():
                invoices.append(invoice)
                if len(invoices) >= limit:
                    break
            
            logger.info(f"Fetched {len(invoices)} invoices")
            return invoices
        
        except stripe.error.StripeError as e:
            logger.error(f"Stripe API error fetching invoices: {e}")
            raise
        except Exception as e:
            logger.error(f"Error fetching invoices: {e}")
            raise
    
    def test_connection(self) -> bool:
        """
        Test the Stripe API connection.
        
        Returns:
            True if connection is successful, False otherwise
        """
        try:
            # Simple API call to verify credentials
            stripe.Account.retrieve()
            logger.info("Stripe connection test successful")
            return True
        except stripe.error.AuthenticationError:
            logger.error("Stripe authentication failed - invalid API key")
            return False
        except Exception as e:
            logger.error(f"Stripe connection test failed: {e}")
            return False
