from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_, or_
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from app.models import Account, Opportunity, Signal, User, AccountStatus
from app.heuristics.models import MetricSnapshot, HeuristicScore, AccountCluster

class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def get_north_star_metrics(self, filters: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Calculate North Star metrics: Expansion Pipeline, NRR, Total ARR.
        """
        filters = filters or {}
        
        # 1. Expansion Pipeline ($)
        # Sum of value for open opportunities
        pipeline_query = self.db.query(func.sum(Opportunity.value)).filter(
            Opportunity.stage != 'closed_lost',
            Opportunity.stage != 'closed_won'
        )
        expansion_pipeline = pipeline_query.scalar() or 0.0

        # 2. Total ARR ($)
        # Sum of ARR for active accounts
        arr_query = self.db.query(func.sum(Account.arr)).filter(
            Account.status == AccountStatus.ACTIVE
        )
        total_arr = arr_query.scalar() or 0.0

        # 3. NRR (Net Revenue Retention) (%)
        # Simplified calculation for now: (Current ARR / ARR 30 days ago) * 100
        # In a real system, we'd need historical ARR snapshots. 
        # For now, we'll estimate using current ARR and recent churn/expansion.
        
        # Get expansion in last 30 days
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        
        expansion_signals = self.db.query(func.sum(Signal.value)).filter(
            Signal.type == 'upgrade',
            Signal.timestamp >= thirty_days_ago
        ).scalar() or 0.0
        
        churned_arr = self.db.query(func.sum(Account.arr)).filter(
            Account.status == AccountStatus.CHURNED,
            Account.updated_at >= thirty_days_ago
        ).scalar() or 0.0
        
        # Estimate starting ARR (Current - Expansion + Churn)
        starting_arr = total_arr - expansion_signals + churned_arr
        
        if starting_arr > 0:
            nrr = ((total_arr) / starting_arr) * 100
        else:
            nrr = 100.0 # Default if no history

        return {
            "expansion_pipeline": expansion_pipeline,
            "total_arr": total_arr,
            "nrr": nrr
        }

    def get_growth_velocity_metrics(self, filters: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Calculate Growth Velocity metrics with MoM comparisons.
        """
        filters = filters or {}
        now = datetime.utcnow()
        thirty_days_ago = now - timedelta(days=30)
        sixty_days_ago = now - timedelta(days=60)
        
        def get_count_in_period(model, date_field, start, end, extra_filter=None):
            query = self.db.query(func.count(model.id)).filter(
                getattr(model, date_field) >= start,
                getattr(model, date_field) < end
            )
            # SQLAlchemy filter expressions cannot be evaluated as booleans.
            # We only apply the extra filter when it was explicitly provided.
            if extra_filter is not None:
                query = query.filter(extra_filter)
            return query.scalar() or 0

        # 1. New Leads (New Accounts)
        new_leads_current = get_count_in_period(Account, 'created_at', thirty_days_ago, now)
        new_leads_prev = get_count_in_period(Account, 'created_at', sixty_days_ago, thirty_days_ago)
        
        # 2. Active Signups (Accounts with active users)
        # Approximation: Accounts created recently that are active
        active_signups_current = get_count_in_period(
            Account, 'created_at', thirty_days_ago, now, 
            Account.status == AccountStatus.ACTIVE
        )
        active_signups_prev = get_count_in_period(
            Account, 'created_at', sixty_days_ago, thirty_days_ago, 
            Account.status == AccountStatus.ACTIVE
        )

        # 3. Paying Customers (ARR > 0)
        # This is a snapshot, so "New Paying Customers" is better for velocity
        paying_current = get_count_in_period(
            Account, 'created_at', thirty_days_ago, now, 
            Account.arr > 0
        )
        paying_prev = get_count_in_period(
            Account, 'created_at', sixty_days_ago, thirty_days_ago, 
            Account.arr > 0
        )

        # 4. Expanded Customers
        expanded_current = self.db.query(func.count(func.distinct(Signal.account_id))).filter(
            Signal.type == 'upgrade',
            Signal.timestamp >= thirty_days_ago,
            Signal.timestamp < now
        ).scalar() or 0
        
        expanded_prev = self.db.query(func.count(func.distinct(Signal.account_id))).filter(
            Signal.type == 'upgrade',
            Signal.timestamp >= sixty_days_ago,
            Signal.timestamp < thirty_days_ago
        ).scalar() or 0

        return {
            "new_leads": {
                "current": new_leads_current,
                "previous": new_leads_prev,
                "delta": self._calculate_delta(new_leads_current, new_leads_prev)
            },
            "active_signups": {
                "current": active_signups_current,
                "previous": active_signups_prev,
                "delta": self._calculate_delta(active_signups_current, active_signups_prev)
            },
            "paying_customers": {
                "current": paying_current,
                "previous": paying_prev,
                "delta": self._calculate_delta(paying_current, paying_prev)
            },
            "expanded_customers": {
                "current": expanded_current,
                "previous": expanded_prev,
                "delta": self._calculate_delta(expanded_current, expanded_prev)
            }
        }

    def get_momentum_data(self, filters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """
        Get data for the Momentum Table.
        """
        filters = filters or {}
        
        # Base query
        query = self.db.query(Account).filter(Account.status == AccountStatus.ACTIVE)
        
        # Apply segment filters if any
        if filters.get('segment') and filters['segment'] != 'All':
            # Placeholder for segment logic (e.g., based on ARR or Plan)
            if filters['segment'] == 'Enterprise':
                query = query.filter(Account.arr >= 50000)
            elif filters['segment'] == 'SMB':
                query = query.filter(Account.arr < 50000)

        accounts = query.all()
        results = []
        
        for acc in accounts:
            # Get latest health score
            health_score = acc.health_score
            
            # Get top signal
            top_signal = self.db.query(Signal).filter(
                Signal.account_id == acc.id
            ).order_by(desc(Signal.value)).first() # Assuming value correlates with weight/importance
            
            top_signal_name = top_signal.type if top_signal else "None"
            
            # Calculate Momentum (MoM ARR Growth) - Simplified
            # In real app, compare current ARR with snapshot from 30 days ago
            momentum = 0.0 # Placeholder
            
            results.append({
                "account_id": acc.id,
                "account_name": acc.name,
                "health_score": health_score,
                "arr": acc.arr,
                "momentum": momentum,
                "top_signal": top_signal_name,
                "last_active": acc.last_activity_at.isoformat() if acc.last_activity_at else None
            })
            
        return results

    def _calculate_delta(self, current: float, previous: float) -> float:
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return ((current - previous) / previous) * 100.0
