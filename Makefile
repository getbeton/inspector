.PHONY: up down build shell migrate logs test py-build py-test npm-build setup

up:
	docker-compose up -d

down:
	docker-compose down

build:
	docker-compose build

logs:
	docker-compose logs -f

shell:
	docker-compose exec backend /bin/bash

migrate:
	docker-compose exec backend alembic upgrade head

test:
	docker-compose exec backend pytest

# -----------------------------------------------------------------------------
# Local (non-Docker) checks
# -----------------------------------------------------------------------------
# These targets are useful for CI and for developers who don't want to run Docker
# just to catch syntax errors / run fast unit tests.
py-build:
	./scripts/python.sh -m compileall -q backend/app backend/tests frontend

py-test:
	./scripts/python.sh -m pytest -q backend/tests

npm-build:
	npm run build

setup:
	chmod +x ./scripts/python.sh ./scripts/setup.sh
	./scripts/setup.sh
