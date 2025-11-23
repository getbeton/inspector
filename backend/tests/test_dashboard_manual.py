import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.dashboard import DashboardService
from app.models import Base, Account, Opportunity, Signal, AccountStatus
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timedelta

# Setup in-memory DB
engine = create_engine('sqlite:///:memory:')
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
db = Session()

def seed_data():
    # Create Accounts
    acc1 = Account(name="Acc1", arr=10000, status=AccountStatus.ACTIVE, health_score=80, created_at=datetime.utcnow())
    acc2 = Account(name="Acc2", arr=5000, status=AccountStatus.ACTIVE, health_score=40, created_at=datetime.utcnow() - timedelta(days=40))
    acc3 = Account(name="Acc3", arr=0, status=AccountStatus.ACTIVE, created_at=datetime.utcnow() - timedelta(days=10)) # New lead
    db.add_all([acc1, acc2, acc3])
    db.commit()

    # Create Opportunities
    opp1 = Opportunity(account_id=acc1.id, value=5000, stage="detected")
    db.add(opp1)
    db.commit()

    # Create Signals
    sig1 = Signal(account_id=acc1.id, type="upgrade", value=1.0, timestamp=datetime.utcnow())
    db.add(sig1)
    db.commit()

def test_dashboard():
    seed_data()
    service = DashboardService(db)
    
    print("--- North Star Metrics ---")
    ns = service.get_north_star_metrics()
    print(ns)
    assert ns['total_arr'] == 15000
    assert ns['expansion_pipeline'] == 5000
    
    print("\n--- Growth Velocity ---")
    vel = service.get_growth_velocity_metrics()
    print(vel)
    # Acc1 (today), Acc3 (10 days ago) -> 2 new leads in last 30 days
    assert vel['new_leads']['current'] == 2 
    
    print("\n--- Momentum Data ---")
    mom = service.get_momentum_data()
    print(mom)
    assert len(mom) == 3
    assert mom[0]['top_signal'] == 'upgrade' # Acc1 has upgrade signal

if __name__ == "__main__":
    try:
        test_dashboard()
        print("\nDashboard Service Tests Passed!")
    except Exception as e:
        print(f"\nTests Failed: {e}")
        import traceback
        traceback.print_exc()
