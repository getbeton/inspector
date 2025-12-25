# Beton Railway Scripts

Scripts for managing Railway preview environments and testing services.

## Prerequisites

1. **Install Railway CLI**:
   ```bash
   curl -fsSL https://railway.app/install.sh | sh
   ```

2. **Authenticate with Railway** (local mode):
   ```bash
   railway login
   ```

   Or set CI environment variables:
   ```bash
   export RAILWAY_TOKEN=<your-ci-token>
   export RAILWAY_PROJECT_ID=<your-project-id>
   ```

## Scripts

### `railway_preview_env.sh`

Creates or updates a Railway preview environment for a feature branch.

**Works both locally and in CI:**
- **Local mode**: Uses `railway login` authentication
- **CI mode**: Uses `RAILWAY_TOKEN` and `RAILWAY_PROJECT_ID` secrets

#### Usage

```bash
# Create and deploy preview environment (recommended)
BRANCH_NAME=feature/beton-revops-dashboards bash scripts/railway_preview_env.sh

# Create environment only (skip deployment)
BRANCH_NAME=feature/beton-revops-dashboards SKIP_DEPLOY=1 bash scripts/railway_preview_env.sh

# Create environment only, skip health checks
BRANCH_NAME=feature/beton-revops-dashboards SKIP_HEALTH_CHECK=1 bash scripts/railway_preview_env.sh

# Print environment name only
BRANCH_NAME=feature/beton-revops-dashboards PRINT_ENV_NAME_ONLY=1 bash scripts/railway_preview_env.sh
```

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BRANCH_NAME` | Required | Git branch name (e.g., `feature/foo-bar`) |
| `BASE_ENV_NAME` | `staging` | Base environment to duplicate from |
| `FRONTEND_SERVICE_NAME` | `frontend` | Frontend service name |
| `FRONTEND_API_URL` | `http://backend.railway.internal:8000` | Backend URL for frontend |
| `SKIP_DEPLOY` | `0` | Set to `1` to skip service deployment |
| `SKIP_HEALTH_CHECK` | `0` | Set to `1` to skip health checks |
| `PRINT_ENV_NAME_ONLY` | `0` | Set to `1` to print environment name and exit |
| `RAILWAY_TOKEN` | (optional) | CI token (for CI mode) |
| `RAILWAY_PROJECT_ID` | (optional) | Project ID (for CI mode) |

#### How It Works

1. **Sanitizes branch name** → `pr-<sanitized-name>`
   - `feature/beton-revops-dashboards` → `pr-beton-revops-dashboards`
   - Max 25 characters (Railway limit)

