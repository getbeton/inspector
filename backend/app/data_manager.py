from sqlalchemy.orm import Session, joinedload
from app.models import Account, User, Signal, Opportunity
from app.mock_data import MockDataGenerator

class DataManager:
    def __init__(self, db: Session):
        self.db = db

    def get_all_accounts(self, limit=100):
        return self.db.query(Account).order_by(Account.health_score.desc()).limit(limit).all()

    def get_account_by_id(self, account_id: int):
        return self.db.query(Account).options(
            joinedload(Account.users),
            joinedload(Account.signals),
            joinedload(Account.opportunities)
        ).filter(Account.id == account_id).first()

    def get_dashboard_metrics(self):
        total_arr = self.db.query(Account).with_entities(Account.arr).all()
        total_arr_sum = sum([x[0] for x in total_arr if x[0]])
        
        pipeline_val = self.db.query(Opportunity).with_entities(Opportunity.value).all()
        pipeline_sum = sum([x[0] for x in pipeline_val if x[0]])
        
        return {
            "total_arr": total_arr_sum,
            "pipeline_value": pipeline_sum,
            "account_count": self.db.query(Account).count()
        }

    def reset_db_with_mock_data(self):
        generator = MockDataGenerator(self.db)
        generator.populate()
        return {"status": "success", "message": "Database reset with mock data"}
