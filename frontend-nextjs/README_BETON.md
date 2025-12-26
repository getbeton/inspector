# Beton Inspector - Next.js Frontend

Modern React frontend for Beton Inspector, migrating from Streamlit to Next.js 14 (App Router).

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **coss ui** - Copy-paste component library (Base UI + Tailwind)
- **React Query** - Server state management
- **Zustand** - Client state management
- **React Hook Form** - Form handling
- **TanStack Table** - Advanced data tables
- **Tremor** - Dashboard charts
- **Supabase** - Authentication (OAuth)

## Getting Started

### Prerequisites

- Node.js 18+
- Backend API running on `http://localhost:8000`

### Installation & Development

```bash
npm install
cp .env.local.example .env.local
npm run dev  # Opens http://localhost:3000
```

### Build & Production

```bash
npm run build
npm start
```

## Project Structure

```
src/
├── app/                    # App Router pages & layouts
│   ├── (auth)/            # Login & auth flows
│   ├── (dashboard)/       # Protected dashboard pages
│   ├── layout.tsx         # Root layout
│   └── providers.tsx      # React Query & Zustand setup
│
├── components/
│   ├── auth/              # Session & auth components
│   ├── layout/            # Sidebar & header
│   ├── signals/           # Signal discovery & management
│   ├── charts/            # Data visualizations
│   └── ui/                # coss ui components (copy-paste)
│
└── lib/
    ├── auth/              # Supabase & session utilities
    ├── api/               # FastAPI client wrapper
    ├── hooks/             # Custom React hooks
    ├── utils/             # Helpers & formatters
    └── types/             # TypeScript interfaces
```

## Environment Variables

See `.env.local.example` - Key variables:
- `NEXT_PUBLIC_API_URL` - Backend API (default: http://localhost:8000)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase client key

## Migration Roadmap

| Feature | Status | Commit |
|---------|--------|--------|
| Next.js Setup | ✅ Complete | #1 |
| coss ui Components | 🚧 In Progress | #2 |
| Authentication | ⏳ Pending | #3 |
| API Client Layer | ⏳ Pending | #4 |
| Dashboard Layout | ⏳ Pending | #5 |
| Home/Setup Page | ⏳ Pending | #6 |
| Signals Page | ⏳ Pending | #7 |
| Signal Detail | ⏳ Pending | #8 |
| Charts & Visualizations | ⏳ Pending | #9 |
| Playbooks | ⏳ Pending | #10 |
| Remaining Pages | ⏳ Pending | #11 |
| Docker & Deployment | ⏳ Pending | #12 |
| Testing Infrastructure | ⏳ Pending | #13 |

See [../DEPLOYMENT.md](../DEPLOYMENT.md) for the complete plan.

## Testing

```bash
npm test            # Unit tests (Vitest)
npm run test:e2e    # E2E tests (Playwright)
```

## Deployment

### Docker

```bash
docker build -t beton-frontend .
docker run -p 3000:3000 beton-frontend
```

See [../DEPLOYMENT.md](../DEPLOYMENT.md) for Railway/production deployment.

## Contributing

Branch: `feature/nextjs-migration`

Each commit should be atomic:
1. coss ui setup (#2)
2. Authentication (#3)
3. API client (#4)
... and so on (see roadmap above)
