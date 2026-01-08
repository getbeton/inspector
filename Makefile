.PHONY: up down build logs dev test lint typecheck setup

# -----------------------------------------------------------------------------
# Docker Compose (local development)
# -----------------------------------------------------------------------------
up:
	docker-compose up -d

down:
	docker-compose down

build:
	docker-compose build

logs:
	docker-compose logs -f

# -----------------------------------------------------------------------------
# Next.js Development
# -----------------------------------------------------------------------------
dev:
	cd frontend-nextjs && npm run dev

test:
	cd frontend-nextjs && npm test

lint:
	cd frontend-nextjs && npm run lint

typecheck:
	cd frontend-nextjs && npx tsc --noEmit

# -----------------------------------------------------------------------------
# Build (CI/CD compatible)
# -----------------------------------------------------------------------------
ci-build:
	cd frontend-nextjs && npm ci && npm run build

# -----------------------------------------------------------------------------
# Setup
# -----------------------------------------------------------------------------
setup:
	cd frontend-nextjs && npm install
