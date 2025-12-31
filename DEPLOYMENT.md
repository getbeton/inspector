# Deployment workflow (Railway staging + production)

This repo is deployed via Railway GitHub integration with **two Railway environments**:
- **staging** (deploys from the `staging` branch)
- **production** (deploys from the `main` branch)

There are **two Railway services**:
- `backend` (FastAPI)
- `frontend` (Streamlit)

## 1) One-time Railway setup (required)

### 1.1 Map branches to Railway environments

In Railway, for **each service** (`backend`, `frontend`):
- In **staging** environment: set deploy branch to `staging`
- In **production** environment: set deploy branch to `main`

This guarantees:
- Every merge into `staging` updates staging automatically.
- Every merge into `main` updates production automatically.

### 1.2 Environment variables must be per-environment

Make sure staging and production have separate values.

Examples:
- `API_URL` (frontend) should point at the backend URL **in the same environment**.
  - staging frontend `API_URL` → staging backend URL
  - production frontend `API_URL` → production backend URL

## 2) Day-to-day Git workflow

### 2.1 Feature work

- Create a branch from `staging` (example: `feature/fix-signal-backtest-link`)
- Open a PR into `staging`
- CI must be green before merging

Local pre-push checks (recommended):
- `npm run build`
- `npm test`

### 2.3 Preview environments for feature branches (automatic)

When you push to a branch matching `feature/**`, GitHub Actions will:
- Create (or re-use) a Railway environment derived from the branch name (duplicated from `staging`)
- Deploy `backend` + `frontend` into that environment

When a PR is merged into `staging`, GitHub Actions will:
- Delete the corresponding Railway preview environment

Workflows:
- `.github/workflows/preview_env.yml`
- `.github/workflows/preview_env_cleanup.yml`

Required GitHub secrets:
- `RAILWAY_TOKEN` (Railway CI token)
- `RAILWAY_PROJECT_ID` (Railway project id)

Naming rule:
- Branch `feature/my-thing` -> Railway env `pr-feature-my-thing` (sanitized + truncated)

### 2.2 Release to production (promotion)

Production release is a **PR from `staging` → `main`**.

Checklist:
1. Confirm Railway **staging** environment is healthy after the last merge.
2. Open PR: `staging` → `main`.
3. Wait for CI to pass.
4. Merge PR.
5. Railway deploys production automatically from `main`.
6. Validate key pages in production (Signals list, Signal detail, Settings).

#### 2.2.1 Post-release: ensure `staging` is “empty” (equals `main`)

Goal: immediately after a production promotion, **`staging` should match `main`**.

Why:
- Keeps `staging` as a clean base for the next feature branch.
- If GitHub created a merge commit on `main`, syncing avoids `staging` and `main` drifting.

Run:
- `./scripts/sync_staging_to_main.sh`

## 3) Database migrations (backend) – AUTOMATED

This repo uses Alembic migrations (`backend/alembic/`) with **automated deployment**.

### How automated migrations work

When you merge a PR containing new migration files (`backend/alembic/versions/*.py`):

1. Railway auto-deploys the code to staging/production
2. GitHub Actions waits for deployment to complete (~2 minutes)
3. `alembic upgrade head` runs automatically via Railway CLI
4. Migration status is logged in the workflow run

**Workflow file**: `.github/workflows/deploy-migrations.yml`

### Monitoring migrations

- Check GitHub Actions tab for `Deploy Migrations` workflow runs
- Each run shows before/after migration status
- Failed migrations do NOT block future deploys (manual intervention required)

### Manual fallback

If automated migrations fail, run manually:

```bash
# Install Railway CLI (if not installed)
curl -fsSL https://railway.app/install.sh | sh

# Link project (one-time setup)
railway link <project-id>

# For staging
railway environment staging
railway run --service backend -- alembic upgrade head

# For production
railway environment production
railway run --service backend -- alembic upgrade head
```

### "Do we have migrations in this release?"

Before promoting to production, check if `backend/alembic/versions/` contains new migration files.
The `Deploy Migrations` workflow only triggers when migration files change.

### Rollback guidance (use with caution)

If a migration breaks production, you usually need two actions:
1. Roll back the application deploy (Railway) to a previous working version.
2. Decide whether the database schema needs to be rolled back.

Alembic commands that help diagnose state:
```bash
railway run --service backend -- alembic current
railway run --service backend -- alembic history --verbose
```

Schema rollback is risky (especially if new columns/tables are already used). Only downgrade if you're sure it's safe:
```bash
railway run --service backend -- alembic downgrade -1
```

### Migration design rule (recommended)

Prefer **backward-compatible** migrations whenever possible (add columns/tables first, deploy code after).
This reduces the chance that staging/production get stuck in a half-upgraded state.

## 4) Required GitHub protections (MANDATORY)

To keep production safe:
- Protect `main`: no direct pushes, require PRs + CI.
- Protect `staging`: require PRs + CI.

Setup checklist:
- See `docs/BRANCH_PROTECTIONS.md`

Required GitHub settings (Repository → Settings → Branches):
- Branch protection rule for `main`
  - Require a pull request before merging
  - Require status checks to pass before merging
    - **CI / nextjs-ci** (from `.github/workflows/ci.yml`)
    - **CI (Python Legacy) / python-ci** (from `.github/workflows/ci-python-legacy.yml`) - temporary
  - Do not allow bypassing the above settings
  - Restrict who can push to matching branches (recommended)
- Branch protection rule for `staging`
  - Require a pull request before merging
  - Require status checks to pass before merging
    - **CI / nextjs-ci**
    - **CI (Python Legacy) / python-ci** - temporary
  - Do not allow bypassing the above settings

## 6) Git over SSH (recommended)

If anyone on the team hits HTTPS certificate problems when pushing to GitHub, use SSH instead.

High-level steps:
1. Create an SSH key and add it to your GitHub account.
2. Switch the repo remote from HTTPS to SSH:
   - `git remote set-url origin git@github.com:getbeton/inspector.git`
3. Confirm you can fetch/push over SSH.

## 5) Local task logs (optional but recommended)

For local process logs that never get committed:
- Create a new log file with:
  - `./scripts/new_task_log.sh "short-description"`
- Files are stored in `.task_logs/` which is gitignored.


