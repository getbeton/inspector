---
description: Create Railway preview environment for a feature branch
globs:
  - "scripts/railway_preview_env.sh"
  - ".github/workflows/preview_env.yml"
---

# /preview-env - Railway Preview Environment

Use this skill to create or update a Railway preview environment for testing a feature branch.

## Quick Start

```bash
# Set your branch name and run the script
BRANCH_NAME=feature/my-feature bash scripts/railway_preview_env.sh
```

## What It Does

1. **Sanitizes branch name** → `feature/my-thing` becomes `pr-feature-my-thing` (max 25 chars)
2. **Creates Railway environment** duplicated from staging
3. **Configures services** (backend + frontend) with correct URLs
4. **Runs health checks** (optional)

## Usage Options

### Basic usage
```bash
BRANCH_NAME=feature/my-feature bash scripts/railway_preview_env.sh
```

### Skip deployment (env only)
```bash
SKIP_DEPLOY=1 BRANCH_NAME=feature/my-feature bash scripts/railway_preview_env.sh
```

### Skip health checks
```bash
SKIP_HEALTH_CHECK=1 BRANCH_NAME=feature/my-feature bash scripts/railway_preview_env.sh
```

### Use different base environment
```bash
BASE_ENV=production BRANCH_NAME=feature/my-feature bash scripts/railway_preview_env.sh
```

## CI Mode vs Local Mode

### CI Mode (GitHub Actions)
Requires environment variables:
- `RAILWAY_TOKEN` - Railway API token
- `RAILWAY_PROJECT_ID` - Project ID

The script auto-detects CI mode when `RAILWAY_TOKEN` is set.

### Local Mode
Requires Railway CLI to be authenticated:
```bash
railway login
railway link <project-id>
```

## Environment Naming

| Branch Name | Railway Environment |
|-------------|---------------------|
| `feature/my-thing` | `pr-feature-my-thing` |
| `feature/BETON-123-long-description-here` | `pr-feature-beton-123-lo` (truncated) |
| `fix/oauth-callback` | `pr-fix-oauth-callback` |

**Note**: Railway environment names are limited to 25 characters.

## Testing the Preview

After creation, test your preview environment:

```bash
# Check backend health
./scripts/test_api.sh pr-feature-my-thing backend

# Check frontend
./scripts/test_api.sh pr-feature-my-thing frontend

# View logs
railway environment pr-feature-my-thing
railway logs --service backend
```

## Cleanup

Preview environments are automatically cleaned up when PR is merged.

Manual cleanup:
```bash
BRANCH_NAME=feature/my-feature bash scripts/railway_preview_cleanup.sh
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Environment not creating | Check branch name length (max 25 chars) |
| Services not deploying | Check `railway logs --service backend` |
| Frontend can't reach backend | Verify `API_URL=http://backend.railway.internal:8080` |

## Reference

- Script: `scripts/railway_preview_env.sh`
- Cleanup: `scripts/railway_preview_cleanup.sh`
- See `DEPLOYMENT.md` section 2.3 for full documentation
