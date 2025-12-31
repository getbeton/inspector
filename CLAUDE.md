# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start Commands

### Local Development
```bash
# Start all services with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Run backend shell
docker-compose exec backend /bin/bash

# Run database migrations
docker-compose exec backend alembic upgrade head
```

### Testing & Building
```bash
# Run full test suite (in Docker)
make test

# Syntax check + unit tests (local, no Docker)
make py-build    # Compile all Python files
make py-test     # Run pytest
npm run build    # Compile Python with wrapper script
npm test         # Run pytest with wrapper script

# Setup local environment
make setup       # Creates venv and installs dependencies
```

### Database Migrations
```bash
# Create new migration
docker-compose exec backend alembic revision --autogenerate -m "description"

# Apply migrations
docker-compose exec backend alembic upgrade head

# Check current migration status
docker-compose exec backend alembic current

# Rollback one migration (use with caution)
docker-compose exec backend alembic downgrade -1
```

## Architecture Overview

### Tech Stack
- **Backend**: FastAPI (Python) - REST API with OAuth, session management, integrations
- **Frontend (Legacy)**: Streamlit (Python) - at `/frontend`, being deprecated
- **Frontend (New)**: Next.js 14 (TypeScript) - at `/frontend-nextjs`, in active migration
- **Database**: PostgreSQL - user data, workspaces, API keys, signals, accounts
- **Deployment**: Railway - staging and production environments

### Service Architecture
```
┌─────────────────────────────────────────────────────┐
│                    Next.js Frontend                 │
│                  (Port 3000)                        │
│  - App Router with route groups                    │
│  - API Proxy: /api/* → Backend (same-domain cookies)│
│  - Supabase OAuth (HTTP-only cookies)              │
└─────────────────┬───────────────────────────────────┘
                  │ Proxied via Next.js rewrites
┌─────────────────▼───────────────────────────────────┐
│                 FastAPI Backend                     │
│                  (Port 8080 on Railway)             │
│  - Session-based auth (HTTP-only, Secure cookies)  │
│  - JWT validation with Supabase JWKS               │
│  - PostHog, Stripe, Apollo integrations            │
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│              PostgreSQL (Supabase)                  │
│  - Connection Pooler for IPv4 compatibility        │
│  - Alembic migrations                              │
│  - Multi-tenant with workspaces                    │
└─────────────────────────────────────────────────────┘
```

### API Proxy (Critical for Auth)
Next.js proxies all `/api/*` requests to the backend. This is **required** for session cookies to work (same-domain).

**Config**: `frontend-nextjs/next.config.ts` → `rewrites()`
- Client requests go to `https://inspector.getbeton.ai/api/*`
- Next.js forwards to `http://backend.railway.internal:8080/api/*`
- Session cookies stay on frontend domain

**Railway ENV**:
- `API_URL=http://backend.railway.internal:8080` (frontend service)

### Key Backend Modules

#### Authentication (`backend/app/auth.py`, `backend/app/core/`)
- **Session Management**: HTTP-only cookies, server-side session storage
- **JWT Handler**: Validates Supabase OAuth tokens
- **API Keys**: Optional API key auth (format: `beton_<32-char-hex>`)
- **Workspace Context**: Every user belongs to a workspace (multi-tenant)

#### Database Models (`backend/app/models.py`)
- `Workspace` - Multi-tenant container (has slug, subscription status)
- `WorkspaceMember` - Links users to workspaces with roles
- `APIKey` - API key auth for programmatic access
- `Account`, `Contact`, `Signal` - Core business entities
- `Integration` - PostHog, Stripe, Apollo settings (encrypted credentials)

#### Integrations (`backend/app/integrations/`)
- **PostHog** (`posthog.py`): Analytics events, persons, accounts
- **Stripe** (`stripe.py`): Customer data, subscription status
- **Apollo** (`apollo.py`): Company enrichment data
- **Attio** (`attio.py` endpoint): CRM sync destination

#### Heuristics & Scoring (`backend/app/heuristics/`)
- **Signal Detection**: 20+ product usage signals (trial intent, power users, etc.)
- **Scoring Engine**: Health, expansion, churn risk scores (0-100)
- **Concrete Grades**: M100, M75, M50, M25, M10 (construction-themed grades)
- **Fit Scoring**: ICP match calculation based on firmographics
- **ML Clustering**: K-Means clustering (placeholder, Phase 2 upgrade planned)

### Frontend Architecture (Next.js Migration)

The repo is **migrating from Streamlit to Next.js**. Both frontends coexist:
- **Streamlit** (`/frontend`) - Legacy, port 8501, being deprecated
- **Next.js** (`/frontend-nextjs`) - New frontend, port 3000, active development

