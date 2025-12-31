# Epic 1-3 Testing Guide

## Quick Verification Tests ✅

All Python files compile successfully:
```bash
# Backend
python3 -m py_compile backend/app/models.py
python3 -m py_compile backend/app/auth.py
python3 -m py_compile backend/app/main.py
python3 -m py_compile backend/alembic/versions/4d1a2b3c4d5e_add_authentication_and_multitenancy.py

# Frontend
python3 -m py_compile frontend/components/auth.py
python3 -m py_compile frontend/components/oauth.py

# Result: ✅ All syntax valid
```

## Full Environment Setup & Testing

### Step 1: Install Dependencies

```bash
# Backend dependencies
cd backend
pip install -r requirements.txt
# This installs: fastapi, sqlalchemy, alembic, pydantic, psycopg2, etc.

# Frontend dependencies
cd ../frontend
pip install -r requirements.txt
# This installs: streamlit, requests, etc.
```

### Step 2: Configure Environment

Create `.env` file in project root:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/beton

# Supabase (for real OAuth testing)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Frontend
FRONTEND_URL=http://localhost:8501
API_URL=http://localhost:8000

# Development
ENVIRONMENT=development
```

### Step 3: Run Database Migrations

```bash
cd backend

# Check migration file
alembic current  # Should show current revision

# Apply migrations
alembic upgrade head
# Output should show:
#   INFO  [alembic.runtime.migration] Running upgrade 3c9d56f82e10 -> 4d1a2b3c4d5e

# Verify tables created
psql $DATABASE_URL -c "\dt"
# Should show: workspaces, workspace_members, vault_secrets, tracked_identities
```

### Step 4: Test Backend API

**Option 1: Using Docker Compose (Recommended)**
```bash
# Start all services
docker-compose up

# In another terminal, wait for services to be ready
sleep 5

# Run migrations
docker-compose exec backend alembic upgrade head

# Test health check
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

**Option 2: Manual Start**
```bash
# Terminal 1: Start PostgreSQL
brew services start postgresql
# or
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password postgres:15

# Terminal 2: Start backend
cd backend
python3 -m uvicorn app.main:app --reload --port 8000

# Terminal 3: Start frontend
cd frontend
streamlit run Home.py
```

### Step 5: Test Authentication Flow

#### Test 1: Mock OAuth (No Supabase Required)

1. Open browser: http://localhost:8501
2. Click "Development: Mock OAuth"
3. Click "Simulate Google OAuth"
4. **Expected Result:**
   - ✅ Login successful message
   - ✅ Workspace created
   - ✅ Authenticated sidebar shows workspace info
   - ✅ Logout button appears

#### Test 2: Real OAuth (Requires Supabase)

1. Set up Supabase project: https://supabase.com
2. Configure environment variables with real credentials
3. Set up OAuth providers in Supabase:
   - Google OAuth from Google Cloud Console
   - Microsoft OAuth from Azure Active Directory
4. Open http://localhost:8501
5. Click "Sign in with Google" or "Sign in with Microsoft"
6. **Expected Result:**
   - ✅ Redirected to OAuth provider
   - ✅ Log in with your credentials
   - ✅ Redirected back to app
   - ✅ Authenticated with workspace created

### Step 6: Test API Endpoints

#### Test Workspace Creation Endpoint

```bash
# Get mock user token (in DEV mode, use any token)
MOCK_TOKEN="Bearer mock-token"

# Test workspace endpoint
curl -H "Authorization: $MOCK_TOKEN" \
  http://localhost:8000/api/user/workspace

# Expected Response:
# {
#   "workspace": {
#     "id": "uuid",
#     "name": "Generated Workspace Name",
#     "slug": "workspace-slug",
#     "created_at": "2025-01-15T..."
#   },
#   "isNew": true
# }

# Call again - should get same workspace
curl -H "Authorization: $MOCK_TOKEN" \
  http://localhost:8000/api/user/workspace

# Expected: isNew = false (existing workspace)
```

#### Test User Profile Endpoint

```bash
curl -H "Authorization: $MOCK_TOKEN" \
  http://localhost:8000/api/user/profile

# Expected Response:
# {
#   "id": "mock-user-id",
#   "email": "mock@example.com",
#   "name": null
# }
```

#### Test Logout Endpoint

```bash
curl -X POST -H "Authorization: $MOCK_TOKEN" \
  http://localhost:8000/api/auth/logout

# Expected Response:
# {"message": "Logged out successfully"}
```