2. **Creates environment** (if doesn't exist)
   - Duplicates from `BASE_ENV_NAME` (default: `staging`)
   - Inherits all services and configuration

3. **Configures frontend**
   - Sets `API_URL` environment variable
   - Connects frontend to backend via internal network

4. **Deploys services**
   - Deploys backend (FastAPI)
   - Deploys frontend (Streamlit)
   - Shows logs for verification

5. **Health checks**
   - Displays last 10 lines of logs
   - Confirms services are running

#### Output Example

```
ℹ️  Railway Preview Environment Setup
ℹ️  Branch: feature/beton-revops-dashboards
ℹ️  Environment: pr-beton-revops
ℹ️  Base: staging
ℹ️  Running in local mode (using authenticated CLI)

ℹ️  Checking if environment exists: pr-beton-revops
⚠️  Environment already exists: pr-beton-revops
ℹ️  Switching to environment: pr-beton-revops
ℹ️  Configuring frontend service...
✅ Frontend API_URL set: http://backend.railway.internal:8000

ℹ️  Deploying services to pr-beton-revops...

ℹ️  Deploying backend...
✅ backend deployed

ℹ️  Deploying frontend...
✅ frontend deployed

========================================
✅ Environment ready: pr-beton-revops
==========================================

ℹ️  To view logs:
ℹ️    railway logs --service backend
ℹ️    railway logs --service frontend

ℹ️  To switch to this environment:
ℹ️    railway environment pr-beton-revops

ℹ️  To view in Railway dashboard:
ℹ️    https://railway.app/project
```

### `test_api.sh`

Tests if Railway services are running and responding.

#### Usage

```bash
# Test backend service (default)
./scripts/test_api.sh

# Test specific environment and service
./scripts/test_api.sh pr-beton-revops backend
./scripts/test_api.sh pr-beton-revops frontend

# With custom environment
ENV_NAME=pr-beton-revops SERVICE_NAME=backend bash scripts/test_api.sh
```

#### Output Example

```
ℹ️  Testing Railway Service
ℹ️  Environment: pr-beton-revops
ℹ️  Service: backend

ℹ️  Verifying environment exists...
✅ Environment found: pr-beton-revops

ℹ️  Switching to environment...

ℹ️  Service Status
ℹ️  ==============

ℹ️  Checking logs for backend...
Starting Container
INFO:     Started server process [1]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8080 (Press CTRL+C to quit)

✅ backend is running

ℹ️  Backend expected logs:
ℹ️    'Uvicorn running on http://0.0.0.0:8080'
ℹ️    'Application startup complete'

ℹ️  Internal endpoint: http://backend.railway.internal:8000
ℹ️  Note: API is only accessible from within Railway network

========================================
✅ Service test complete
==========================================
```

## Common Workflows

### 1. Create Preview Environment for Feature Branch

```bash
# Step 1: Ensure you're on the feature branch
git checkout feature/my-feature
git push origin feature/my-feature

# Step 2: Create preview environment
BRANCH_NAME=feature/my-feature bash scripts/railway_preview_env.sh

# Step 3: Wait for deployment to complete (3-5 minutes)

# Step 4: View logs
railway logs --service backend
railway logs --service frontend
```

### 2. Update Existing Preview Environment

```bash
# Make code changes and push
git add .
git commit -m "Update feature"
git push origin feature/my-feature

# Re-run deployment script (will skip env creation, just redeploy services)
BRANCH_NAME=feature/my-feature bash scripts/railway_preview_env.sh
```

### 3. Switch Between Environments

```bash
# List environments
railway environment list

# Switch to preview
railway environment pr-beton-revops
railway status

# Switch to staging
railway environment staging
railway status
```

### 4. View Service Logs

```bash
# Current environment logs
railway logs --service backend --lines 50
railway logs --service frontend --lines 50

# Follow logs (tail -f style)
railway logs --service backend --follow
```

### 5. Run in CI/GitHub Actions

The script auto-detects CI mode when `RAILWAY_TOKEN` and `RAILWAY_PROJECT_ID` are set:

```yaml
# .github/workflows/preview_env.yml
env:
  RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
  RAILWAY_PROJECT_ID: ${{ secrets.RAILWAY_PROJECT_ID }}
  BRANCH_NAME: ${{ github.ref_name }}
  BASE_ENV_NAME: staging

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bash scripts/railway_preview_env.sh
```

## Troubleshooting

### "RAILWAY_TOKEN is required"

**Problem**: Script can't find authentication.

**Solution**:
- For local: Run `railway login` first
- For CI: Add `RAILWAY_TOKEN` and `RAILWAY_PROJECT_ID` secrets to GitHub

### "Environment already exists"

**Problem**: Environment was already created.

**Solution**: This is fine! The script will just reconfigure and redeploy.

### "Failed to create environment"

**Problem**: Environment creation failed.

**Solutions**:
- Check Railway dashboard for any errors
- Try creating manually: `railway environment new pr-test --duplicate staging`
- Check if you have permission to create environments

### "Could not set API_URL"

**Problem**: Frontend service doesn't exist yet.

**Solution**: This warning is normal. The variable will be set once the service is created.

### Logs not showing

**Problem**: Can't see service logs.

**Solution**:
- Make sure you're in the right environment: `railway status`
- Services may still be starting: `railway logs --service backend --lines 100 | head -20`

## Local Development

### Create preview environment for local testing

```bash
# Create environment
BRANCH_NAME=feature/test-local bash scripts/railway_preview_env.sh

# View logs while developing
railway logs --service backend --follow

# Make code changes and push
git push origin feature/test-local

# Redeploy
BRANCH_NAME=feature/test-local bash scripts/railway_preview_env.sh
```

### Compare with staging

```bash
# Check staging
railway environment staging
railway logs --service backend

# Check preview
railway environment pr-test-local
railway logs --service backend

# Compare side-by-side in multiple terminals
```

## See Also

- [Railway CLI Docs](https://docs.railway.app/cli)
- [DEPLOYMENT.md](../DEPLOYMENT.md) - Full deployment workflow
- [GitHub Workflows](.github/workflows/) - CI/CD configuration
