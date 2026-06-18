# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start Commands

### Local Development
```bash
# Start local PostgreSQL (optional, for local dev)
docker-compose up -d

# Start Next.js dev server
npm run dev

# View Docker logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Testing & Building
```bash
# Run tests (watch mode)
make test
# or: npm test

# Run tests once
npm run test:run

# Test coverage
npm run test:coverage

# E2E tests (Playwright)
npm run test:e2e

# Type checking
make typecheck

# Linting
make lint

# Full build (CI-compatible)
make ci-build
```

### MANDATORY: Local Build Test Before Commit

**ALWAYS run the local build before creating any commit.** This catches TypeScript errors, import issues, and other problems that CI would catch later.

```bash
npm run build
```

This is a **blocking requirement** - do not commit code that fails the local build.

## Architecture Overview

### Tech Stack
- **Frontend**: Next.js 16 (TypeScript), React 19 — Full-stack with API routes
- **Database**: PostgreSQL via Supabase — user data, workspaces, API keys, signals, accounts
- **Authentication**: Supabase Auth (OAuth with PKCE)
- **Styling**: Tailwind CSS v4 (no `tailwind.config.js` — uses `@theme` tokens)
- **Deployment**: Vercel (production, staging, and preview environments)
- **Background Jobs**: Vercel Cron (5 scheduled jobs)
- **MCP**: Packaged MCP server in `packages/mcp-server/`

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
│  │  - /api/accounts/* - Account management      │   │
│  │  - /api/agent/* - ML-backend agent bridge    │   │
│  │  - /api/billing/* - Stripe billing           │   │
│  │  - /api/cron/* - Scheduled jobs              │   │
│  │  - /api/integrations/* - External services   │   │
│  │  - /api/mcp/* - MCP server endpoints         │   │
│  │  - /api/onboarding/* - Setup flow            │   │
│  │  - /api/signals/* - Signal CRUD              │   │
│  │  - /api/sync/* - Data sync                   │   │
│  │  - /api/workspace/* - Workspace management   │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │              Business Logic                   │   │
│  │  - lib/signals/ - Signal metrics & MTU       │   │
│  │  - lib/agent/ - ML-backend agent bridge      │   │
│  │  - lib/integrations/ - API clients           │   │
│  │  - lib/billing/ - Stripe MTU billing         │   │
│  │  - lib/mcp/ - MCP server tools               │   │
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
- `integrations` - PostHog, Stripe, Apollo, Postgres, Firecrawl settings

#### Integrations (`lib/integrations/`)
- **PostHog** (`posthog/`): Analytics events, persons, accounts
- **Stripe** (`stripe/`): Customer data, subscription status
- **Apollo** (`apollo/`): Company enrichment data
- **Attio** (`attio/`): CRM sync destination
- **Postgres** (`postgres/`): Direct DB integration (connection string, security)
- **Firecrawl** (`firecrawl/`): Web crawl integration

#### Signal Detection
Signal **discovery** is handled by `inspector-ml-backend` (ML pipeline). Inspector itself handles:
- **Signal metrics** (`lib/signals/`): MTU tracking, evaluator, metrics calculator, cycle/enforcement service
- **Agent bridge** (`lib/agent/`): Session management, auth, rate limiting for ML-backend calls

#### MCP Server (`packages/mcp-server/`)
Standalone MCP server package — tools for agent access to Inspector data.

### Project Structure
```
src/
├── app/
│   ├── (auth)/              # Auth pages (login, callback)
│   ├── (dashboard)/         # Protected app pages
│   │   ├── page.tsx         # Home/Setup
│   │   ├── signals/         # Signal list & detail
│   │   ├── settings/        # Integrations & config
│   │   ├── setup/           # Onboarding setup flow
│   │   ├── identities/      # User/account list
│   │   └── memory/          # Agent memory view
│   ├── api/                 # API route handlers
│   │   ├── accounts/
│   │   ├── agent/           # ML-backend agent bridge
│   │   ├── billing/
│   │   ├── cron/            # Vercel Cron endpoints
│   │   ├── data-sources/
│   │   ├── integrations/
│   │   ├── mcp/
│   │   ├── onboarding/
│   │   ├── signals/
│   │   ├── sync/
│   │   ├── webhooks/
│   │   ├── well-known/
│   │   └── workspace/
│   └── layout.tsx           # Root layout
├── components/
│   ├── ui/                  # Shadcn/Radix component library
│   └── layout/              # Layout components
└── lib/
    ├── agent/               # ML-backend agent bridge & sessions
    ├── analytics/
    ├── api/
    ├── auth/
    ├── billing/             # Stripe MTU billing
    ├── data/
    ├── email/
    ├── errors/
    ├── hooks/
    ├── integrations/        # External service clients
    │   ├── posthog/
    │   ├── stripe/
    │   ├── apollo/
    │   ├── attio/
    │   ├── postgres/
    │   └── firecrawl/
    ├── mcp/
    ├── middleware/
    ├── repositories/
    ├── services/
    ├── setup/
    ├── signals/             # Signal metrics, MTU, evaluator
    ├── store/               # Zustand state management
    ├── supabase/            # Supabase client & helpers
    ├── types/
    └── utils/
