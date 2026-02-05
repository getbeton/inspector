# Beton Inspector

RevOps intelligence platform for B2B SaaS. Detects product usage signals, scores accounts, and routes high-intent leads to CRM.

## Quick Start

```bash
# Install dependencies
make setup

# Start Next.js dev server
make dev
# → http://localhost:3000

# Or use Docker (includes local PostgreSQL)
make up
```

## Architecture

| Component | Tech | Details |
|-----------|------|---------|
| Application | Next.js 16 (TypeScript) | Full-stack — pages + API routes |
| Database | PostgreSQL (Supabase) | RLS-secured, multi-tenant |
| Auth | Supabase OAuth (PKCE) | Session cookies, workspace context |
| Deployment | Vercel | Production, staging, preview envs |
| State | Zustand + React Query | Client state + server cache |
| Testing | Vitest + Playwright | Unit + E2E |

All code lives in `frontend-nextjs/src/`. There is no separate backend — business logic runs as Next.js API routes on Vercel serverless functions.

## Key Features

- **Signal Detection** — 20+ product usage signal detectors (trial intent, power users, etc.)
- **Account Scoring** — Health, expansion, and churn risk scores (0–100 scale, concrete grades)
- **Data sources** — (PostHog DWH)[https://posthog.com]
- **Integrations** — (Attio)[https://attio.com]
- **Billing** — Stripe metered billing. Can be turned off with an env variable
- **Multi-tenant** — Workspace-based isolation with Row Level Security
- **Cron Jobs** — Signal detection, MTU tracking, threshold notifications (Vercel Cron)

## Project Structure

```
frontend-nextjs/src/
├── app/
│   ├── (auth)/              # Login, OAuth callback
│   ├── (dashboard)/         # Protected pages
│   │   ├── page.tsx         #   Home / Setup
│   │   ├── signals/         #   Signal list, detail, create
│   │   ├── identities/      #   Account directory
│   │   └── settings/        #   Integration config
│   └── api/                 # ~40 API route handlers
│       ├── auth/            #   Login, logout, API keys
│       ├── billing/         #   Stripe setup, portal, MTU
│       ├── cron/            #   Scheduled jobs
│       ├── heuristics/      #   Score calculation
│       ├── integrations/    #   Connection management
│       ├── signals/         #   Signal CRUD + dashboard
│       └── webhooks/        #   Stripe webhooks
├── components/
│   ├── ui/                  # Base UI primitives (base-ui + CVA)
│   ├── layout/              # Sidebar, navigation
│   ├── signals/             # Signal-specific components
│   ├── billing/             # Stripe / billing UI
│   ├── charts/              # Recharts visualizations
│   └── setup/               # Onboarding wizard
└── lib/
    ├── api/                 # React Query hooks & API clients
    ├── heuristics/          # Signal detection & scoring engine
    │   └── signals/detectors/  # 20+ signal detectors
    ├── integrations/        # PostHog, Stripe, Apollo, Attio clients
    ├── supabase/            # Client helpers + auto-generated types
    ├── store/               # Zustand state management
    └── services/            # Business logic layer
```

## Development

```bash
make dev         # Start dev server
make test        # Run unit tests (Vitest)
make lint        # ESLint
make typecheck   # TypeScript check
make ci-build    # Full CI build (npm ci + build)
```

Build **must** pass before committing:

```bash
cd frontend-nextjs && npm run build
```

## Deployment

```
feature/*  →  PR  →  staging  →  PR  →  main
   │                    │                  │
Preview env        Staging env       Production env
(staging DB)       (staging DB)      (production DB)
```

All environments deploy automatically on Vercel. Feature branches and staging share the staging Supabase database; only `main` connects to production.

## Environment Variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=     # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Supabase anon key (client-safe)
SUPABASE_SERVICE_ROLE_KEY=    # Service role key (server-only)
# Cron
CRON_SECRET=                  # Vercel Cron auth
```

See [CLAUDE.md](CLAUDE.md) for detailed development patterns and architecture docs.
