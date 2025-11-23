"""
Database models for heuristics system.
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from app.models import Base


class MetricSnapshot(Base):
    """
    Pre-aggregated metrics for dashboard performance.
    Stores daily statistics like active_users, feature_usage, etc.
    """
    __tablename__ = "metric_snapshots"
    
    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    metric_name = Column(String, index=True, nullable=False)
    metric_value = Column(Float, nullable=False)
    snapshot_date = Column(Date, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    account = relationship("Account", back_populates="metric_snapshots")


class HeuristicScore(Base):
    """
    Calculated scores for accounts with component breakdown.
    Tracks health, expansion, and churn risk scores over time.
    """
    __tablename__ = "heuristic_scores"
    
    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    score_type = Column(String, index=True, nullable=False)  # "health", "expansion", "churn_risk"
    score_value = Column(Float, nullable=False)  # 0-100 scale
    component_scores = Column(JSON)  # Breakdown by signal: {signal_name: weight_contribution}
    calculated_at = Column(DateTime, default=datetime.utcnow)
    valid_until = Column(DateTime)  # Score expiration
    
    account = relationship("Account", back_populates="heuristic_scores")


class AccountCluster(Base):
    """
    ML clustering results for account segmentation.
    K-Means cluster assignments with auto-generated labels.
    """
    __tablename__ = "account_clusters"
    
    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    cluster_id = Column(Integer, index=True, nullable=False)
    cluster_label = Column(String)  # e.g., "Power Users", "At Risk", "Inactive"
    confidence_score = Column(Float)  # 0.0-1.0
    features = Column(JSON)  # Feature vector used for clustering
    created_at = Column(DateTime, default=datetime.utcnow)
    
    account = relationship("Account", back_populates="account_clusters")
