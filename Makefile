.PHONY: up down build backend-admin migrate makemigrations shell test test-all test-backend test-frontend test-sdk typecheck lint

test:
	docker compose run --rm backend pytest

test-backend:
	cd backend && python -m pytest -q

test-frontend:
	cd frontend && npm test -- --run

test-sdk:
	cd sdk && npm run build && npm test

typecheck:
	# Frontend root tsconfig is references-only (`files: []`), so a bare
	# `tsc --noEmit` checks NOTHING (false green). `tsc -b --force` type-checks
	# the referenced app+node projects in full (they set `noEmit`, so nothing is
	# emitted); `--force` ignores the stale .tsbuildinfo incremental cache.
	cd frontend && npx tsc -b --force
	cd sdk && npx tsc --noEmit

lint:
	cd backend && ruff check . && ruff format --check .
	cd frontend && npx eslint .

test-all:
	@echo "=== Backend Tests ==="
	cd backend && python -m pytest -q
	@echo ""
	@echo "=== Frontend Tests ==="
	cd frontend && npm test -- --run
	@echo ""
	@echo "=== SDK Build & Test ==="
	cd sdk && npm run build && npm test
	@echo ""
	@echo "=== Type Checking ==="
	cd frontend && npx tsc -b --force
	cd sdk && npx tsc --noEmit
	@echo ""
	@echo "=== API Schema Validation ==="
	cd backend && python manage.py spectacular --validate --fail-on-warn --file /dev/null
	@echo ""
	@echo "=== All checks passed ==="

up:
	docker compose up

down:
	docker compose down

build:
	docker compose build

backend-admin:
	docker compose run --rm backend python manage.py createsuperuser

migrate:
	docker compose run --rm backend python manage.py migrate

makemigrations:
	docker compose run --rm backend python manage.py makemigrations

shell:
	docker compose run --rm backend python manage.py shell
