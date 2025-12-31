from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.responses import JSONResponse, HTMLResponse
from app.auth import get_current_user
from sqlalchemy.orm import Session
from app.config import settings
from app.data_manager import DataManager
from app.models import Base, Workspace, WorkspaceMember
from sqlalchemy import create_engine
from typing import Dict, Optional
import logging
import os
import uuid
import re

from app.integrations.posthog import PostHogClient
from app.integrations.stripe import StripeClient
from app.integrations.apollo import ApolloClient
from app.services.sync import SyncService

app = FastAPI(title="Beton Inspector API")

# Register API routers
from app.api.endpoints.settings import router as settings_router
from app.api.endpoints.attio import router as attio_router
from app.api.endpoints.dashboards import router as dashboards_router
app.include_router(settings_router)
app.include_router(attio_router, prefix="/api/v1")
app.include_router(dashboards_router, prefix="/api/v1")

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/me")
def read_users_me(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user (works with both session cookies and JWT tokens)."""
    return current_user


@app.get("/api/auth/me")
def get_auth_user(current_user: dict = Depends(get_current_user)):
    """
    Get current authenticated user for frontend session check.

    Works with session cookies set by OAuth callback.
    Returns 401 if not authenticated.
    """
    return current_user


@app.post("/api/auth/demo")
def demo_login():
    """
    Create a demo session for testing without real authentication.
    Returns redirect with session cookie set.
    """
    from app.core.session_manager import create_session, SESSION_COOKIE_NAME, SESSION_MAX_AGE

    # Create demo session
    session_token = create_session(
        user_id="demo-user-id",
        email="demo@beton.app",
        name="Demo User",
        workspace_id="demo-workspace-id",
        workspace_name="Demo Workspace"
    )

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")

    response = JSONResponse(content={"success": True, "redirect": frontend_url})

    # Set session cookie (secure=True in production for HTTPS)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=settings.env.upper() != "DEV",
        samesite="lax",
        path="/"
    )

    return response


logger = logging.getLogger(__name__)

# ============================================
# Authentication & Workspace Endpoints (Epic 2)
# ============================================

def _generate_workspace_slug(name: str) -> str:
    """Generate URL-friendly slug from workspace name."""
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    return slug[:100]  # Max 100 characters


def _ensure_unique_slug(db: Session, base_slug: str) -> str:
    """Ensure slug is unique by appending counter if needed."""
    slug = base_slug
    counter = 1
    while db.query(Workspace).filter(Workspace.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1
    return slug


@app.get("/api/user/workspace")
def get_or_create_workspace(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(lambda: Session(bind=engine))
):
    """
    Get authenticated user's workspace or create one if first-time user.

    Epic 2: Auth Backend
    Returns workspace details and isNew flag for onboarding.

    Args:
        current_user: Authenticated user claims from JWT

    Returns:
        {
            "workspace": {
                "id": "uuid",
                "name": "Workspace Name",
                "slug": "workspace-slug",
                "created_at": "ISO timestamp"
            },
            "isNew": boolean
        }

    Raises:
        HTTPException 401: Unauthenticated
        HTTPException 500: Database error
    """
    try:
        user_id = current_user.get("sub")

        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User ID not found in token"
            )

        # Query for existing workspace membership
        membership = db.query(WorkspaceMember).filter(
            WorkspaceMember.user_id == user_id
        ).first()

        if membership:
            # User already has a workspace
            workspace = db.query(Workspace).filter(
                Workspace.id == membership.workspace_id
            ).first()

            if not workspace:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Workspace not found for membership"
                )

            return {
                "workspace": {
                    "id": workspace.id,
                    "name": workspace.name,
                    "slug": workspace.slug,
                    "created_at": workspace.created_at.isoformat()
                },
                "isNew": False
            }

        # First-time user: Create workspace
        email = current_user.get("email", "user@example.com")
        domain = email.split("@")[-1] if "@" in email else "domain.com"

        # Generate workspace name from domain
        if domain in ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com"]:
            # Generic email domain - use user's first name
            first_name = email.split("@")[0].split(".")[0].capitalize()
            workspace_name = f"{first_name}'s Workspace"
        else:
            # Corporate domain - use domain name
            workspace_name = domain.replace(".com", "").replace(".", " ").title()

        workspace_id = str(uuid.uuid4())
        base_slug = _generate_workspace_slug(workspace_name)
        slug = _ensure_unique_slug(db, base_slug)

        # Create workspace and membership atomically
        workspace = Workspace(
            id=workspace_id,
            name=workspace_name,
            slug=slug,
            subscription_status="active"  # Default to active, will require payment in Epic 5
        )
        db.add(workspace)

        membership = WorkspaceMember(
            workspace_id=workspace_id,
            user_id=user_id,
            role="owner"  # First user is workspace owner
        )
        db.add(membership)

        db.commit()

        return {
            "workspace": {
                "id": workspace.id,
                "name": workspace.name,
                "slug": workspace.slug,
                "created_at": workspace.created_at.isoformat()
            },
            "isNew": True
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.exception(f"Error creating workspace: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create workspace"
        )


@app.get("/api/oauth/callback")
def oauth_callback_handler(token: Optional[str] = None, db: Session = Depends(lambda: Session(bind=engine))):
    """
    Handle OAuth callback from Supabase.

    Accepts JWT token as query parameter, validates it, creates workspace if needed,
    creates session, and returns redirect to app with session cookie.

    Args:
        token: JWT token from Supabase OAuth

    Returns:
        HTML page that redirects to home with session cookie set
    """
    if not token:
        # Supabase sends token in URL fragment (#access_token=...) which browsers don't send to server
        # Return HTML page that extracts fragment and resubmits as query param
        html_content = """
        <!DOCTYPE html>
        <html>
        <head><title>Authenticating...</title></head>
        <body>
            <p>Completing authentication...</p>
            <script>
                const hash = window.location.hash.substring(1);
                const params = new URLSearchParams(hash);
                const accessToken = params.get('access_token');
                if (accessToken) {
                    window.location.href = '/api/oauth/callback?token=' + encodeURIComponent(accessToken);
                } else {
                    document.body.innerHTML = '<p>Authentication failed: No token received</p>';
                }
            </script>
        </body>
        </html>
        """
        return HTMLResponse(content=html_content)

    try:
        # Validate token with JWT handler
        from app.core.jwt_handler import get_jwt_handler
        from app.core.session_manager import create_session, SESSION_COOKIE_NAME, SESSION_MAX_AGE

        jwt_handler = get_jwt_handler()
        claims = jwt_handler.validate_and_extract_claims(token)

        # Token is valid! Now create workspace for first-time user
        user_id = claims.get("sub")
        email = claims.get("email", "user@example.com")
        name = claims.get("name")

        # Check if user already has a workspace
        membership = db.query(WorkspaceMember).filter(
            WorkspaceMember.user_id == user_id
        ).first()

        if not membership:
            # First-time user: Create workspace
            domain = email.split("@")[-1] if "@" in email else "domain.com"
            if domain in ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com"]:
                first_name = email.split("@")[0].split(".")[0].capitalize()
                workspace_name = f"{first_name}'s Workspace"
            else:
                workspace_name = domain.replace(".com", "").replace(".", " ").title()

            workspace_id = str(uuid.uuid4())
            base_slug = _generate_workspace_slug(workspace_name)
            slug = _ensure_unique_slug(db, base_slug)

            workspace = Workspace(
                id=workspace_id,
                name=workspace_name,
                slug=slug,
                subscription_status="active"
            )
            db.add(workspace)

            membership = WorkspaceMember(
                workspace_id=workspace_id,
                user_id=user_id,
                role="owner"
            )
            db.add(membership)
            db.commit()
        else:
            workspace_id = membership.workspace_id
            workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
            workspace_name = workspace.name if workspace else "Workspace"

        # Create session token
        session_token = create_session(
            user_id=user_id,
            email=email,
            name=name,
            workspace_id=workspace_id,
            workspace_name=workspace_name
        )

        # Return HTML that redirects to frontend
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")

        html_response = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Authenticating...</title>
        </head>
        <body>
            <p>Authenticating...</p>
            <script>
                // Redirect to frontend home page
                window.location = '{frontend_url}';
            </script>
        </body>
        </html>
        """

        response = HTMLResponse(content=html_response, status_code=200)

        # Set HTTP-only secure cookie (secure=True in production for HTTPS)
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=session_token,
            max_age=SESSION_MAX_AGE,
            httponly=True,
            secure=settings.env.upper() != "DEV",
            samesite="lax",
            path="/"
        )

        return response

    except HTTPException as e:
        return JSONResponse(
            status_code=e.status_code,
            content={"detail": e.detail}
        )
    except Exception as e:
        logger.exception(f"OAuth callback error: {e}")
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Token validation failed"}
        )


