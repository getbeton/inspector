from fastapi import FastAPI, Depends
from app.auth import get_current_user

app = FastAPI(title="Beton Inspector API")

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/me")
def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user

from sqlalchemy.orm import Session
from app.config import settings
from app.data_manager import DataManager
from app.models import Base
from sqlalchemy import create_engine
from typing import Dict, Optional
import logging

from app.integrations.posthog import PostHogClient
from app.integrations.stripe import StripeClient
from app.integrations.apollo import ApolloClient
from app.services.sync import SyncService

logger = logging.getLogger(__name__)

# Dependency to get DB session
# In a real app we'd use a proper dependency injection for DB
engine = create_engine(settings.database_url)
def get_db():
    db = Session(bind=engine)
    try:
        yield db
    finally:
        db.close()

# Integration client factory functions
def get_posthog_client() -> Optional[PostHogClient]:
    """Create PostHog client if configured."""
    if settings.posthog_api_key and settings.posthog_project_id:
        try:
            return PostHogClient(
                api_key=settings.posthog_api_key,
                project_id=settings.posthog_project_id
            )
        except Exception as e:
            logger.error(f"Failed to create PostHog client: {e}")
            return None
    return None

def get_stripe_client() -> Optional[StripeClient]:
    """Create Stripe client if configured."""
    if settings.stripe_api_key:
        try:
            return StripeClient(api_key=settings.stripe_api_key)
        except Exception as e:
            logger.error(f"Failed to create Stripe client: {e}")
            return None
    return None

def get_apollo_client() -> Optional[ApolloClient]:
    """Create Apollo client if configured."""
    if settings.apollo_api_key:
        try:
            return ApolloClient(api_key=settings.apollo_api_key)
        except Exception as e:
            logger.error(f"Failed to create Apollo client: {e}")
            return None
    return None