#### Next.js Structure
```
frontend-nextjs/src/
├── app/
│   ├── (auth)/              # Auth pages (login, callback)
│   ├── (dashboard)/         # Protected app pages
│   │   ├── page.tsx         # Home/Setup
│   │   ├── signals/         # Signal list & detail
│   │   ├── playbooks/       # Automation rules
│   │   ├── backtest/        # Signal testing
│   │   ├── settings/        # Integrations & config
│   │   └── identities/      # User/account list
│   ├── api/                 # API route handlers
│   └── layout.tsx           # Root layout
├── components/
│   ├── ui/                  # coss ui component library
│   ├── signals/             # Signal-specific components
│   └── layout/              # Layout components
└── lib/
    ├── api/                 # API client (React Query)
    ├── stores/              # Zustand state management
    └── utils/               # Helpers
```

#### Key Migration Decisions
1. **Route Groups**: `(auth)` and `(dashboard)` for layout separation
2. **Component Strategy**: Copy-paste from coss ui (Radix + Tailwind)
3. **Data Fetching**: React Query for server state, Zustand for client state
4. **Authentication**: Reuse backend session cookies (no changes to auth flow)
5. **Colorblind Palette**: Preserved from Streamlit for accessibility

#### Migration Status
See `frontend-nextjs/MIGRATION_PROGRESS.md` for current status (8/13 commits complete).

## Deployment Workflow

### Railway Environments
- **staging** - Deploys from `staging` branch
- **production** - Deploys from `main` branch
- **Preview environments** - Auto-created for `feature/**` branches

### Branch Strategy
```
feature/my-feature  →  [PR]  →  staging  →  [PR]  →  main
      │                          │                   │
      │                          │                   │
   Preview Env                Staging           Production
```

### Deployment Steps (See DEPLOYMENT.md)
1. Create feature branch from `staging`
2. Push to GitHub (auto-creates Railway preview environment)
3. PR to `staging` (requires CI pass)
4. Merge to `staging` (auto-deploys staging)
5. Test staging thoroughly
6. PR from `staging` to `main` (requires CI pass)
7. Merge to `main` (auto-deploys production)

### Database Migration Policy
**Always run migrations in staging first, then production.**
```bash
# After staging deploy:
railway environment staging
railway run --service backend alembic upgrade head

# After production promote:
railway environment production
railway run --service backend alembic upgrade head
```

### Railway Scripts
```bash
# Create/update preview environment
BRANCH_NAME=feature/my-feature bash scripts/railway_preview_env.sh

# Test preview services
./scripts/test_api.sh pr-my-feature backend
./scripts/test_api.sh pr-my-feature frontend
```

## Common Development Patterns

### Adding a New API Endpoint
1. Create route in `backend/app/api/endpoints/<module>.py`
2. Register router in `backend/app/main.py`
3. Add Pydantic models in `backend/app/models.py` if needed
4. Add tests in `backend/tests/`
5. Update API client in `frontend-nextjs/src/lib/api/`

### Adding a New Database Model
1. Define model in `backend/app/models.py`
2. Create migration: `docker-compose exec backend alembic revision --autogenerate -m "add model"`
3. Review generated migration in `backend/alembic/versions/`
4. Apply locally: `docker-compose exec backend alembic upgrade head`
5. Commit both model and migration files

### Adding a New Integration
1. Create client in `backend/app/integrations/<service>.py`
2. Add settings in `backend/app/config.py`
3. Add Integration model entry in database
4. Add sync logic in `backend/app/services/sync.py`
5. Add UI in Next.js settings page

### Adding a New Signal Type
1. Define signal in `backend/app/heuristics/signal_definitions.py`
2. Add detection logic in `backend/app/heuristics/signal_processor.py`
3. Update scoring weights in `backend/app/heuristics/scoring_engine.py`
4. Add tests in `backend/tests/test_heuristics.py`

### Working with Next.js Pages
1. **Protected pages**: Place in `app/(dashboard)/`
2. **Auth pages**: Place in `app/(auth)/`
3. **Use Server Components** by default (better performance)
4. **Use Client Components** only when needed (forms, interactivity)
5. **Data fetching**: Use React Query hooks from `lib/api/`
6. **State**: Use Zustand stores from `lib/stores/` for global state

## Important Constraints

### Security
- **Never commit secrets** - Use `.env` (gitignored)
- **HTTP-only cookies** - Session tokens not accessible to JS
- **Secure cookies** - `Secure=true` in production (HTTPS only)
- **Signed sessions** - `itsdangerous` TimestampSigner prevents tampering
- **CORS** - Backend validates origin in production
- **Encrypted credentials** - Integration API keys encrypted in DB

