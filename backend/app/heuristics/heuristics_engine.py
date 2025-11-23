"""
HeuristicsEngine service - Epic 4 Task #2
Calculates health scores using weighted scoring with fit multipliers and recency decay.
"""
from sqlalchemy.orm import Session
from typing import Dict, List, Optional
from datetime import datetime, timedelta

from app.models import Signal, Account, Opportunity
from .models import HeuristicScore
from .utils import (
    load_scoring_config,
    calculate_recency_decay,
    normalize_score,
    clamp_score
)
from .concrete_grades import format_score_display
from .fit_scorer import FitScorer


class HeuristicsEngine:
    """
    Core scoring engine that applies weighted scoring formula.
    Formula: Score = (Signal_Sum * Fit_Multiplier) * Recency_Decay
    """
    
    def __init__(self, db_session: Session, config: Dict = None):
        """
        Initialize HeuristicsEngine.
        
        Args:
            db_session: Database session
            config: Optional scoring configuration
        """
        self.db = db_session
        self.config = config or load_scoring_config()
        self.fit_scorer = FitScorer(db_session, self.config)
    
    def calculate_health_score(self, account_id: int) -> float:
        """
        Calculate overall health score for account.
        
        Args:
            account_id: Account ID to score
        
        Returns:
            Health score on 0-100 scale (concrete grade M10-M100)
        """
        # Get all signals for account
        max_signal_age = self.config['signal_processing'].get('max_signal_age_days', 90)
        cutoff_date = datetime.utcnow() - timedelta(days=max_signal_age)
        
        signals = self.db.query(Signal).filter(
            Signal.account_id == account_id,
            Signal.timestamp >= cutoff_date
        ).all()
        
        if not signals:
            return 50.0  # Neutral score if no signals
        
        # Calculate weighted signal sum with recency decay
        signal_sum = 0.0
        component_scores = {}
        
        for signal in signals:
            # Get signal weight from config
            signal_config = self.config['signals'].get(signal.type, {})
            weight = signal_config.get('weight', 0.0)
            
            # Apply recency decay
            decay_factor = calculate_recency_decay(signal.timestamp, self.config)
            
            # Calculate contribution
            contribution = weight * decay_factor
            signal_sum += contribution
            
            # Track component contributions
            if signal.type not in component_scores:
                component_scores[signal.type] = 0.0
            component_scores[signal.type] += contribution
        
        # Apply fit multiplier
        fit_multiplier = self.fit_scorer.get_fit_multiplier(account_id)
        adjusted_sum = signal_sum * fit_multiplier
        
        # Normalize to 0-100 scale
        health_score = normalize_score(adjusted_sum, self.config)
        
        # Persist score
        self._save_score(
            account_id=account_id,
            score_type="health",
            score_value=health_score,
            component_scores=component_scores
        )
        
        # Update account health_score field
        account = self.db.query(Account).filter(Account.id == account_id).first()
        if account:
            account.health_score = health_score
            account.updated_at = datetime.utcnow()
            self.db.commit()
        
        return health_score
    
    def calculate_expansion_score(self, account_id: int) -> float:
        """
        Calculate expansion opportunity score.
        Focuses on positive signals indicating growth potential.
        
        Args:
            account_id: Account ID
        
        Returns:
            Expansion score on 0-100 scale
        """
        max_signal_age = self.config['signal_processing'].get('max_signal_age_days', 90)
        cutoff_date = datetime.utcnow() - timedelta(days=max_signal_age)
        
        # Get only expansion category signals
        signals = self.db.query(Signal).filter(
            Signal.account_id == account_id,
            Signal.timestamp >= cutoff_date
        ).all()
        
        expansion_sum = 0.0
        component_scores = {}
        
        for signal in signals:
            signal_config = self.config['signals'].get(signal.type, {})
            category = signal_config.get('category')
            
            if category == 'expansion':
                weight = signal_config.get('weight', 0.0)
                decay_factor = calculate_recency_decay(signal.timestamp, self.config)
                contribution = weight * decay_factor
                expansion_sum += contribution
                
                if signal.type not in component_scores:
                    component_scores[signal.type] = 0.0
                component_scores[signal.type] += contribution
        
        # Apply fit multiplier
        fit_multiplier = self.fit_scorer.get_fit_multiplier(account_id)
        adjusted_sum = expansion_sum * fit_multiplier
        
        expansion_score = normalize_score(adjusted_sum, self.config)
        
        self._save_score(
            account_id=account_id,
            score_type="expansion",
            score_value=expansion_score,
            component_scores=component_scores
        )
        
        return expansion_score
    
    def calculate_churn_risk_score(self, account_id: int) -> float:
        """
        Calculate churn risk score.
        Focuses on negative signals indicating retention issues.
        
        Args:
            account_id: Account ID
        
        Returns:
            Churn risk score on 0-100 scale (higher = more risk)
        """
        max_signal_age = self.config['signal_processing'].get('max_signal_age_days', 90)
        cutoff_date = datetime.utcnow() - timedelta(days=max_signal_age)
        
        signals = self.db.query(Signal).filter(
            Signal.account_id == account_id,
            Signal.timestamp >= cutoff_date
        ).all()
        
        risk_sum = 0.0
        component_scores = {}
        
        for signal in signals:
            signal_config = self.config['signals'].get(signal.type, {})
            category = signal_config.get('category')
            
            if category == 'churn_risk':
                weight = abs(signal_config.get('weight', 0.0))  # Use absolute value
                decay_factor = calculate_recency_decay(signal.timestamp, self.config)
                contribution = weight * decay_factor
                risk_sum += contribution
                
                if signal.type not in component_scores:
                    component_scores[signal.type] = 0.0
                component_scores[signal.type] += contribution
        
        # Higher fit score means churn is more costly, so multiply
        fit_multiplier = self.fit_scorer.get_fit_multiplier(account_id)
        adjusted_sum = risk_sum * fit_multiplier
        
        churn_risk_score = normalize_score(adjusted_sum, self.config)
        
        self._save_score(
            account_id=account_id,
            score_type="churn_risk",
            score_value=churn_risk_score,
            component_scores=component_scores
        )
        
        return churn_risk_score
    
    def calculate_all_scores(self, account_id: int) -> Dict[str, float]:
        """
        Calculate all score types for an account.
        
        Args:
            account_id: Account ID
        
        Returns:
            Dictionary of score types and values
        """
        scores = {
            'health': self.calculate_health_score(account_id),
            'expansion': self.calculate_expansion_score(account_id),
            'churn_risk': self.calculate_churn_risk_score(account_id)
        }
        
        # Trigger opportunity generation based on thresholds
        self.trigger_opportunities(account_id, scores)
        
        return scores
    
    def trigger_opportunities(self, account_id: int, scores: Dict[str, float]):
        """
        Create opportunities when thresholds are exceeded.
        
        Args:
            account_id: Account ID
            scores: Dictionary of calculated scores
        """
        thresholds = self.config['thresholds']
        opp_config = self.config['opportunity_generation']
        
        # Check expansion threshold
        if scores['expansion'] >= thresholds['expansion_threshold']:
            self._create_opportunity_if_needed(
                account_id=account_id,
                opportunity_type='expansion',
                score=scores['expansion']
            )
        
        # Check churn risk threshold
        if scores['churn_risk'] >= thresholds['churn_risk_threshold']:
            self._create_opportunity_if_needed(
                account_id=account_id,
                opportunity_type='churn_risk',
                score=scores['churn_risk']
            )
    
    def _create_opportunity_if_needed(
        self,
        account_id: int,
        opportunity_type: str,
        score: float
    ):
        """
        Create opportunity if one doesn't exist within cooldown period.
        
        Args:
            account_id: Account ID
            opportunity_type: Type of opportunity
            score: Score that triggered the opportunity
        """
        opp_config = self.config['opportunity_generation']
        cooldown_days = opp_config.get('opportunity_cooldown_days', 30)
        cutoff_date = datetime.utcnow() - timedelta(days=cooldown_days)
        
        # Check if similar opportunity exists recently
        existing_opp = self.db.query(Opportunity).filter(
            Opportunity.account_id == account_id,
            Opportunity.created_at >= cutoff_date
        ).first()
        
        if existing_opp:
            return  # Cooldown period active
        
        # Get account for value estimation
        account = self.db.query(Account).filter(Account.id == account_id).first()
        if not account:
            return
        
        # Estimate opportunity value
        if opportunity_type == 'expansion':
            multiplier = opp_config.get('expansion_value_multiplier', 0.3)
            value = account.arr * multiplier
            stage = "detected"
        else:  # churn_risk
            multiplier = opp_config.get('churn_risk_value_multiplier', 1.0)
            value = account.arr * multiplier
            stage = "detected"
        
        # Generate AI summary
        concrete_display = format_score_display(score)
        ai_summary = self._generate_opportunity_summary(
            account_id,
            opportunity_type,
            score,
            concrete_display
        )
        
        # Create opportunity
        opportunity = Opportunity(
            account_id=account_id,
            stage=stage,
            value=value,
            ai_summary=ai_summary,
            created_at=datetime.utcnow()
        )
        
        self.db.add(opportunity)
        self.db.commit()
    
    def _generate_opportunity_summary(
        self,
        account_id: int,
        opportunity_type: str,
        score: float,
        concrete_display: Dict
    ) -> str:
        """
        Generate AI summary for opportunity.
        
        Args:
            account_id: Account ID
            opportunity_type: Type of opportunity
            score: Score value
            concrete_display: Formatted concrete grade display
        
        Returns:
            Summary text
        """
        # Get recent signals that contributed
        recent_signals = self.db.query(Signal).filter(
            Signal.account_id == account_id,
            Signal.timestamp >= datetime.utcnow() - timedelta(days=30)
        ).limit(5).all()
        
        signal_descriptions = []
        for signal in recent_signals:
            signal_config = self.config['signals'].get(signal.type, {})
            if signal_config.get('category') == opportunity_type.replace('_', ' '):
                desc = signal_config.get('description', signal.type)
                signal_descriptions.append(f"• {desc}")
        
        if opportunity_type == 'expansion':
            summary = f"Expansion Opportunity - {concrete_display['display']}\n\n"
            summary += "This account shows strong growth signals:\n"
            summary += "\n".join(signal_descriptions[:3])
            summary += "\n\nRecommendation: Schedule expansion conversation to discuss upgrade options."
        else:
            summary = f"Churn Risk Alert - {concrete_display['display']}\n\n"
            summary += "This account shows concerning retention signals:\n"
            summary += "\n".join(signal_descriptions[:3])
            summary += "\n\nRecommendation: immediate intervention required to prevent churn."
        
        return summary
    
    def _save_score(
        self,
        account_id: int,
        score_type: str,
        score_value: float,
        component_scores: Dict[str, float]
    ):
        """
        Save score to database.
        
        Args:
            account_id: Account ID
            score_type: Type of score (health, expansion, churn_risk)
            score_value: Score value
            component_scores: Breakdown of signal contributions
        """
        # Set validity period (scores valid for 24 hours)
        valid_until = datetime.utcnow() + timedelta(
            hours=self.config['signal_processing'].get('recalculation_frequency_hours', 24)
        )
        
        score_record = HeuristicScore(
            account_id=account_id,
            score_type=score_type,
            score_value=score_value,
            component_scores=component_scores,
            calculated_at=datetime.utcnow(),
            valid_until=valid_until
        )
        
        self.db.add(score_record)
        self.db.commit()
    
    def get_score_breakdown(self, account_id: int, score_type: str = "health") -> Dict:
        """
        Get detailed score breakdown for an account.
        
        Args:
            account_id: Account ID
            score_type: Type of score to retrieve
        
        Returns:
            Dictionary with score details and concrete grade display
        """
        score_record = self.db.query(HeuristicScore).filter(
            HeuristicScore.account_id == account_id,
            HeuristicScore.score_type == score_type
        ).order_by(HeuristicScore.calculated_at.desc()).first()
        
        if not score_record:
            return {'error': 'No score found'}
        
        concrete_display = format_score_display(score_record.score_value)
        
        return {
            'account_id': account_id,
            'score_type': score_type,
            'score_value': score_record.score_value,
            'concrete_grade': concrete_display,
            'component_scores': score_record.component_scores,
            'calculated_at': score_record.calculated_at.isoformat(),
            'valid_until': score_record.valid_until.isoformat() if score_record.valid_until else None
        }
