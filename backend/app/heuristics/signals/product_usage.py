"""
Product usage signal detectors - Phase 1 (20 signals).
These are high-impact signals based on user behavior and product engagement.
"""
from typing import Optional
from datetime import datetime, timedelta
from sqlalchemy import func

from app.models import Signal, Account, User
from .base import BaseSignalDetector
from ..utils import calculate_percentage_change, is_director_level


class UsageSpikeDetector(BaseSignalDetector):
    """Detect significant increase in product usage."""
    signal_name = "usage_spike"
    signal_category = "expansion"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Detect usage spike (>20% increase over time window)."""
        if self.signal_exists(account_id):
            return None
        
        time_window_days = self.signal_config.get('time_window_days', 14)
        threshold = self.signal_config.get('threshold', 0.20)
        
        # Get usage metrics from metric_snapshots
        # For MVP, we'll use signal count as proxy for usage
        current_period_start = datetime.utcnow() - timedelta(days=time_window_days)
        previous_period_start = current_period_start - timedelta(days=time_window_days)
        
        current_usage = self.db.query(func.count(Signal.id)).filter(
            Signal.account_id == account_id,
            Signal.timestamp >= current_period_start
        ).scalar() or 0
        
        previous_usage = self.db.query(func.count(Signal.id)).filter(
            Signal.account_id == account_id,
            Signal.timestamp >= previous_period_start,
            Signal.timestamp < current_period_start
        ).scalar() or 1
        
        pct_change = calculate_percentage_change(previous_usage, current_usage)
        
        if pct_change >= threshold:
            return self.create_signal(
                account_id=account_id,
                value=pct_change,
                details={
                    'current_usage': current_usage,
                    'previous_usage': previous_usage,
                    'percentage_change': round(pct_change * 100, 1)
                }
            )
        
        return None


class UsageDropDetector(BaseSignalDetector):
    """Detect significant decrease in product usage."""
    signal_name = "usage_drop"
    signal_category = "churn_risk"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Detect usage drop (>20% decrease over time window)."""
        if self.signal_exists(account_id):
            return None
        
        time_window_days = self.signal_config.get('time_window_days', 14)
        threshold = self.signal_config.get('threshold', -0.20)
        
        current_period_start = datetime.utcnow() - timedelta(days=time_window_days)
        previous_period_start = current_period_start - timedelta(days=time_window_days)
        
        current_usage = self.db.query(func.count(Signal.id)).filter(
            Signal.account_id == account_id,
            Signal.timestamp >= current_period_start
        ).scalar() or 0
        
        previous_usage = self.db.query(func.count(Signal.id)).filter(
            Signal.account_id == account_id,
            Signal.timestamp >= previous_period_start,
            Signal.timestamp < current_period_start
        ).scalar() or 1
        
        pct_change = calculate_percentage_change(previous_usage, current_usage)
        
        if pct_change <= threshold:
            return self.create_signal(
                account_id=account_id,
                value=pct_change,
                details={
                    'current_usage': current_usage,
                    'previous_usage': previous_usage,
                    'percentage_change': round(pct_change * 100, 1)
                }
            )
        
        return None


class NearingPaywallDetector(BaseSignalDetector):
    """Detect account approaching usage/plan limits."""
    signal_name = "nearing_paywall"
    signal_category = "expansion"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Detect if account is at 80%+ of plan limit."""
        if self.signal_exists(account_id):
            return None
        
        # Stub implementation - would check actual usage against plan limits
        # For now, check if account has high user count on free plan
        account = self.get_account(account_id)
        if not account or account.plan != "free":
            return None
        
        user_count = self.db.query(func.count(User.id)).filter(
            User.account_id == account_id
        ).scalar() or 0
        
        # Free plan limit: 5 users
        plan_limit = 5
        utilization = user_count / plan_limit if plan_limit > 0 else 0
        threshold = self.signal_config.get('threshold', 0.80)
        
        if utilization >= threshold:
            return self.create_signal(
                account_id=account_id,
                value=utilization,
                details={
                    'user_count': user_count,
                    'plan_limit': plan_limit,
                    'utilization_pct': round(utilization * 100, 1)
                }
            )
        
        return None


class DirectorSignupDetector(BaseSignalDetector):
    """Detect when a director-level or above user signs up."""
    signal_name = "director_signup"
    signal_category = "expansion"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check for recent director+ signups."""
        if self.signal_exists(account_id, lookback_days=7):
            return None
        
        # Check for recent users with director-level titles
        recent_cutoff = datetime.utcnow() - timedelta(days=7)
        
        director_user = self.db.query(User).filter(
            User.account_id == account_id,
            User.created_at >= recent_cutoff
        ).all()
        
        for user in director_user:
            if is_director_level(user.title):
                return self.create_signal(
                    account_id=account_id,
                    value=1.0,
                    details={
                        'user_name': user.name,
                        'user_email': user.email,
                        'title': user.title
                    }
                )
        
        return None