packages/
└── mcp-server/              # Standalone MCP server
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

### Cron Jobs (`vercel.json`)
| Path | Schedule |
|------|----------|
| `/api/cron/signal-detection` | Daily at 06:00 UTC |
| `/api/cron/mtu-tracking` | Daily at 02:00 UTC |
| `/api/cron/threshold-notifications` | Every 6 hours |
| `/api/cron/sync-signals` | Every 6 hours (offset 30m) |
| `/api/cron/mcp-cleanup` | Daily at 03:00 UTC |

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

### Working with Pages
1. **Protected pages**: Place in `app/(dashboard)/`
2. **Auth pages**: Place in `app/(auth)/`
3. **Use Server Components** by default (better performance)
4. **Use Client Components** only when needed (forms, interactivity)
5. **Data fetching**: Use React Query hooks from `lib/api/`
6. **State**: Use Zustand stores from `lib/store/` for global state

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

### Agent Bridge (`/api/agent/*`)
- Routes proxy OAuth bearer to the ML backend — they only accept `x-agent-secret` header auth, not OAuth bearer. Dual-auth wrapper required to fix 401/405 in prod (known P0 issue).

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
- `app/api/agent/` - ML-backend agent bridge routes
- `lib/signals/` - Signal metrics, MTU tracking, evaluator
- `lib/agent/agent-service.ts` - Agent session management
- `lib/billing/` - Stripe MTU billing service
- `lib/integrations/index.ts` - Integration client exports
- `lib/supabase/server.ts` - Supabase server client
- `vercel.json` - Vercel config including cron schedules
- `docker-compose.yml` - Local PostgreSQL for development
- `Makefile` - Common commands
- `packages/mcp-server/` - Standalone MCP server package

## Additional Context

### Project Goal
Beton Inspector is a RevOps intelligence platform that:
1. Syncs product usage (PostHog), revenue (Stripe), and firmographic (Apollo) data
2. Detects product usage signals (PQL indicators) via ML backend (`inspector-ml-backend`)
3. Scores accounts on health, expansion, and churn risk
4. Routes high-intent signals to CRM (Attio)
5. Tracks MTU (Monitored Tracked Users) for billing
6. Exposes an MCP server for agent access to Inspector data

### Naming Convention
"Beton" (French for concrete) — construction/building theme throughout:
- Signals are "construction plans"
- Scores are concrete grades (M100, M75, M50, M25, M10)
- Platform "inspects" data like a construction inspector

### Color Palette (Colorblind-Friendly)
- Primary: Blue (`#4A90E2`)
- Success: Green (`#7CB342`)
- Warning: Orange (`#FB8C00`)
- Danger: Red (`#E53935`)
- Neutral: Gray scale
