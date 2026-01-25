# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start Commands

### Local Development
```bash
# Start local PostgreSQL (optional, for local dev)
docker-compose up -d

# Start Next.js dev server
cd frontend-nextjs && npm run dev

# View Docker logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Testing & Building
```bash
# Run tests
make test

# Type checking
make typecheck

# Linting
make lint

# Full build (CI-compatible)
make ci-build

# Setup local environment
make setup
```

### MANDATORY: Local Build Test Before Commit

**ALWAYS run the local build before creating any commit.** This catches TypeScript errors, import issues, and other problems that CI would catch later.

```bash
cd frontend-nextjs && npm run build
```

This is a **blocking requirement** - do not commit code that fails the local build. The CI pipeline will reject PRs with build failures, so catching them early saves time and review cycles.

## Architecture Overview

### Tech Stack
- **Frontend**: Next.js 14 (TypeScript) - Full-stack with API routes
- **Database**: PostgreSQL via Supabase - user data, workspaces, API keys, signals, accounts
- **Authentication**: Supabase Auth (OAuth with PKCE)
- **Deployment**: Vercel (production, staging, and preview environments)
- **Background Jobs**: Vercel Cron

### Service Architecture
```
┌─────────────────────────────────────────────────────┐
│              Next.js Application                    │
│                  (Vercel)                           │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │              App Router                       │   │
│  │  - (auth)/ - Login, OAuth callback           │   │
│  │  - (dashboard)/ - Protected app pages        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │              API Routes                       │   │
│  │  - /api/signals/* - Signal CRUD              │   │
│  │  - /api/integrations/* - External services   │   │
│  │  - /api/cron/* - Scheduled jobs              │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │              Business Logic                   │   │
│  │  - lib/heuristics/ - Signal detection        │   │
│  │  - lib/integrations/ - API clients           │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│              PostgreSQL (Supabase)                  │
│  - Row Level Security (RLS)                        │
│  - Supabase migrations                             │
│  - Multi-tenant with workspaces                    │
└─────────────────────────────────────────────────────┘
```

### Key Modules

#### Authentication (Supabase Auth)
- **OAuth Flow**: PKCE-based OAuth via Supabase
- **Session Management**: Supabase handles session cookies
- **Workspace Context**: Every user belongs to a workspace (multi-tenant)

#### Database (Supabase)
Tables managed via Supabase migrations:
- `workspaces` - Multi-tenant container (has slug, subscription status)
- `workspace_members` - Links users to workspaces with roles
- `api_keys` - API key auth for programmatic access
- `accounts`, `contacts`, `signals` - Core business entities
- `integrations` - PostHog, Stripe, Apollo settings

#### Integrations (`lib/integrations/`)
- **PostHog** (`posthog/`): Analytics events, persons, accounts
- **Stripe** (`stripe/`): Customer data, subscription status
- **Apollo** (`apollo/`): Company enrichment data
- **Attio** (`attio/`): CRM sync destination

#### Heuristics & Scoring (`lib/heuristics/`)
- **Signal Detection** (`signals/`): 20+ product usage signal detectors
- **Scoring Engine** (`engine.ts`): Health, expansion, churn risk scores (0-100)
- **Concrete Grades** (`concrete-grades.ts`): M100, M75, M50, M25, M10

### Project Structure
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
│   │   ├── cron/            # Vercel Cron endpoints
│   │   ├── signals/         # Signal CRUD
│   │   └── integrations/    # Integration management
│   └── layout.tsx           # Root layout
├── components/
│   ├── ui/                  # Shadcn/Radix component library
│   ├── signals/             # Signal-specific components
│   └── layout/              # Layout components
└── lib/
    ├── heuristics/          # Signal detection & scoring
    │   ├── signals/         # 20 signal detectors
    │   ├── engine.ts        # Scoring engine
    │   └── concrete-grades.ts
    ├── integrations/        # External service clients
    │   ├── posthog/
    │   ├── stripe/
    │   ├── apollo/
    │   └── attio/
    ├── supabase/            # Supabase client & helpers
    ├── stores/              # Zustand state management
    └── utils/               # Helpers
```

## Deployment Workflow

### Environment Matrix

| Git Branch | Vercel Environment | Supabase Project |
|------------|-------------------|------------------|
| `main` | Production | `beton-inspector` / `main` branch |
| `staging` | Staging | `beton-inspector` / `staging` branch |
| Feature branches | Preview | `beton-inspector` / `staging` branch |

> **Note**: All feature branch previews use the **staging** Supabase database. Only the `main` branch connects to the production Supabase project.

### Branch Strategy
```
feature/my-feature  →  [PR]  →  staging  →  [PR]  →  main
      │                          │                   │
      │                          │                   │
   Preview                    Staging           Production
  (staging DB)             (staging DB)        (production DB)
```

### Deployment Steps
1. Create feature branch from `staging`
2. Push to GitHub (auto-creates preview environment)
3. PR to `staging` (requires CI pass)
4. Merge to `staging` (auto-deploys staging)
5. Test staging thoroughly
6. PR from `staging` to `main` (requires CI pass)
7. Merge to `main` (auto-deploys production)

### Database Migrations
Database schema is managed via Supabase:
1. Make changes in Supabase Dashboard (staging project)
2. Test thoroughly
3. Apply same changes to production Supabase project
4. Or use Supabase CLI for migration files

## Common Development Patterns

### Adding a New API Route
1. Create route in `app/api/<module>/route.ts`
2. Use Supabase server client for DB access
3. Add proper error handling and authentication checks
4. Update types if needed

### Adding a New Integration
1. Create client in `lib/integrations/<service>/client.ts`
2. Export from `lib/integrations/index.ts`
3. Add connection validation
4. Add UI in settings page

### Adding a New Signal Detector
1. Create detector in `lib/heuristics/signals/detectors/<name>.ts`
2. Implement `SignalDetectorDefinition` interface
3. Export from `lib/heuristics/signals/detectors/index.ts`
4. Detector will be auto-included in signal processing

### Working with Pages
1. **Protected pages**: Place in `app/(dashboard)/`
2. **Auth pages**: Place in `app/(auth)/`
3. **Use Server Components** by default (better performance)
4. **Use Client Components** only when needed (forms, interactivity)
5. **Data fetching**: Use React Query hooks from `lib/api/`
6. **State**: Use Zustand stores from `lib/stores/` for global state

## Important Constraints

### Security
- **Never commit secrets** - Use `.env.local` (gitignored)
- **Row Level Security** - Supabase RLS enforces data isolation
- **Server-only secrets** - Use `SUPABASE_SERVICE_ROLE_KEY` only in API routes
- **Validate workspace access** - Always check user's workspace membership

### Multi-tenancy
- **Every request needs workspace context** - Check user's workspace
- **Workspace isolation** - RLS policies enforce isolation
- **No cross-workspace access** - Database layer prevents it

### Vercel Cron
- **Max duration**: 5 minutes on Pro plan
- **Authentication**: Use `CRON_SECRET` header verification
- **Idempotency**: Design jobs to be safely re-runnable

## Environment Variables

### Required (Next.js)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key (client-side)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side only)

### Optional (Integrations)
- `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID` - PostHog analytics
- `STRIPE_API_KEY` - Stripe payments
- `APOLLO_API_KEY` - Apollo enrichment
- `ATTIO_API_KEY` - Attio CRM

### Vercel Cron
- `CRON_SECRET` - Secret for authenticating cron requests

## Common Issues & Solutions

### Next.js build errors
**Problem**: TypeScript errors or missing dependencies.
**Solution**:
```bash
cd frontend-nextjs
npm install
npm run build
```

### Supabase connection issues
**Problem**: "Failed to fetch" or connection errors.
**Solution**:
1. Check Supabase project is running
2. Verify environment variables are set
3. Check RLS policies aren't blocking access

### Cron job not running
**Problem**: Scheduled job not executing.
**Solution**:
1. Verify `vercel.json` cron config is correct
2. Check Vercel dashboard → Cron Jobs for status
3. Test endpoint manually with correct `CRON_SECRET`

## Key Files Reference

- `app/api/cron/signal-detection/route.ts` - Signal detection cron job
- `lib/heuristics/signals/processor.ts` - Signal processing engine
- `lib/heuristics/engine.ts` - Scoring engine
- `lib/integrations/index.ts` - Integration client exports
- `lib/supabase/server.ts` - Supabase server client
- `vercel.json` - Vercel config including cron schedules
- `docker-compose.yml` - Local PostgreSQL for development
- `Makefile` - Common commands

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
- Primary: Blue (`#4A90E2`)
- Success: Green (`#7CB342`)
- Warning: Orange (`#FB8C00`)
- Danger: Red (`#E53935`)
- Neutral: Gray scale
