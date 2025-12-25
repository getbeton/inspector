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

### 2.3 Preview environments for PRs into `staging` (automatic)

When you open (or update) a PR **into `staging`**, GitHub Actions will:
- Create (or re-use) a Railway preview environment for that PR (duplicated from `staging`)
- Deploy the PR changes into that environment
- Print a preview URL in the workflow logs (if Railway provides a domain for the `frontend` service)

When the PR is closed (merged or not), GitHub Actions will:
- Delete the corresponding Railway preview environment

Workflow:
- `.github/workflows/preview_env.yml`

Required GitHub secrets:
- `RAILWAY_API_TOKEN` (Railway API token used by the GitHub Action)
- `RAILWAY_TOKEN` (legacy fallback; optional if `RAILWAY_API_TOKEN` is set)
- `RAILWAY_PROJECT_ID` (Railway project id)

How to validate `RAILWAY_TOKEN` is correct (before burning CI cycles):
- Run locally (this MUST succeed):
  - `HOME="$(mktemp -d)" RAILWAY_TOKEN="<paste token>" railway whoami`
- If you see `Unauthorized. Please login`, the token is invalid or has copy/paste issues (common: trailing newline).

Naming rule:
- PR #123 -> Railway env `pr-123`

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

## 3) Database migrations (backend) – safe default policy

This repo uses Alembic migrations (`backend/alembic/`).

### Policy
- Always apply migrations in **staging first**, observe, then promote to production.

### Operational runbook (manual, robust)

When a deploy includes new migrations:

1) Staging:
- Deploy staging (merge into `staging`)
- Run Alembic upgrade in staging:
  - `cd backend && alembic upgrade head`
- Smoke test staging API

2) Production:
- Promote staging → main (merge `staging` into `main`)
- Run Alembic upgrade in production:
  - `cd backend && alembic upgrade head`
- Smoke test production API

### “Do we have migrations in this release?”

Before promoting to production, check if `backend/alembic/versions/` contains new migration files.

### Rollback guidance (use with caution)

If a migration breaks production, you usually need two actions:
1. Roll back the application deploy (Railway) to a previous working version.
2. Decide whether the database schema needs to be rolled back.

Alembic commands that help diagnose state:
- `cd backend && alembic current`
- `cd backend && alembic history --verbose | head`

Schema rollback is risky (especially if new columns/tables are already used). Only downgrade if you’re sure it’s safe:
- `cd backend && alembic downgrade -1`

### Migration design rule (recommended)

Prefer **backward-compatible** migrations whenever possible (add columns/tables first, deploy code after).
This reduces the chance that staging/production get stuck in a half-upgraded state.

### How to run Alembic on Railway

Railway supports running commands in a service context. Use whichever method your team prefers:

- Railway UI: run a one-off command in the `backend` service
  - `alembic upgrade head`
- Railway CLI (if installed and linked):
  - run the same command against the `backend` service and the correct environment.

## 4) Required GitHub protections (recommended)

To keep production safe:
- Protect `main`: no direct pushes, require PRs + CI.
- Protect `staging`: require PRs + CI.

Setup checklist:
- See `docs/BRANCH_PROTECTIONS.md`

Suggested concrete GitHub settings (Repository → Settings → Branches):
- Branch protection rule for `main`
  - Require a pull request before merging
  - Require status checks to pass before merging
    - require the CI check from `.github/workflows/ci.yml` (job name: `python-ci`)
  - (Optional) Require linear history (only if your team prefers it)
  - Restrict who can push to matching branches (recommended)
- Branch protection rule for `staging`
  - Require a pull request before merging
  - Require status checks to pass before merging
    - require the same CI check (`python-ci`)

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