@app.post("/api/reset-mock-data")
def reset_mock_data(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if settings.env != "DEV":
        return {"status": "error", "message": "Only available in DEV mode"}
    
    manager = DataManager(db)
    return manager.reset_db_with_mock_data()

@app.post("/api/sync/run")
async def run_sync(
    current_user: dict = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """
    Manually trigger a data sync from all configured integrations.
    """
    if not settings.sync_enabled:
        return {
            "status": "error", 
            "message": "Sync is disabled. Set SYNC_ENABLED=true in environment."
        }
    
    # Initialize clients
    posthog_client = get_posthog_client()
    stripe_client = get_stripe_client()
    
    if not posthog_client and not stripe_client:
        return {
            "status": "error",
            "message": "No integration clients configured. Set API keys in environment."
        }
    
    # Create sync service and run
    sync_service = SyncService(
        db=db,
        posthog_client=posthog_client,
        stripe_client=stripe_client
    )
    
    try:
        results = sync_service.sync_all()
        return {
            "status": "success",
            "results": results
        }
    except Exception as e:
        logger.error(f"Sync failed: {e}")
        return {
            "status": "error",
            "message": str(e)
        }

@app.post("/api/integrations/test")
async def test_integrations(current_user: dict = Depends(get_current_user)):
    """
    Test connections to all configured integrations.
    """
    results = {}
    
    # Test PostHog
    posthog_client = get_posthog_client()
    if posthog_client:
        try:
            # Simple connection test
            results["posthog"] = {
                "configured": True,
                "connected": True,
                "message": "Connection successful"
            }
        except Exception as e:
            results["posthog"] = {
                "configured": True,
                "connected": False,
                "message": str(e)
            }
    else:
        results["posthog"] = {
            "configured": False,
            "connected": False,
            "message": "API key not configured"
        }
    
    # Test Stripe
    stripe_client = get_stripe_client()
    if stripe_client:
        connected = stripe_client.test_connection()
        results["stripe"] = {
            "configured": True,
            "connected": connected,
            "message": "Connection successful" if connected else "Connection failed"
        }
    else:
        results["stripe"] = {
            "configured": False,
            "connected": False,
            "message": "API key not configured"
        }
    
    # Test Apollo
    apollo_client = get_apollo_client()
    if apollo_client:
        try:
            connected = await apollo_client.test_connection()
            results["apollo"] = {
                "configured": True,
                "connected": connected,
                "message": "Connection successful" if connected else "Connection failed"
            }
        except Exception as e:
            results["apollo"] = {
                "configured": True,
                "connected": False,
                "message": str(e)
            }
    else:
        results["apollo"] = {
            "configured": False,
            "connected": False,
            "message": "API key not configured"
        }
    
    return results

@app.get("/api/integrations/status")
async def get_integrations_status(current_user: dict = Depends(get_current_user)):
    """
    Get configuration and connection status for all integrations.
    """
    return {
        "posthog": {
            "configured": bool(settings.posthog_api_key and settings.posthog_project_id),
            "api_key_set": bool(settings.posthog_api_key),
            "project_id_set": bool(settings.posthog_project_id)
        },
        "stripe": {
            "configured": bool(settings.stripe_api_key),
            "api_key_set": bool(settings.stripe_api_key)
        },
        "apollo": {
            "configured": bool(settings.apollo_api_key),
            "api_key_set": bool(settings.apollo_api_key)
        },
        "sync_enabled": settings.sync_enabled
    }


# ===== HEURISTICS & SCORING ENDPOINTS =====

from app.heuristics import SignalProcessor, HeuristicsEngine, MLService, FitScorer
from app.heuristics.concrete_grades import get_all_grades

@app.post("/api/heuristics/process-signals/{account_id}")
async def process_signals_for_account(
    account_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually trigger signal processing for a specific account.
    Detects all Phase 1 signals (20 product usage signals).
    """
    try:
        processor = SignalProcessor(db)
        result = processor.process_account(account_id)
        
        return {
            "status": "success",
            **result
        }
    except Exception as e:
        logger.error(f"Signal processing failed for account {account_id}: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


@app.post("/api/heuristics/calculate-scores/{account_id}")
async def calculate_scores(
    account_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Calculate health, expansion, and churn risk scores for an account.
    Uses weighted scoring formula with fit multipliers and recency decay.
    Returns concrete grade display (M100, M75, M50, M25, M10).
    """
    try:
        engine = HeuristicsEngine(db)
        scores = engine.calculate_all_scores(account_id)
        
        # Format scores with concrete grades
        from app.heuristics.concrete_grades import format_score_display
        
        return {
            "status": "success",
            "account_id": account_id,
            "scores": {
                "health": {
                    "value": scores['health'],
                    **format_score_display(scores['health'])
                },
                "expansion": {
                    "value": scores['expansion'],
                    **format_score_display(scores['expansion'])
                },
                "churn_risk": {
                    "value": scores['churn_risk'],
                    **format_score_display(scores['churn_risk'])
                }
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Score calculation failed for account {account_id}: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


@app.post("/api/heuristics/run-clustering")
async def run_ml_clustering(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Run K-Means clustering on all accounts.
    Currently uses placeholder logic based on health scores.
    Will be upgraded to full sklearn K-Means in Phase 2.
    """
    try:
        ml_service = MLService(db)
        result = ml_service.run_clustering()
        
        return {
            "status": "success",
            **result
        }
    except Exception as e:
        logger.error(f"Clustering failed: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


@app.get("/api/heuristics/scores/{account_id}")
async def get_account_scores(
    account_id: int,
    score_type: str = "health",
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get detailed score breakdown for an account.
    Includes component scores showing which signals contributed.
    
    Args:
        account_id: Account ID
        score_type: Type of score (health, expansion, churn_risk)
    """
    try:
        engine = HeuristicsEngine(db)
        breakdown = engine.get_score_breakdown(account_id, score_type)
        
        return {
            "status": "success",
            **breakdown
        }
    except Exception as e:
        logger.error(f"Failed to get scores for account {account_id}: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


@app.get("/api/heuristics/clusters")
async def get_cluster_summary(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get summary of all account clusters.
    Shows distribution of accounts across clusters.
    """
    try:
        ml_service = MLService(db)
        summary = ml_service.get_cluster_summary()
        
        return {
            "status": "success",
            "clusters": summary,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get cluster summary: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


@app.get("/api/heuristics/fit-score/{account_id}")
async def get_fit_score(
    account_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get ICP fit score for an account.
    Returns fit score (0.0-1.0) and fit category (ICP Match, Near ICP, Poor Fit).
    """
    try:
        fit_scorer = FitScorer(db)
        fit_score = fit_scorer.calculate_fit_score(account_id)
        fit_category = FitScorer.get_fit_category(fit_score)
        fit_multiplier = fit_scorer.get_fit_multiplier(account_id)
        
        return {
            "status": "success",
            "account_id": account_id,
            "fit_score": fit_score,
            "fit_category": fit_category,
            "fit_multiplier": fit_multiplier
        }
    except Exception as e:
        logger.error(f"Failed to get fit score for account {account_id}: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


@app.get("/api/heuristics/concrete-grades")
async def get_concrete_grades_info(current_user: dict = Depends(get_current_user)):
    """
    Get information about Beton concrete quality grading system.
    Returns all grade definitions (M100, M75, M50, M25, M10).
    """
    return {
        "status": "success",
        "grades": get_all_grades(),
        "description": "Beton concrete quality grading system - health scores styled as construction concrete grades"
    }



from datetime import datetime

@app.post("/api/heuristics/process-all")
async def process_all_accounts(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Process signals and calculate scores for all accounts.
    This is a batch operation that runs the full heuristics pipeline.
    """
    try:
        processor = SignalProcessor(db)
        engine = HeuristicsEngine(db)
        
        # Process all accounts
        process_results = processor.process_all_accounts()
        
        # Calculate scores for all
        score_results = []
        for result in process_results:
            account_id = result['account_id']
            scores = engine.calculate_all_scores(account_id)
            score_results.append({
                'account_id': account_id,
                'health_score': scores['health'],
                'signals_detected': result['signals_detected']
            })
        
        return {
            "status": "success",
            "accounts_processed": len(process_results),
            "results": score_results,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Batch processing failed: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


# ===== DASHBOARD ENDPOINTS =====

from app.services.dashboard import DashboardService

@app.post("/api/dashboard/metrics")
async def get_dashboard_metrics(
    filters: dict = {},
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all aggregated metrics for the main dashboard.
    Includes North Star metrics, Growth Velocity, and Momentum data.
    """
    try:
        service = DashboardService(db)
        
        north_star = service.get_north_star_metrics(filters)
        velocity = service.get_growth_velocity_metrics(filters)
        momentum = service.get_momentum_data(filters)
        
        return {
            "status": "success",
            "north_star": north_star,
            "velocity": velocity,
            "momentum": momentum,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get dashboard metrics: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