class InvitesSentDetector(BaseSignalDetector):
    """Detect high invite activity indicating internal adoption."""
    signal_name = "invites_sent"
    signal_category = "expansion"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check if account sent 5+ invites in last 30 days."""
        if self.signal_exists(account_id, lookback_days=7):
            return None
        
        time_window_days = self.signal_config.get('time_window_days', 30)
        threshold = self.signal_config.get('threshold', 5)
        
        # Count user_invite signals from PostHog events
        cutoff = datetime.utcnow() - timedelta(days=time_window_days)
        
        invite_count = self.db.query(func.count(Signal.id)).filter(
            Signal.account_id == account_id,
            Signal.type == "user_invite",
            Signal.timestamp >= cutoff
        ).scalar() or 0
        
        if invite_count >= threshold:
            return self.create_signal(
                account_id=account_id,
                value=invite_count,
                details={
                    'invite_count': invite_count,
                    'time_window_days': time_window_days
                }
            )
        
        return None


class NewDepartmentUserDetector(BaseSignalDetector):
    """Detect first user from a new department."""
    signal_name = "new_department_user"
    signal_category = "expansion"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check for users from previously unseen departments."""
        if self.signal_exists(account_id, lookback_days=7):
            return None
        
        # Get all users for account
        all_users = self.db.query(User).filter(
            User.account_id == account_id
        ).order_by(User.created_at).all()
        
        if len(all_users) < 2:
            return None
        
        # Extract departments from titles (stub - would use actual department field)
        seen_departments = set()
        recent_cutoff = datetime.utcnow() - timedelta(days=7)
        
        for user in all_users:
            if user.created_at < recent_cutoff:
                # Build set of historical departments
                if user.title:
                    dept = user.title.split()[0]  # First word as proxy for department
                    seen_departments.add(dept.lower())
            else:
                # Check if recent user is from new department
                if user.title:
                    dept = user.title.split()[0]
                    if dept.lower() not in seen_departments:
                        return self.create_signal(
                            account_id=account_id,
                            value=1.0,
                            details={
                                'user_name': user.name,
                                'department': dept,
                                'total_departments': len(seen_departments) + 1
                            }
                        )
        
        return None


class HighNPSDetector(BaseSignalDetector):
    """Detect high NPS scores (promoters)."""
    signal_name = "high_nps"
    signal_category = "expansion"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check for NPS >= 9 in recent feedback."""
        if self.signal_exists(account_id, lookback_days=30):
            return None
        
        threshold = self.signal_config.get('threshold', 9)
        
        # Check for nps_response signals >= threshold
        recent_cutoff = datetime.utcnow() - timedelta(days=90)
        
        nps_signal = self.db.query(Signal).filter(
            Signal.account_id == account_id,
            Signal.type == "nps_response",
            Signal.value >= threshold,
            Signal.timestamp >= recent_cutoff
        ).order_by(Signal.timestamp.desc()).first()
        
        if nps_signal:
            return self.create_signal(
                account_id=account_id,
                value=nps_signal.value,
                details={
                    'nps_score': nps_signal.value,
                    'feedback_date': nps_signal.timestamp.isoformat()
                }
            )
        
        return None


class LowNPSDetector(BaseSignalDetector):
    """Detect low NPS scores (detractors)."""
    signal_name = "low_nps"
    signal_category = "churn_risk"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check for NPS <= 6 in recent feedback."""
        if self.signal_exists(account_id, lookback_days=30):
            return None
        
        threshold = self.signal_config.get('threshold', 6)
        time_window_days = self.signal_config.get('time_window_days', 90)
        
        recent_cutoff = datetime.utcnow() - timedelta(days=time_window_days)
        
        nps_signal = self.db.query(Signal).filter(
            Signal.account_id == account_id,
            Signal.type == "nps_response",
            Signal.value <= threshold,
            Signal.timestamp >= recent_cutoff
        ).order_by(Signal.timestamp.desc()).first()
        
        if nps_signal:
            return self.create_signal(
                account_id=account_id,
                value=nps_signal.value,
                details={
                    'nps_score': nps_signal.value,
                    'feedback_date': nps_signal.timestamp.isoformat()
                }
            )
        
        return None


