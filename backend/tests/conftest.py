"""
Pytest configuration and fixtures for integration tests.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base
# Import all models to ensure SQLAlchemy mappers are configured
from app.models import Account, Signal, SyncState  # noqa: F401
from app.heuristics.models import MetricSnapshot, HeuristicScore, AccountCluster  # noqa: F401

# Test database URL (in-memory SQLite for testing).
# Important: using ":memory:" avoids creating a real `test.db` file in the repo.
TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(scope="function")
def db_session():
    """
    Create a new database session for a test.
    The session is rolled back after the test.
    """
    engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    # Create session
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    
    yield session
    
    # Cleanup
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def sample_posthog_event():
    """Sample PostHog event data for testing."""
    return {
        "id": "test-event-123",
        "event": "user_login",
        "distinct_id": "user@example.com",
        "properties": {
            "email": "user@example.com",
            "plan": "pro",
            "value": 100.0
        },
        "timestamp": "2025-11-23T14:00:00Z"
    }


@pytest.fixture
def sample_stripe_subscription():
    """Sample Stripe subscription data for testing."""
    return {
        "id": "sub_test123",
        "customer": "cus_test456",
        "status": "active",
        "created": 1700000000,
        "items": {
            "data": [
                {
                    "id": "si_test789",
                    "quantity": 1,
                    "price": {
                        "id": "price_test",
                        "unit_amount": 9900,  # $99.00 in cents
                        "currency": "usd",
                        "recurring": {
                            "interval": "month"
                        },
                        "nickname": "Pro Plan"
                    }
                }
            ]
        }
    }
