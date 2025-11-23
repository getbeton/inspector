from faker import Faker
from sqlalchemy.orm import Session
from app.models import Account, User, Signal, Opportunity, AccountStatus, OpportunityStage
import random
from datetime import datetime, timedelta

fake = Faker()

class MockDataGenerator:
    def __init__(self, db: Session):
        self.db = db

    def populate(self, num_accounts=50):
        # Clear existing data
        self.db.query(Opportunity).delete()
        self.db.query(Signal).delete()
        self.db.query(User).delete()
        self.db.query(Account).delete()
        self.db.commit()

        print(f"Generating {num_accounts} accounts...")
        
        for _ in range(num_accounts):
            self.create_account_with_data()
        
        self.db.commit()
        print("Mock data population complete.")

    def create_account_with_data(self):
        # 1. Create Account
        company_name = fake.company()
        domain = fake.domain_name()
        if "Inc" not in company_name and "LLC" not in company_name:
            company_name += f" {fake.company_suffix()}"
        
        status = random.choice(list(AccountStatus))
        arr = random.uniform(5000, 500000) if status == AccountStatus.ACTIVE else 0
        plan = random.choice(["free", "starter", "pro", "enterprise"])
        
        account = Account(
            name=company_name,
            domain=domain,
            arr=round(arr, 2),
            plan=plan,
            status=status,
            health_score=random.uniform(0, 100)
        )
        self.db.add(account)
        self.db.flush() # Get ID

        # 2. Create Users
        num_users = random.randint(3, 20)
        roles = ["admin", "member", "viewer"]
        titles = ["CTO", "VP Engineering", "Senior Dev", "Product Manager", "CEO", "Sales"]
        
        for _ in range(num_users):
            user = User(
                account_id=account.id,
                email=f"{fake.first_name().lower()}.{fake.last_name().lower()}@{domain}",
                name=fake.name(),
                role=random.choice(roles),
                title=random.choice(titles)
            )
            self.db.add(user)

        # 3. Create Signals (Time Series)
        # Simulate last 30 days
        signal_types = ["login", "feature_usage", "invite_sent", "billing_payment", "support_ticket"]
        num_signals = random.randint(10, 100)
        
        for _ in range(num_signals):
            sig_type = random.choice(signal_types)
            value = 1.0
            if sig_type == "billing_payment":
                value = random.uniform(50, 5000)
            
            signal = Signal(
                account_id=account.id,
                type=sig_type,
                value=round(value, 2),
                timestamp=fake.date_time_between(start_date='-30d', end_date='now'),
                source="mock",
                details={"meta": "mock_generated"}
            )
            self.db.add(signal)

        # 4. Create Opportunity (if high score)
        if account.health_score > 70:
            opp = Opportunity(
                account_id=account.id,
                stage=random.choice(list(OpportunityStage)),
                value=account.arr * 0.25, # Potential expansion
                ai_summary=f"High usage detected. {num_users} active users. Recommended expansion play.",
                created_at=datetime.utcnow()
            )
            self.db.add(opp)
