from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
import enum

Base = declarative_base()

class AccountStatus(str, enum.Enum):
    ACTIVE = "active"
    CHURNED = "churned"
    TRIAL = "trial"

class OpportunityStage(str, enum.Enum):
    DETECTED = "detected"
    QUALIFIED = "qualified"
    IN_PROGRESS = "in_progress"
    CLOSED_WON = "closed_won"
    CLOSED_LOST = "closed_lost"

class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    domain = Column(String, index=True)
    arr = Column(Float, default=0.0)
    plan = Column(String, default="free")
    status = Column(String, default=AccountStatus.ACTIVE)
    health_score = Column(Float, default=0.0)
    fit_score = Column(Float, default=0.0)  # ICP fit score (0.0-1.0)
    last_activity_at = Column(DateTime)  # Track last user activity
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users = relationship("User", back_populates="account", cascade="all, delete-orphan")
    signals = relationship("Signal", back_populates="account", cascade="all, delete-orphan")
    opportunities = relationship("Opportunity", back_populates="account", cascade="all, delete-orphan")
    metric_snapshots = relationship("MetricSnapshot", back_populates="account", cascade="all, delete-orphan")
    heuristic_scores = relationship("HeuristicScore", back_populates="account", cascade="all, delete-orphan")
    account_clusters = relationship("AccountCluster", back_populates="account", cascade="all, delete-orphan")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    email = Column(String, index=True)
    name = Column(String)
    role = Column(String) # e.g. "admin", "member"
    title = Column(String) # e.g. "CTO", "Developer"
    created_at = Column(DateTime, default=datetime.utcnow)

    account = relationship("Account", back_populates="users")

class Signal(Base):
    __tablename__ = "signals"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    type = Column(String, index=True) # e.g. "usage_spike", "billing_increase"
    value = Column(Float) # Quantitative value if applicable
    details = Column(JSON) # Extra context
    timestamp = Column(DateTime, default=datetime.utcnow)
    source = Column(String) # e.g. "posthog", "stripe"

    account = relationship("Account", back_populates="signals")

class Opportunity(Base):
    __tablename__ = "opportunities"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    stage = Column(String, default=OpportunityStage.DETECTED)
    value = Column(Float, default=0.0)
    ai_summary = Column(String) # Gemini generated explanation
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    account = relationship("Account", back_populates="opportunities")