class InactivityDetector(BaseSignalDetector):
    """Detect accounts with no activity for >60 days."""
    signal_name = "inactivity"
    signal_category = "churn_risk"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check if account has been inactive for threshold days."""
        if self.signal_exists(account_id, lookback_days=7):
            return None
        
        threshold_days = self.signal_config.get('threshold_days', 60)
        account = self.get_account(account_id)
        
        if not account or not account.last_activity_at:
            return None
        
        days_inactive = (datetime.utcnow() - account.last_activity_at).days
        
        if days_inactive >= threshold_days:
            return self.create_signal(
                account_id=account_id,
                value=days_inactive,
                details={
                    'days_inactive': days_inactive,
                    'last_activity': account.last_activity_at.isoformat()
                }
            )
        
        return None


class UsageWoWDeclineDetector(BaseSignalDetector):
    """Detect week-over-week usage decline."""
    signal_name = "usage_wow_decline"
    signal_category = "churn_risk"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check for >15% WoW usage decrease."""
        if self.signal_exists(account_id, lookback_days=7):
            return None
        
        threshold = self.signal_config.get('threshold', -0.15)
        
        # Compare last week to previous week
        this_week_start = datetime.utcnow() - timedelta(days=7)
        last_week_start = this_week_start - timedelta(days=7)
        
        this_week_usage = self.db.query(func.count(Signal.id)).filter(
            Signal.account_id == account_id,
            Signal.timestamp >= this_week_start
        ).scalar() or 0
        
        last_week_usage = self.db.query(func.count(Signal.id)).filter(
            Signal.account_id == account_id,
            Signal.timestamp >= last_week_start,
            Signal.timestamp < this_week_start
        ).scalar() or 1
        
        pct_change = calculate_percentage_change(last_week_usage, this_week_usage)
        
        if pct_change <= threshold:
            return self.create_signal(
                account_id=account_id,
                value=pct_change,
                details={
                    'this_week_usage': this_week_usage,
                    'last_week_usage': last_week_usage,
                    'wow_decline_pct': round(abs(pct_change) * 100, 1)
                }
            )
        
        return None


class TrialEndingDetector(BaseSignalDetector):
    """Detect trials expiring within 7 days."""
    signal_name = "trial_ending"
    signal_category = "expansion"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check if trial is ending soon."""
        if self.signal_exists(account_id, lookback_days=3):
            return None
        
        account = self.get_account(account_id)
        if not account or account.status != "trial":
            return None
        
        # Stub: would check actual trial end date from subscription data
        # For now, check if account has been in trial for >7 days (assuming 14-day trials)
        trial_length = (datetime.utcnow() - account.created_at).days
        trial_period = 14  # Default trial period
        days_remaining = trial_period - trial_length
        
        threshold_days = self.signal_config.get('threshold_days', 7)
        
        if 0 < days_remaining <= threshold_days:
            return self.create_signal(
                account_id=account_id,
                value=days_remaining,
                details={
                    'days_remaining': days_remaining,
                    'trial_end_date': (account.created_at + timedelta(days=trial_period)).isoformat()
                }
            )
        
        return None


class UpcomingRenewalDetector(BaseSignalDetector):
    """Detect contract renewals approaching."""
    signal_name = "upcoming_renewal"
    signal_category = "expansion"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check if renewal is within 60 days."""
        if self.signal_exists(account_id, lookback_days=14):
            return None
        
        account = self.get_account(account_id)
        if not account or account.plan == "free":
            return None
        
        # Stub: would check actual contract end date from Stripe
        # For now, assume annual contracts renewing 1 year from creation
        days_since_creation = (datetime.utcnow() - account.created_at).days
        contract_period = 365
        days_until_renewal = contract_period - (days_since_creation % contract_period)
        
        threshold_days = self.signal_config.get('threshold_days', 60)
        
        if days_until_renewal <= threshold_days:
            return self.create_signal(
                account_id=account_id,
                value=days_until_renewal,
                details={
                    'days_until_renewal': days_until_renewal,
                    'renewal_date': (datetime.utcnow() + timedelta(days=days_until_renewal)).isoformat()
                }
            )
        
        return None