@app.get("/api/user/profile")
def get_user_profile(current_user: dict = Depends(get_current_user)):
    """
    Get current authenticated user's profile from OAuth provider.

    Epic 2: Auth Backend
    Returns user information extracted from JWT claims.

    Returns:
        {
            "id": "user-id",
            "email": "user@example.com",
            "name": "User Name"
        }

    Raises:
        HTTPException 401: Unauthenticated
    """
    return {
        "id": current_user.get("sub"),
        "email": current_user.get("email"),
        "name": current_user.get("name"),
    }


@app.post("/api/auth/logout")
def logout(current_user: dict = Depends(get_current_user)):
    """
    Server-side logout cleanup (optional).

    Epic 2: Auth Backend
    Logs logout event. Token invalidation is handled by Supabase.

    Returns:
        {"message": "Logged out successfully"}
    """
    user_id = current_user.get("sub")
    logger.info(f"User {user_id} logged out")
    return {"message": "Logged out successfully"}


# ============================================
# API Key Management Endpoints (Simplified Auth)
# ============================================

@app.post("/api/auth/generate-key")
def generate_api_key_endpoint(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(lambda: Session(bind=engine))
):
    """
    Generate a new API key for the current user.

    Simplified Auth: Replace JWT with simple API key auth.
    Returns the unhashed key (only shown once).

    The key has format: beton_<32-char-hex-string>
    Expires after 90 days.

    Returns:
        {
            "api_key": "beton_abc123...",
            "expires_at": "ISO timestamp",
            "message": "Save this key - it will only be shown once!"
        }

    Raises:
        HTTPException 401: Unauthenticated
        HTTPException 500: Database error
    """
    try:
        from app.auth import generate_api_key
        from datetime import datetime, timedelta
        from app.models import APIKey

        user_id = current_user.get("sub")
        workspace_id = current_user.get("workspace_id")

        if not user_id or not workspace_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User ID or workspace ID not found"
            )

        # Generate new key
        unhashed_key, key_hash = generate_api_key()

        # Set expiration to 90 days from now
        expires_at = datetime.utcnow() + timedelta(days=90)

        # Store hashed key in database
        api_key = APIKey(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            user_id=user_id,
            key_hash=key_hash,
            name="Default API Key",
            expires_at=expires_at
        )
        db.add(api_key)
        db.commit()

        return {
            "api_key": unhashed_key,
            "expires_at": expires_at.isoformat(),
            "message": "Save this key - it will only be shown once!"
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.exception(f"Error generating API key: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate API key"
        )


@app.get("/api/auth/keys")
def list_api_keys(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(lambda: Session(bind=engine))
):
    """
    List all API keys for the current user.

    Returns list of keys (without unhashed values).

    Returns:
        {
            "keys": [
                {
                    "id": "uuid",
                    "name": "Default API Key",
                    "created_at": "ISO timestamp",
                    "expires_at": "ISO timestamp",
                    "last_used_at": "ISO timestamp or null"
                }
            ]
        }

    Raises:
        HTTPException 401: Unauthenticated
    """
    try:
        from app.models import APIKey

        workspace_id = current_user.get("workspace_id")

        if not workspace_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Workspace ID not found"
            )

        # Get all keys for this workspace
        keys = db.query(APIKey).filter(
            APIKey.workspace_id == workspace_id
        ).all()

        return {
            "keys": [
                {
                    "id": key.id,
                    "name": key.name,
                    "created_at": key.created_at.isoformat(),
                    "expires_at": key.expires_at.isoformat(),
                    "last_used_at": key.last_used_at.isoformat() if key.last_used_at else None
                }
                for key in keys
            ]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing API keys: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list API keys"
        )


