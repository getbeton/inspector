"""
FitScorer service for calculating ICP (Ideal Customer Profile) fit scores.
Evaluates accounts based on firmographic criteria and applies multipliers to health scores.
"""
from sqlalchemy.orm import Session
from typing import Dict, Optional
from datetime import datetime

from app.models import Account
from .utils import load_scoring_config


class FitScorer:
    """
    Calculates ICP fit scores for accounts based on firmographic data.
    Fit scores range from 0.0 (poor fit) to 1.0 (perfect ICP match).
    """
    
    def __init__(self, db_session: Session, config: Dict = None):
        """
        Initialize FitScorer.
        
        Args:
            db_session: Database session
            config: Optional scoring configuration, loads from YAML if not provided
        """
        self.db = db_session
        self.config = config or load_scoring_config()
        self.icp_criteria = self.config['icp_criteria']
    
    def calculate_fit_score(self, account_id: int, firmographic_data: Dict = None) -> float:
        """
        Calculate ICP fit score for an account.
        
        Args:
            account_id: Account ID to score
            firmographic_data: Optional firmographic data dict. If not provided,
                              will use data from account and related records
        
        Returns:
            Fit score from 0.0 to 1.0
        """
        account = self.db.query(Account).filter(Account.id == account_id).first()
        if not account:
            return 0.0
        
        # If firmographic data not provided, try to extract from account
        if firmographic_data is None:
            firmographic_data = self._extract_firmographic_data(account)
        
        # Calculate weighted fit score based on criteria
        weights = self.icp_criteria['weights']
        fit_components = {}
        
        # Industry fit
        fit_components['industry'] = self._score_industry(firmographic_data.get('industry'))
        
        # Employee count fit
        fit_components['employee_count'] = self._score_employee_count(
            firmographic_data.get('employee_count')
        )
        
        # Revenue fit
        fit_components['revenue'] = self._score_revenue(
            firmographic_data.get('revenue', account.arr)
        )
        
        # Geographic region fit
        fit_components['region'] = self._score_region(firmographic_data.get('region'))
        
        # Other factors (placeholder for future expansion)
        fit_components['other'] = 1.0  # Default to full score for now
        
        # Calculate weighted average
        total_score = sum(
            fit_components.get(key, 0.0) * weights.get(key, 0.0)
            for key in weights.keys()
        )
        
        return max(0.0, min(1.0, total_score))
    
    def update_account_fit_score(self, account_id: int, firmographic_data: Dict = None) -> float:
        """
        Calculate and persist fit score to account record.
        
        Args:
            account_id: Account ID
            firmographic_data: Optional firmographic data
        
        Returns:
            Calculated fit score
        """
        fit_score = self.calculate_fit_score(account_id, firmographic_data)
        
        account = self.db.query(Account).filter(Account.id == account_id).first()
        if account:
            account.fit_score = fit_score
            account.updated_at = datetime.utcnow()
            self.db.commit()
        
        return fit_score
    
    def get_fit_multiplier(self, account_id: int) -> float:
        """
        Get scoring multiplier based on account's fit score.
        
        Args:
            account_id: Account ID
        
        Returns:
            Multiplier to apply to health score (0.5x, 1.0x, or 1.5x)
        """
        account = self.db.query(Account).filter(Account.id == account_id).first()
        if not account:
            return 1.0
        
        fit_score = account.fit_score
        multipliers = self.config['fit_multipliers']
        
        if fit_score >= 0.8:
            return multipliers['icp_match']
        elif fit_score >= 0.5:
            return multipliers['near_icp']
        else:
            return multipliers['poor_fit']
    
    def _extract_firmographic_data(self, account: Account) -> Dict:
        """
        Extract firmographic data from account and related records.
        
        Args:
            account: Account model instance
        
        Returns:
            Dictionary of firmographic attributes
        """
        # This is a stub - in production, this would pull from Apollo.io enrichment
        # For now, return minimal data
        return {
            'industry': None,  # Would come from Apollo enrichment
            'employee_count': None,  # Would come from Apollo enrichment
            'revenue': account.arr,
            'region': None,  # Would come from user location data
        }
    
    def _score_industry(self, industry: Optional[str]) -> float:
        """Score industry match (0.0 to 1.0)."""
        if not industry:
            return 0.5  # Neutral score if unknown
        
        target_industries = self.icp_criteria['industries']
        for target in target_industries:
            if target.lower() in industry.lower():
                return 1.0
        
        return 0.0
    
    def _score_employee_count(self, employee_count: Optional[int]) -> float:
        """Score employee count fit (0.0 to 1.0)."""
        if employee_count is None:
            return 0.5  # Neutral score if unknown
        
        min_count = self.icp_criteria['employee_count_min']
        max_count = self.icp_criteria['employee_count_max']
        
        if min_count <= employee_count <= max_count:
            # Perfect fit
            return 1.0
        elif employee_count < min_count:
            # Too small - scale down based on how far below
            ratio = employee_count / min_count
            return max(0.2, ratio)  # Minimum 0.2 score
        else:
            # Too large - scale down based on how far above
            ratio = max_count / employee_count
            return max(0.2, ratio)  # Minimum 0.2 score
    
    def _score_revenue(self, revenue: Optional[float]) -> float:
        """Score revenue/ARR fit (0.0 to 1.0)."""
        if revenue is None or revenue == 0:
            return 0.5  # Neutral score if unknown
        
        min_revenue = self.icp_criteria['revenue_min']
        max_revenue = self.icp_criteria['revenue_max']
        
        if min_revenue <= revenue <= max_revenue:
            return 1.0
        elif revenue < min_revenue:
            ratio = revenue / min_revenue
            return max(0.2, ratio)
        else:
            ratio = max_revenue / revenue
            return max(0.2, ratio)
    
    def _score_region(self, region: Optional[str]) -> float:
        """Score geographic region fit (0.0 to 1.0)."""
        if not region:
            return 0.5  # Neutral score if unknown
        
        target_regions = self.icp_criteria['regions']
        for target in target_regions:
            if target.lower() in region.lower():
                return 1.0
        
        return 0.3  # Partial score for non-target regions
    
    @staticmethod
    def get_fit_category(fit_score: float) -> str:
        """
        Get human-readable fit category.
        
        Args:
            fit_score: Fit score from 0.0 to 1.0
        
        Returns:
            Category label
        """
        if fit_score >= 0.8:
            return "ICP Match"
        elif fit_score >= 0.5:
            return "Near ICP"
        else:
            return "Poor Fit"