class FreeDecisionMakerDetector(BaseSignalDetector):
    """Detect decision makers on free plan."""
    signal_name = "free_decision_maker"
    signal_category = "expansion"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check for director+ users on free plan."""
        if self.signal_exists(account_id, lookback_days=14):
            return None
        
        account = self.get_account(account_id)
        if not account or account.plan != "free":
            return None
        
        # Find director-level users
        users = self.db.query(User).filter(User.account_id == account_id).all()
        
        for user in users:
            if is_director_level(user.title):
                return self.create_signal(
                    account_id=account_id,
                    value=1.0,
                    details={
                        'user_name': user.name,
                        'title': user.title,
                        'plan': account.plan
                    }
                )
        
        return None


class UpgradePageVisitDetector(BaseSignalDetector):
    """Detect free users visiting pricing/upgrade pages."""
    signal_name = "upgrade_page_visit"
    signal_category = "expansion"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check for pricing page visits by free users."""
        if self.signal_exists(account_id, lookback_days=7):
            return None
        
        account = self.get_account(account_id)
        if not account or account.plan != "free":
            return None
        
        # Check for page_view signals with pricing/upgrade pages
        recent_cutoff = datetime.utcnow() - timedelta(days=7)
        page_patterns = self.signal_config.get('page_patterns', ['/pricing', '/upgrade', '/plans'])
        
        for pattern in page_patterns:
            page_view = self.db.query(Signal).filter(
                Signal.account_id == account_id,
                Signal.type == "page_view",
                Signal.timestamp >= recent_cutoff
            ).first()
            
            if page_view and page_view.details.get('page', '').startswith(pattern):
                return self.create_signal(
                    account_id=account_id,
                    value=1.0,
                    details={
                        'page': page_view.details.get('page'),
                        'visit_date': page_view.timestamp.isoformat()
                    }
                )
        
        return None


class ApproachingSeatLimitDetector(BaseSignalDetector):
    """Detect accounts at 85%+ seat utilization."""
    signal_name = "approaching_seat_limit"
    signal_category = "expansion"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check if seat utilization >= 85%."""
        if self.signal_exists(account_id, lookback_days=7):
            return None
        
        account = self.get_account(account_id)
        if not account or account.plan == "free":
            return None
        
        # Count active users
        user_count = self.db.query(func.count(User.id)).filter(
            User.account_id == account_id
        ).scalar() or 0
        
        # Stub: seat limits by plan
        seat_limits = {
            "starter": 10,
            "pro": 25,
            "enterprise": 100
        }
        seat_limit = seat_limits.get(account.plan, 10)
        
        utilization = user_count / seat_limit if seat_limit > 0 else 0
        threshold = self.signal_config.get('threshold', 0.85)
        
        if utilization >= threshold:
            return self.create_signal(
                account_id=account_id,
                value=utilization,
                details={
                    'user_count': user_count,
                    'seat_limit': seat_limit,
                    'utilization_pct': round(utilization * 100, 1)
                }
            )
        
        return None


class OverageDetector(BaseSignalDetector):
    """Detect usage beyond plan limits."""
    signal_name = "overage"
    signal_category = "expansion"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check for overage usage."""
        if self.signal_exists(account_id, lookback_days=7):
            return None
        
        # Stub: would check actual usage vs plan limits from billing data
        # For now, check if user count exceeds free plan limit
        account = self.get_account(account_id)
        if not account:
            return None
        
        user_count = self.db.query(func.count(User.id)).filter(
            User.account_id == account_id
        ).scalar() or 0
        
        seat_limits = {
            "free": 5,
            "starter": 10,
            "pro": 25
        }
        limit = seat_limits.get(account.plan, 999)
        
        if user_count > limit:
            overage_amount = user_count - limit
            return self.create_signal(
                account_id=account_id,
                value=overage_amount,
                details={
                    'current_usage': user_count,
                    'plan_limit': limit,
                    'overage_amount': overage_amount
                }
            )
        
        return None