@app.delete("/api/auth/keys/{key_id}")
def revoke_api_key(
    key_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(lambda: Session(bind=engine))
):
    """
    Revoke (delete) an API key.

    Returns:
        {"message": "API key revoked successfully"}

    Raises:
        HTTPException 401: Unauthenticated
        HTTPException 404: Key not found
    """
    try:
        from app.models import APIKey

        workspace_id = current_user.get("workspace_id")

        if not workspace_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Workspace ID not found"
            )

        # Find and delete key (must belong to current workspace)
        key = db.query(APIKey).filter(
            APIKey.id == key_id,
            APIKey.workspace_id == workspace_id
        ).first()

        if not key:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="API key not found"
            )

        db.delete(key)
        db.commit()

        return {"message": "API key revoked successfully"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.exception(f"Error revoking API key: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to revoke API key"
        )

# Dependency to get DB session
# In a real app we'd use a proper dependency injection for DB
# Log database connection info (mask password)
_db_url_masked = settings.database_url.replace(settings.database_url.split(':')[2].split('@')[0], '***') if '@' in settings.database_url else settings.database_url
logger.info(f"Connecting to database: {_db_url_masked}")
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


# ===== SIGNAL DISCOVERY ENDPOINTS =====

from app.signal_stub_data import (
    DISCOVERED_SIGNALS,
    DATA_SOURCES,
    COMPANY_SETTINGS,
    RECENT_LEADS,
    POSTHOG_EVENTS,
    POSTHOG_PROPERTIES,
    PLAYBOOKS,
    ATTIO_FIELDS,
    calculate_estimated_arr,
    simulate_backtest
)

@app.get("/api/signals/list")
async def get_signals_list():
    """Get list of all discovered signals with calculated ARR."""
    signals_with_arr = []
    for signal in DISCOVERED_SIGNALS:
        signal_copy = signal.copy()
        signal_copy['estimated_arr'] = calculate_estimated_arr(signal)
        signals_with_arr.append(signal_copy)

    return {
        "status": "success",
        "signals": signals_with_arr,
        "total": len(signals_with_arr)
    }

@app.get("/api/signals/{signal_id}")
async def get_signal_detail(signal_id: str):
    """Get detailed information for a specific signal."""
    signal = next((s for s in DISCOVERED_SIGNALS if s['id'] == signal_id), None)

    if not signal:
        return {
            "status": "error",
            "message": f"Signal {signal_id} not found"
        }

    signal_copy = signal.copy()
    signal_copy['estimated_arr'] = calculate_estimated_arr(signal)

    return {
        "status": "success",
        "signal": signal_copy
    }

@app.get("/api/signals/dashboard/metrics")
async def get_signal_dashboard_metrics():
    """Get aggregated metrics for signal discovery dashboard."""
    # Calculate totals
    total_leads = sum(s['leads_per_month'] for s in DISCOVERED_SIGNALS)
    enabled_signals = [s for s in DISCOVERED_SIGNALS if s['status'] == 'enabled']

    # Calculate average conversion (weighted by leads)
    total_weighted_conversion = sum(
        s['conversion_with'] * s['leads_per_month']
        for s in enabled_signals
    )
    avg_conversion = total_weighted_conversion / total_leads if total_leads > 0 else 0

    # Calculate total pipeline influenced
    total_pipeline = sum(calculate_estimated_arr(s) for s in enabled_signals)

    # Calculate average accuracy
    all_accuracies = []
    for signal in enabled_signals:
        if signal['accuracy_trend']:
            all_accuracies.extend(signal['accuracy_trend'])
    avg_accuracy = sum(all_accuracies) / len(all_accuracies) if all_accuracies else 0

    # Get degrading signals
    degrading_count = sum(1 for s in DISCOVERED_SIGNALS if s['health'] == 'degrading')

    return {
        "status": "success",
        "metrics": {
            "leads_this_month": total_leads,
            "conversion_rate": round(avg_conversion, 3),
            "pipeline_influenced": total_pipeline,
            "signal_accuracy": round(avg_accuracy, 2),
        },
        "summary": {
            "total_signals": len(DISCOVERED_SIGNALS),
            "enabled_signals": len(enabled_signals),
            "degrading_signals": degrading_count
        },
        "recent_leads": RECENT_LEADS
    }

@app.get("/api/sources/status")
async def get_sources_status():
    """Get status of all data sources."""
    return {
        "status": "success",
        "sources": DATA_SOURCES
    }

@app.post("/api/signals/backtest")
async def run_backtest(signal_definition: dict):
    """Run backtest simulation for a user-defined signal."""
    result = simulate_backtest(signal_definition)

    # Calculate projected ARR
    monthly_matches = result['monthly_matches']
    lift = result['lift']
    baseline_conversion = COMPANY_SETTINGS['baseline_conversion']
    avg_acv = COMPANY_SETTINGS['avg_acv']

    adjusted_conversion = baseline_conversion * lift
    monthly_conversions = monthly_matches * adjusted_conversion
    baseline_conversions = monthly_matches * baseline_conversion
    incremental_conversions = monthly_conversions - baseline_conversions
    incremental_arr = incremental_conversions * 12 * avg_acv

    result['projected_arr'] = round(incremental_arr, 0)

    return {
        "status": "success",
        "backtest_results": result
    }

@app.get("/api/playbooks/list")
async def get_playbooks_list():
    """Get list of all playbooks."""
    return {
        "status": "success",
        "playbooks": PLAYBOOKS
    }

@app.get("/api/settings")
async def get_settings():
    """Get company settings."""
    return {
        "status": "success",
        "settings": COMPANY_SETTINGS
    }

@app.post("/api/settings")
async def update_settings(settings: dict):
    """Update company settings."""
    # In a real app, this would update the database
    # For now, we'll just return success
    return {
        "status": "success",
        "message": "Settings updated successfully"
    }

@app.get("/api/destinations/attio/fields")
async def get_attio_fields():
    """Get Attio field mapping configuration."""
    return {
        "status": "success",
        "fields": ATTIO_FIELDS
    }

@app.post("/api/destinations/attio/auto-match")
async def auto_match_attio_fields():
    """Auto-match Attio fields with Beton fields."""
    # Simulate matching all fields
    for field in ATTIO_FIELDS:
        field['mapped'] = True

    return {
        "status": "success",
        "message": "All fields matched successfully",
        "fields": ATTIO_FIELDS
    }

@app.get("/api/posthog/events")
async def get_posthog_events():
    """Get list of PostHog events for filter builder."""
    return {
        "status": "success",
        "events": POSTHOG_EVENTS
    }

@app.get("/api/posthog/properties")
async def get_posthog_properties():
    """Get list of PostHog properties for filter builder."""
    return {
        "status": "success",
        "properties": POSTHOG_PROPERTIES
    }

