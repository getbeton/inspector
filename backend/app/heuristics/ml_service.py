"""
MLService - Epic 4 Task #4
K-Means clustering for account segmentation (stub for future implementation).
"""
from sqlalchemy.orm import Session
from typing import Dict, List
from datetime import datetime

from app.models import Account
from .models import AccountCluster
from .utils import load_scoring_config


class MLService:
    """
    Machine learning service for account clustering and pattern detection.
    Stub implementation - full ML features to be added in Phase 2.
    """
    
    def __init__(self, db_session: Session, n_clusters: int = 5, config: Dict = None):
        """
        Initialize MLService.
        
        Args:
            db_session: Database session
            n_clusters: Number of clusters for K-Means
            config: Optional configuration
        """
        self.db = db_session
        self.n_clusters = n_clusters
        self.config = config or load_scoring_config()
    
    def run_clustering(self) -> Dict:
        """
        Run K-Means clustering on all accounts.
        STUB: Returns placeholder results.
        
        Returns:
            Dictionary with clustering results
        """
        # Stub implementation
        # In Phase 2, this will:
        # 1. Extract features for all accounts
        # 2. Normalize features with StandardScaler
        # 3. Run sklearn KMeans
        # 4. Auto-label clusters based on characteristics
        # 5. Save to AccountCluster table
        
        accounts = self.db.query(Account).all()
        
        # Simple placeholder clustering based on health_score
        for account in accounts:
            cluster_id, cluster_label = self._simple_cluster_assignment(account)
            
            self._save_cluster_assignment(
                account_id=account.id,
                cluster_id=cluster_id,
                cluster_label=cluster_label,
                confidence_score=0.75  # Placeholder
            )
        
        return {
            'clusters_created': self.n_clusters,
            'accounts_clustered': len(accounts),
            'method': 'placeholder_health_score_based',
            'timestamp': datetime.utcnow().isoformat()
        }
    
    def _simple_cluster_assignment(self, account: Account) -> tuple:
        """
        Simple cluster assignment based on health score.
        This is a stub - real implementation will use ML.
        
        Args:
            account: Account instance
        
        Returns:
            Tuple of (cluster_id, cluster_label)
        """
        health_score = account.health_score or 50
        
        if health_score >= 80:
            return (0, "Power Users")
        elif health_score >= 60:
            return (1, "Healthy Accounts")
        elif health_score >= 40:
            return (2, "Moderate Engagement")
        elif health_score >= 20:
            return (3, "At Risk")
        else:
            return (4, "Inactive/Churning")
    
    def _save_cluster_assignment(
        self,
        account_id: int,
        cluster_id: int,
        cluster_label: str,
        confidence_score: float
    ):
        """
        Save cluster assignment to database.
        
        Args:
            account_id: Account ID
            cluster_id: Cluster ID (0-4)
            cluster_label: Human-readable label
            confidence_score: Confidence in assignment
        """
        cluster = AccountCluster(
            account_id=account_id,
            cluster_id=cluster_id,
            cluster_label=cluster_label,
            confidence_score=confidence_score,
            features={},  # Placeholder
            created_at=datetime.utcnow()
        )
        
        self.db.add(cluster)
        self.db.commit()
    
    def get_cluster_summary(self) -> List[Dict]:
        """
        Get summary of all clusters.
        
        Returns:
            List of cluster summaries
        """
        from sqlalchemy import func
        
        # Get cluster counts
        cluster_counts = self.db.query(
            AccountCluster.cluster_id,
            AccountCluster.cluster_label,
            func.count(AccountCluster.id).label('count')
        ).group_by(
            AccountCluster.cluster_id,
            AccountCluster.cluster_label
        ).all()
        
        summaries = []
        for cluster_id, label, count in cluster_counts:
            summaries.append({
                'cluster_id': cluster_id,
                'label': label,
                'account_count': count
            })
        
        return summaries
