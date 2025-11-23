.PHONY: up down build shell migrate logs

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
