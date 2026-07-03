# Varasto

[![Documentation](https://img.shields.io/badge/docs-online-6366f1?logo=materialformkdocs&logoColor=white)](https://angesanze.github.io/portable-inventory/)
[![CI](https://github.com/angesanze/portable-inventory/actions/workflows/ci.yml/badge.svg)](https://github.com/angesanze/portable-inventory/actions/workflows/ci.yml)
[![Docs deploy](https://github.com/angesanze/portable-inventory/actions/workflows/docs.yml/badge.svg)](https://github.com/angesanze/portable-inventory/actions/workflows/docs.yml)

> **Naming:** the product is **Varasto**; **`portable-inventory`** is its
> technical slug (repository, Docker, package names). Both refer to the same
> project.

**Varasto** is a modern, open-source system for managing mixed inventory
types — from bulk consumables to serialized assets and perishable batches — in a
single, unified, multi-tenant interface. Stock behaviour is driven by a
per-product **profile** (7 profiles → 6 calculation engines), and every change
is written to an append-only `Movement` ledger.

## Tech stack

- **Backend:** Python · Django · Django REST Framework (PostgreSQL)
- **Frontend:** React · TypeScript · Refine · Vite · Tailwind CSS
- **Widget SDK:** embeddable web component (`sdk/`)
- **Docs:** MkDocs (Material)
- **Orchestration:** Docker Compose

## Quick start (Docker)

```bash
git clone https://github.com/angesanze/portable-inventory.git
cd portable-inventory
cp .env.example .env          # sensible defaults for local dev
docker compose up --build
```

Then open (the dev stack runs each service on its own port):

| Service | URL |
| :--- | :--- |
| Frontend (SPA) | http://localhost:5173 |
| Backend API | http://localhost:8001/api/v1/ (host `8001` → container `8000`; `8000` is left free to avoid a Portainer conflict) |
| Documentation | http://localhost:8002 |
| Demo widget host | http://localhost:8081 |

In normal use you browse the app at **:5173**; the Vite dev server proxies
`/api`, `/admin`, `/static` and `/go` to the backend.

## Development

```bash
make test-all     # backend (pytest) + frontend (vitest) + SDK + API schema
make test-backend # backend tests only
make lint         # ruff (backend) + eslint (frontend)
make typecheck    # tsc for frontend + SDK
```

Backend dev/test dependencies live in `backend/requirements-dev.txt`
(`pip install -r backend/requirements-dev.txt`); the production image installs
only `backend/requirements.txt`.

## Documentation

📖 **Live docs: <https://angesanze.github.io/portable-inventory/>** — auto-published
from [`docs/`](docs/) on every push to `main`.

Locally the docs are served by MkDocs at http://localhost:8002. Start with:

- [Getting Started](docs/getting-started/index.md)
- [Concepts → Strategies](docs/concepts/strategies.md) and [Theory](docs/concepts/theory.md)
- [Reference → Architecture](docs/reference/architecture.md), [API](docs/reference/api.md), [Specifications](docs/reference/specifications.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
