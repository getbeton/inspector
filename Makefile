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
	npm run dev

test:
	npm test

lint:
	npm run lint

typecheck:
	npx tsc --noEmit

# -----------------------------------------------------------------------------
# Build (CI/CD compatible)
# -----------------------------------------------------------------------------
ci-build:
	npm ci && npm run build

# -----------------------------------------------------------------------------
# Setup
# -----------------------------------------------------------------------------
setup:
	npm install