### Step 7: Test Database Tables

```bash
# Connect to database
psql $DATABASE_URL

# Check workspaces table
SELECT * FROM workspaces;
# Expected: Workspace created with ID, name, slug

# Check workspace_members table
SELECT * FROM workspace_members;
# Expected: User linked to workspace with role='owner'

# Check vault_secrets table
SELECT id, workspace_id, name FROM vault_secrets;
# (Empty initially - populated in Epic 6)

# Check tracked_identities table
SELECT id, workspace_id FROM tracked_identities;
# (Empty initially - populated in Epic 8)
```

### Step 8: Verify Models and Indexes

```bash
# In PostgreSQL
\d workspaces
\d workspace_members
\d vault_secrets
\d tracked_identities

# Check indexes
\di

# Should see:
# - ix_workspaces_slug
# - ix_vault_secrets_workspace_name
# - ix_tracked_identities_workspace_person
# - ix_tracked_identities_workspace_active
```

## Test Checklist

### Database
- [ ] Migration applies cleanly (`alembic upgrade head`)
- [ ] All 4 new tables created
- [ ] Foreign key relationships working
- [ ] Indexes created correctly
- [ ] Unique constraints enforced

### Authentication Backend
- [ ] JWT verification works in DEV mode
- [ ] Token verification works in PROD mode (with SUPABASE_JWT_SECRET)
- [ ] `/api/user/workspace` creates workspace for new users
- [ ] `/api/user/workspace` returns existing workspace for repeat users
- [ ] `/api/user/profile` returns user info
- [ ] `/api/auth/logout` returns success message

### Login UI
- [ ] Login page displays when not authenticated
- [ ] Mock OAuth buttons work
- [ ] Real OAuth buttons redirect correctly
- [ ] Session state persists across page refreshes
- [ ] Logout clears session
- [ ] Authenticated sidebar shows workspace name

### Data Integrity
- [ ] Workspace created atomically (both workspace and member created)
- [ ] Workspace slug auto-generated and unique
- [ ] User automatically set as owner role
- [ ] Cannot see other users' workspaces
- [ ] Deleting workspace cascades to members

## Troubleshooting

### "ModuleNotFoundError: No module named 'fastapi'"
**Solution:** Install dependencies
```bash
cd backend && pip install -r requirements.txt
cd ../frontend && pip install -r requirements.txt
```

### "No such table: workspaces"
**Solution:** Run migrations
```bash
cd backend
alembic upgrade head
```

### "SUPABASE_JWT_SECRET not found"
**Solution:** Set environment variable or run in DEV mode
```bash
export SUPABASE_JWT_SECRET="your-secret"
# OR
export ENVIRONMENT=development
```

### "Port 8000 already in use"
**Solution:** Use different port
```bash
python3 -m uvicorn app.main:app --port 8001
```

### "Port 8501 already in use"
**Solution:** Use different port
```bash
streamlit run Home.py --server.port=8502
```

### OAuth redirect not working
**Solution:** Check SUPABASE_URL and OAuth configuration
```bash
# Verify credentials
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY

# Check Supabase dashboard for OAuth provider setup
```

## Test Data

### Mock User (DEV Mode)
```
User ID: mock-user-id
Email: mock@example.com
Name: Developer
Role: admin
```

### Auto-Generated Workspace
```
Name: {domain name} (e.g., "Acme Corp")
Slug: acme-corp
Owner: First user who logs in
```

## Performance Test

```bash
# Test workspace creation speed
time curl -H "Authorization: Bearer test-token" \
  http://localhost:8000/api/user/workspace

# Expected: <100ms response time
```

## Security Test

```bash
# Test invalid token rejection
curl -H "Authorization: Bearer invalid-token" \
  http://localhost:8000/api/user/workspace

# Expected: 401 Unauthorized

# Test missing token rejection
curl http://localhost:8000/api/user/workspace

# Expected: 401 Unauthorized (missing auth)
```

## Next Steps

Once testing passes:
1. Commit changes to git
2. Push to feature branch
3. Create PR for review
4. Deploy to staging
5. Run integration tests
6. Merge to main
7. Deploy to production
8. Begin Epic 4: Stripe Billing

---

**Testing Status:** Ready for local testing! ✅

All files compile successfully and are ready to be tested with full dependencies installed.