### Multi-tenancy
- **Every request needs workspace context** - Use `get_current_user` dependency
- **Workspace isolation** - Filter all queries by `workspace_id`
- **No cross-workspace access** - Enforce in DB layer

### Database Migrations
- **Always backward-compatible** - Add columns, don't drop/rename
- **Test in staging first** - Never run untested migrations in production
- **Atomic migrations** - Keep migrations small and focused
- **No data migrations in schema files** - Use separate data migration scripts

### Next.js Migration
- **No backend changes during migration** - Frontend-only changes
- **Both frontends work simultaneously** - Don't break Streamlit
- **Atomic commits** - Each commit should be deployable
- **Copy components, don't import** - Full control over UI library

## Environment Variables

### Backend (Docker Compose)
- `DATABASE_URL` - PostgreSQL connection string
- `BETON_ENCRYPTION_KEY` - For encrypting integration credentials
- `ENV` - DEV, STAGING, or PRODUCTION
- `FRONTEND_URL` - For CORS and redirects
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` - OAuth
- `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID` - Analytics integration
- `STRIPE_API_KEY` - Payment integration
- `APOLLO_API_KEY` - Enrichment integration

### Frontend (Next.js)
- `NEXT_PUBLIC_API_URL` - Backend API URL (client-side)
- `API_URL` - Backend API URL (server-side)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` - OAuth

### CI/CD
- `RAILWAY_TOKEN` - Railway API token for deployments
- `RAILWAY_PROJECT_ID` - Railway project ID

## Common Issues & Solutions

### "Connection refused" on localhost
**Problem**: Services not running or wrong ports.
**Solution**: `docker-compose ps` to check status, `docker-compose up -d` to start.

### Alembic "Target database is not up to date"
**Problem**: Local DB is behind migrations.
**Solution**: `docker-compose exec backend alembic upgrade head`

### Next.js build errors
**Problem**: TypeScript errors or missing dependencies.
**Solution**:
```bash
cd frontend-nextjs
npm install
npm run build
```

### OAuth callback fails
**Problem**: Supabase redirect URL mismatch or cookie domain issues.
**Solution**:
1. Check Supabase Dashboard → Authentication → URL Configuration has `https://inspector.getbeton.ai/api/oauth/callback`
2. Verify `API_URL=http://backend.railway.internal:8080` on frontend service
3. Ensure OAuth redirects go through frontend proxy (not directly to backend)

### Railway preview environment not deploying
**Problem**: Branch name too long or contains invalid characters.
**Solution**: Railway sanitizes branch names to max 25 chars. Check logs: `railway logs --service backend`

## Testing Strategy

### Backend Tests
- **Unit tests**: `backend/tests/` - Fast, no DB required
- **Integration tests**: Require API keys (skipped in CI if keys not set)
- **Run locally**: `docker-compose exec backend pytest`
- **Run in CI**: `make py-test` (uses local Python, not Docker)

### Frontend Tests
- **Phase 3 of migration** - Vitest + Playwright (not yet implemented)
- Streamlit frontend has no automated tests (manual testing only)

## Key Files Reference

- `backend/app/main.py` - FastAPI app entry point, all endpoints
- `backend/app/models.py` - SQLAlchemy models
- `backend/app/auth.py` - Session + JWT authentication
- `backend/app/config.py` - Settings (Pydantic Settings)
- `docker-compose.yml` - Local dev environment
- `Makefile` - Common commands
- `DEPLOYMENT.md` - Full deployment runbook
- `ARCHITECTURE.md` - Legacy Streamlit architecture (outdated)
- `frontend-nextjs/MIGRATION_PROGRESS.md` - Migration status
- `scripts/railway_preview_env.sh` - Preview environment automation

## Additional Context

### Project Goal
Beton Inspector is a RevOps intelligence platform that:
1. Syncs product usage (PostHog), revenue (Stripe), and firmographic (Apollo) data
2. Detects 20+ product usage signals (PQL indicators)
3. Scores accounts on health, expansion risk, and churn risk
4. Routes high-intent signals to CRM (Attio)
5. Provides RevOps dashboards and backtesting tools

### Naming Convention
"Beton" (French for concrete) - Construction/building theme throughout:
- Signals are "construction plans"
- Scores are concrete grades (M100, M75, etc.)
- Platform "inspects" data like a construction inspector

### Color Palette (Colorblind-Friendly)
Preserved from Streamlit, carried into Next.js:
- Primary: Blue (`#4A90E2`)
- Success: Green (`#7CB342`)
- Warning: Orange (`#FB8C00`)
- Danger: Red (`#E53935`)
- Neutral: Gray scale
