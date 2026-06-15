# Contributing — Portable Inventory

## Conventions

### Two API surfaces (don't mix them)
- **Public widget API** — `backend/inventory/api/public/viewsets/**`, API-key authenticated, consumed by the embeddable widget + external integrations. Error bodies and field shapes here are a public contract: change with care.
- **Dashboard/admin API** — `backend/inventory/views/**` (+ `core/`), JWT/session auth, company-scoped via `CompanyScopedViewSet`. New tenant-facing domains live here.

When adding a domain, pick the surface deliberately and follow its existing patterns (scoping, error envelope). New order domains share `serializers/orders_base.CompanyScopedOrderSerializerMixin` for effective-company resolution.

### Error envelope
Dashboard endpoints return DRF's `{"detail": ...}` (raise `ValidationError`/`PermissionDenied`) and propagate `InventoryError.status_code` (use `status=e.status_code`, never a hardcoded 400). The legacy `{"error": ...}` shape survives in a few public-widget paths only.

### Italian/English naming
Domain nouns are intentionally Italian (`giacenza` = stock-on-hand, `fornitore` = supplier, `cliente` = customer, `magazzino` = warehouse). Code structure (class names, methods, modules) stays English. Keep domain nouns IT, structure EN — don't "fix" the Italian identifiers.

## Development

See the `Makefile` for common tasks:

- `make up` / `make down` — run the dev stack via Docker Compose
- `make migrate` / `make makemigrations` — database migrations
- `make test-all` — backend + frontend + SDK tests, type checks, API schema validation
- `make lint` — ruff (backend) + eslint (frontend)

Documentation lives in `docs/` and is built with MkDocs (`mkdocs serve`).
