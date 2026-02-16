<div align="center">
  <h1>Beton Inspector</h1>
  <p><strong>Open-source RevOps intelligence for product-led growth</strong></p>
  <p>Detect product usage signals, score accounts, and route high-intent leads to your CRM — all from your existing analytics data.</p>

  [![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
  [![Built with Next.js](https://img.shields.io/badge/Built%20with-Next.js-black)](https://nextjs.org)
</div>

---

## What is Beton Inspector?

Beton Inspector connects to your product analytics (PostHog) and turns raw usage data into actionable revenue signals. Instead of guessing which accounts are ready to buy, expand, or churn, Beton detects concrete behavioral patterns — trial conversion intent, power user emergence, feature adoption velocity — and scores each account automatically.

The signals and scores flow into your CRM (Attio), giving your sales team a prioritized list of accounts with context on *why* they should reach out and *when*.

**Key value:** Your product data already contains the buying signals. Beton Inspector surfaces them without requiring data engineering or custom dashboards.

## Features

- **20+ Signal Detectors** — Trial intent, power users, feature adoption, engagement drops, and more
- **Account Scoring** — Health, expansion potential, and churn risk on a 0–100 scale (concrete grades: M100, M75, M50, M25, M10)
- **PostHog Integration** — Reads events, persons, and group data from your PostHog data warehouse
- **CRM Sync** — Routes scored accounts and signals to Attio with full context
- **Multi-tenant** — Workspace-based isolation with Supabase Row Level Security
- **Metered Billing** — Optional Stripe integration for SaaS billing (can be disabled for self-hosting)
- **Agent System** — AI-powered data exploration that learns your schema and business model

## Self-Hosting Quick Start

### Prerequisites

- **Node.js** 18+
- **PostgreSQL** — via [Supabase](https://supabase.com) (recommended) or any PostgreSQL instance
- **PostHog** account with API access

### Setup

```bash
# Clone the repo
git clone https://github.com/getbeton/inspector.git
cd inspector

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your Supabase and PostHog credentials
# At minimum, set:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   ENCRYPTION_KEY (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Start the dev server
npm run dev
# → http://localhost:3000
```

For production deployments, see the [deployment guide](docs/deployment.md) (coming soon).

### Self-Hosted Mode

When self-hosting, set `DEPLOYMENT_MODE=self-hosted` (or leave it unset). This disables all billing features, giving you unlimited access with no Stripe dependency.

## Architecture

| Component | Technology | Details |
|-----------|-----------|---------|
| Application | Next.js (TypeScript) | Full-stack — pages + API routes |
| Database | PostgreSQL (Supabase) | RLS-secured, multi-tenant |
| Auth | Supabase OAuth (PKCE) | Session cookies, workspace context |
| State | Zustand + React Query | Client state + server cache |

All code lives in `src/`. There is no separate backend — business logic runs as Next.js API routes.

```
src/
├── app/
│   ├── (auth)/              # Login, OAuth callback
│   ├── (dashboard)/         # Protected pages (signals, identities, memory, settings)
│   └── api/                 # ~40 API route handlers
├── components/
│   ├── ui/                  # Base UI primitives (base-ui + CVA)
│   ├── layout/              # Sidebar, header, navigation
│   ├── signals/             # Signal-specific components
│   └── billing/             # Billing UI (optional)
└── lib/
    ├── heuristics/          # Signal detection & scoring engine
    │   └── signals/detectors/  # 20+ signal detectors
    ├── integrations/        # PostHog, Attio, Stripe clients
    ├── supabase/            # Client helpers + auto-generated types
    └── email/               # Notification emails (Resend)
```

## Development

```bash
npm run dev          # Start dev server
npm run build        # Production build (must pass before committing)
npm run lint         # ESLint
npm run typecheck    # TypeScript check
```

## Contributing

We welcome contributions! Please see [CONTRIBUTORS.md](CONTRIBUTORS.md) for guidelines on how to get started.

To report bugs or request features, [open an issue](https://github.com/getbeton/inspector/issues).

## License

Beton Inspector is licensed under the [GNU Affero General Public License v3.0](LICENSE).

This means you can freely use, modify, and distribute the software, but any modifications must also be made available under the same license, including when running a modified version as a network service.

## Support

- [GitHub Issues](https://github.com/getbeton/inspector/issues) — Bug reports and feature requests
- [GitHub Discussions](https://github.com/getbeton/inspector/discussions) — Questions and community support