class HealthScoreDecreaseDetector(BaseSignalDetector):
    """Detect declining health scores."""
    signal_name = "health_score_decrease"
    signal_category = "churn_risk"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check for >20% health score decrease."""
        if self.signal_exists(account_id, lookback_days=7):
            return None
        
        # Get historical health scores
        from ..models import HeuristicScore
        
        time_window_days = self.signal_config.get('time_window_days', 30)
        cutoff = datetime.utcnow() - timedelta(days=time_window_days)
        
        current_score = self.db.query(HeuristicScore).filter(
            HeuristicScore.account_id == account_id,
            HeuristicScore.score_type == "health"
        ).order_by(HeuristicScore.calculated_at.desc()).first()
        
        previous_score = self.db.query(HeuristicScore).filter(
            HeuristicScore.account_id == account_id,
            HeuristicScore.score_type == "health",
            HeuristicScore.calculated_at < cutoff
        ).order_by(HeuristicScore.calculated_at.desc()).first()
        
        if not current_score or not previous_score:
            return None
        
        pct_change = calculate_percentage_change(
            previous_score.score_value,
            current_score.score_value
        )
        
        threshold = self.signal_config.get('threshold', -0.20)
        
        if pct_change <= threshold:
            return self.create_signal(
                account_id=account_id,
                value=pct_change,
                details={
                    'current_score': current_score.score_value,
                    'previous_score': previous_score.score_value,
                    'decline_pct': round(abs(pct_change) * 100, 1)
                }
            )
        
        return None


class ARRDecreaseDetector(BaseSignalDetector):
    """Detect ARR decreases."""
    signal_name = "arr_decrease"
    signal_category = "churn_risk"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check for ARR decrease week-over-week."""
        if self.signal_exists(account_id, lookback_days=7):
            return None
        
        # Stub: would track ARR changes from Stripe webhook events
        # For now, check if current ARR is lower than a week ago
        account = self.get_account(account_id)
        if not account:
            return None
        
        # Check for arr_change signals
        week_ago = datetime.utcnow() - timedelta(days=7)
        
        arr_changes = self.db.query(Signal).filter(
            Signal.account_id == account_id,
            Signal.type == "arr_change",
            Signal.timestamp >= week_ago
        ).order_by(Signal.timestamp.desc()).all()
        
        for change in arr_changes:
            if change.value < 0:  # Negative change
                return self.create_signal(
                    account_id=account_id,
                    value=change.value,
                    details={
                        'arr_change': change.value,
                        'current_arr': account.arr,
                        'change_date': change.timestamp.isoformat()
                    }
                )
        
        return None


class IncompleteOnboardingDetector(BaseSignalDetector):
    """Detect incomplete onboarding after threshold period."""
    signal_name = "incomplete_onboarding"
    signal_category = "churn_risk"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check for incomplete onboarding after 14 days."""
        if self.signal_exists(account_id, lookback_days=7):
            return None
        
        account = self.get_account(account_id)
        if not account:
            return None
        
        threshold_days = self.signal_config.get('threshold_days', 14)
        days_since_creation = (datetime.utcnow() - account.created_at).days
        
        if days_since_creation < threshold_days:
            return None
        
        # Check for onboarding_complete signal
        onboarding_complete = self.db.query(Signal).filter(
            Signal.account_id == account_id,
            Signal.type == "onboarding_complete"
        ).first()
        
        if not onboarding_complete:
            return self.create_signal(
                account_id=account_id,
                value=days_since_creation,
                details={
                    'days_since_creation': days_since_creation,
                    'account_created': account.created_at.isoformat()
                }
            )
        
        return None


class FutureCancellationDetector(BaseSignalDetector):
    """Detect scheduled cancellations."""
    signal_name = "future_cancellation"
    signal_category = "churn_risk"
    
    def detect(self, account_id: int) -> Optional[Signal]:
        """Check for scheduled cancellation date."""
        if self.signal_exists(account_id, lookback_days=3):
            return None
        
        # Check for cancellation_scheduled signals
        cancellation = self.db.query(Signal).filter(
            Signal.account_id == account_id,
            Signal.type == "cancellation_scheduled"
        ).order_by(Signal.timestamp.desc()).first()
        
        if cancellation and cancellation.details.get('cancellation_date'):
            cancel_date = datetime.fromisoformat(cancellation.details['cancellation_date'])
            days_until_cancellation = (cancel_date - datetime.utcnow()).days
            
            if days_until_cancellation > 0:
                return self.create_signal(
                    account_id=account_id,
                    value=days_until_cancellation,
                    details={
                        'cancellation_date': cancellation.details['cancellation_date'],
                        'days_remaining': days_until_cancellation
                    }
                )
        
        return None
