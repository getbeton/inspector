---
description: Add a new third-party integration (PostHog, Stripe, Apollo pattern)
globs:
  - "backend/app/integrations/*.py"
  - "backend/app/config.py"
  - "backend/app/services/sync.py"
---

# /add-integration - Add New Third-Party Integration

Use this skill to add a new integration following Beton's established patterns (PostHog, Stripe, Apollo, Attio).

## Workflow

### Step 1: Create the integration client

Create `backend/app/integrations/<service>_client.py`:

```python
"""
<Service> integration client.

Handles authentication and API communication with <Service>.
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime

import httpx

logger = logging.getLogger(__name__)


class <Service>Error(Exception):
    """Base exception for <Service> API errors."""
    pass


class <Service>AuthError(<Service>Error):
    """Authentication failed."""
    pass


class <Service>Client:
    """
    Client for <Service> API.

    Usage:
        client = <Service>Client(api_key="...")
        data = client.get_<entity>()
    """

    BASE_URL = "https://api.<service>.com/v1"

    def __init__(self, api_key: str, **kwargs):
        """
        Initialize client.

        Args:
            api_key: <Service> API key
        """
        self.api_key = api_key
        self._client = httpx.Client(
            base_url=self.BASE_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0
        )

    def _request(
        self,
        method: str,
        path: str,
        **kwargs
    ) -> Dict[str, Any]:
        """Make authenticated request."""
        try:
            response = self._client.request(method, path, **kwargs)

            if response.status_code == 401:
                raise <Service>AuthError("Invalid API key")

            response.raise_for_status()
            return response.json()

        except httpx.HTTPStatusError as e:
            logger.error(f"<Service> API error: {e}")
            raise <Service>Error(f"API error: {e.response.status_code}")

    def health_check(self) -> Dict[str, Any]:
        """Check API connectivity."""
        try:
            # Call a lightweight endpoint to verify credentials
            self._request("GET", "/me")
            return {"healthy": True, "status": "connected"}
        except <Service>AuthError as e:
            return {"healthy": False, "status": "auth_error", "error": str(e)}
        except Exception as e:
            return {"healthy": False, "status": "error", "error": str(e)}

    def get_<entities>(self, limit: int = 100) -> List[Dict]:
        """
        Fetch <entities> from <Service>.

        Args:
            limit: Maximum records to fetch

        Returns:
            List of <entity> records
        """
        return self._request("GET", "/<entities>", params={"limit": limit})

    # Add more methods as needed...


def get_<service>_client(
    db,
    config_manager
) -> <Service>Client:
    """
    Factory function to create <Service>Client from stored config.

    Args:
        db: Database session
        config_manager: ConfigManager instance

    Returns:
        Configured <Service>Client

    Raises:
        ValueError: If integration not configured
    """
    config = config_manager.get_integration("<service>")

    if not config or not config.get("api_key"):
        raise ValueError("<Service> integration not configured")

    return <Service>Client(api_key=config["api_key"])
```

### Step 2: Add configuration settings

Add to `backend/app/config.py`:

```python
class Settings(BaseSettings):
    # ... existing settings ...

    # <Service> Integration (optional - loaded from DB)
    <service>_api_key: Optional[str] = None

    class Config:
        env_file = ".env"
```

### Step 3: Create API endpoints

Create `backend/app/api/endpoints/<service>.py`:

```python
"""<Service> integration endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user
from app.core.config_manager import ConfigManager
from app.core.encryption import EncryptionService
from app.config import settings
from app.integrations.<service>_client import (
    <Service>Client,
    <Service>Error,
    <Service>AuthError,
    get_<service>_client
)

router = APIRouter(prefix="/<service>", tags=["<service>"])


@router.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """Check <Service> connection health."""
    try:
        encryption = EncryptionService(settings.beton_encryption_key)
        config_manager = ConfigManager(db, encryption)
        client = get_<service>_client(db, config_manager)
        return client.health_check()
    except ValueError as e:
        return {"healthy": False, "status": "not_configured", "error": str(e)}
    except Exception as e:
        return {"healthy": False, "status": "error", "error": str(e)}


@router.post("/configure")
async def configure_integration(
    api_key: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Configure <Service> integration."""
    # Validate API key by making a test request
    try:
        client = <Service>Client(api_key=api_key)
        health = client.health_check()

        if not health["healthy"]:
            raise HTTPException(400, f"Invalid API key: {health.get('error')}")

    except <Service>AuthError as e:
        raise HTTPException(401, str(e))

    # Store encrypted API key
    encryption = EncryptionService(settings.beton_encryption_key)
    config_manager = ConfigManager(db, encryption)
    config_manager.set_integration("<service>", {
        "api_key": api_key,
        "configured_at": datetime.utcnow().isoformat(),
        "configured_by": current_user.id
    })

    return {"message": "<Service> configured successfully"}
```

### Step 4: Register the router

Add to `backend/app/main.py`:

```python
from app.api.endpoints.<service> import router as <service>_router

app.include_router(<service>_router, prefix="/api")
```

### Step 5: Add sync service (if data sync needed)

Create `backend/app/services/<service>_sync.py`:

```python
"""Sync service for <Service> data."""
from typing import List, Dict
from sqlalchemy.orm import Session

from app.integrations.<service>_client import <Service>Client


class <Service>SyncService:
    """Syncs data between <Service> and Beton."""

    def __init__(self, db: Session, client: <Service>Client):
        self.db = db
        self.client = client

    def sync_<entities>(self, limit: int = 1000) -> Dict:
        """
        Sync <entities> from <Service>.

        Returns:
            Sync result summary
        """
        # Fetch from <Service>
        records = self.client.get_<entities>(limit=limit)

        # Process and store
        synced = 0
        errors = 0

        for record in records:
            try:
                self._upsert_<entity>(record)
                synced += 1
            except Exception as e:
                errors += 1

        self.db.commit()

        return {
            "total": len(records),
            "synced": synced,
            "errors": errors
        }

    def _upsert_<entity>(self, data: Dict):
        """Upsert a single <entity> record."""
        # Implementation
        pass
```

### Step 6: Add UI in Next.js settings

Add to `frontend-nextjs/src/app/(dashboard)/settings/integrations/page.tsx`:

```tsx
// Add <Service> integration card
<IntegrationCard
  name="<Service>"
  description="Connect to <Service> for <purpose>"
  icon={<ServiceIcon />}
  connected={integrations.<service>?.connected}
  onConfigure={() => configure<Service>()}
/>
```

---

## Reference Implementations

| Integration | Client File | Purpose |
|-------------|-------------|---------|
| PostHog | `posthog.py` | Analytics events, persons |
| Stripe | `stripe.py` | Payment, subscription data |
| Apollo | `apollo.py` | Company enrichment |
| Attio | `attio_client.py` | CRM sync (most comprehensive example) |

---

## Security Notes

1. **API keys are encrypted** using `EncryptionService` before storage
2. **Never log API keys** - use masked versions for debugging
3. **Validate keys** before storing by making a test API call
4. **Workspace isolation** - each workspace has its own integration config

---

## Checklist

- [ ] Created client in `backend/app/integrations/<service>_client.py`
- [ ] Added settings to `backend/app/config.py`
- [ ] Created API endpoints in `backend/app/api/endpoints/<service>.py`
- [ ] Registered router in `backend/app/main.py`
- [ ] Added sync service (if needed) in `backend/app/services/<service>_sync.py`
- [ ] Added UI in Next.js settings page
- [ ] Added tests for client and endpoints
- [ ] Documented required API key/scopes in README
