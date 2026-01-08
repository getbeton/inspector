---
description: Scaffold a new FastAPI endpoint with Pydantic models and tests
globs:
  - "backend/app/api/endpoints/*.py"
  - "backend/app/main.py"
  - "backend/tests/*.py"
---

# /add-endpoint - Add New API Endpoint

Use this skill to create a new FastAPI endpoint following Beton's established patterns.

## Workflow

### Step 1: Create the endpoint file

Create `backend/app/api/endpoints/<module>.py`:

```python
"""
<Module Name> API endpoints.

Provides endpoints for:
- <List key functionality>
"""
import logging
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.config import settings
from app.database import get_db
from app.auth import get_current_user
from app.models import User  # Add other models as needed

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/<module>", tags=["<module>"])


# ============================================
# Response Models
# ============================================

class <Entity>Response(BaseModel):
    id: int
    # Add fields
    created_at: datetime


class <Entity>CreateRequest(BaseModel):
    # Add fields for creation
    pass


# ============================================
# Endpoints
# ============================================

@router.get("/", response_model=List[<Entity>Response])
async def list_<entities>(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List all <entities>.

    Returns paginated list of <entities> for the current workspace.
    """
    # Implementation
    pass


@router.get("/{<entity>_id}", response_model=<Entity>Response)
async def get_<entity>(
    <entity>_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a single <entity> by ID."""
    # Implementation
    pass


@router.post("/", response_model=<Entity>Response)
async def create_<entity>(
    request: <Entity>CreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new <entity>."""
    # Implementation
    pass
```

### Step 2: Register the router

Add to `backend/app/main.py`:

```python
from app.api.endpoints.<module> import router as <module>_router

# In the router includes section:
app.include_router(<module>_router, prefix="/api")
```

### Step 3: Add Pydantic models (if complex)

For complex request/response models, consider adding to `backend/app/schemas/<module>.py`:

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class <Entity>Base(BaseModel):
    """Base model with shared fields."""
    name: str = Field(..., min_length=1, max_length=255)
    # Add other fields


class <Entity>Create(<Entity>Base):
    """Request model for creating."""
    pass


class <Entity>Response(<Entity>Base):
    """Response model with DB fields."""
    id: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
```

### Step 4: Create tests

Add `backend/tests/test_<module>.py`:

```python
"""Tests for <module> endpoints."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

from app.main import app

client = TestClient(app)


class Test<Module>Endpoints:
    """Test suite for <module> endpoints."""

    def test_list_<entities>_success(self):
        """Test listing <entities>."""
        # Mock auth
        with patch("app.auth.get_current_user") as mock_user:
            mock_user.return_value = MagicMock(id=1, workspace_id=1)

            response = client.get("/api/<module>/")

            assert response.status_code == 200
            assert isinstance(response.json(), list)

    def test_get_<entity>_not_found(self):
        """Test getting non-existent <entity>."""
        with patch("app.auth.get_current_user") as mock_user:
            mock_user.return_value = MagicMock(id=1, workspace_id=1)

            response = client.get("/api/<module>/99999")

            assert response.status_code == 404

    def test_create_<entity>_success(self):
        """Test creating <entity>."""
        with patch("app.auth.get_current_user") as mock_user:
            mock_user.return_value = MagicMock(id=1, workspace_id=1)

            response = client.post(
                "/api/<module>/",
                json={"name": "Test <Entity>"}
            )

            assert response.status_code in [200, 201]
```

### Step 5: Update API client (frontend)

Add to `frontend-nextjs/src/lib/api/<module>.ts`:

```typescript
import { apiClient } from './client';

export interface <Entity> {
  id: number;
  // Add fields
  created_at: string;
}

export interface Create<Entity>Request {
  // Add fields
}

export const <module>Api = {
  list: () => apiClient.get<Entity[]>('/api/<module>/'),

  get: (id: number) => apiClient.get<Entity>(`/api/<module>/${id}`),

  create: (data: Create<Entity>Request) =>
    apiClient.post<Entity>('/api/<module>/', data),
};
```

---

## Reference Pattern

See `backend/app/api/endpoints/attio.py` for a comprehensive example with:
- Response models (Pydantic)
- Error handling (HTTPException)
- Background tasks
- Health checks
- Logging

---

## Checklist

- [ ] Created endpoint file in `backend/app/api/endpoints/`
- [ ] Registered router in `backend/app/main.py`
- [ ] Added Pydantic request/response models
- [ ] Created tests in `backend/tests/`
- [ ] Updated frontend API client
- [ ] Tested locally with `docker-compose exec backend pytest`

---

## Common Patterns

### Workspace isolation (multi-tenant)
```python
@router.get("/")
async def list_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(Item).filter(
        Item.workspace_id == current_user.workspace_id
    ).all()
```

### Error handling
```python
from fastapi import HTTPException

if not item:
    raise HTTPException(status_code=404, detail="Item not found")

if not current_user.can_edit(item):
    raise HTTPException(status_code=403, detail="Not authorized")
```

### Background tasks
```python
from fastapi import BackgroundTasks

@router.post("/sync")
async def trigger_sync(background_tasks: BackgroundTasks):
    background_tasks.add_task(run_sync_job)
    return {"message": "Sync started"}
```
