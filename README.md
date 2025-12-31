# Beton Inspector

RevOps intelligence platform for B2B SaaS. Detects product usage signals, scores accounts, and routes high-intent leads to CRM.

## Quick Start

```bash
# Local development with Docker
docker-compose up -d
# Frontend: http://localhost:3000
# Backend:  http://localhost:8000
```

## Architecture

| Component | Tech | Location |
|-----------|------|----------|
| Frontend | Next.js 16 | `/frontend-nextjs` |
| Backend | FastAPI | `/backend` |
| Database | PostgreSQL (Supabase) | - |
| Auth | Supabase OAuth + Sessions | - |
| Deployment | Railway | staging/production |

## Key Features

- **Signal Detection**: 20+ product usage signals (trial intent, power users, etc.)
- **Account Scoring**: Health, expansion, churn risk (0-100 scale)
- **Integrations**: PostHog, Stripe, Apollo, Attio
- **Multi-tenant**: Workspace-based isolation

## Development

```bash
# Run migrations
docker-compose exec backend alembic upgrade head

# Run tests
make py-test
```

## Deployment

```
feature branch → PR → staging → PR → main (production)
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for full runbook.
See [CLAUDE.md](CLAUDE.md) for detailed development guide.

## Environment

Key variables (see `.env.example`):
- `DATABASE_URL` - Supabase PostgreSQL
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` - OAuth
- `FRONTEND_URL` - For redirects
- `API_URL` - Backend internal URL (Railway)
