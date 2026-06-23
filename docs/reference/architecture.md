# System Architecture

## Overview

Varasto is a modular web application designed for inventory management. It runs as a small set of services orchestrated by Docker Compose. The frontend is exposed directly on its own port and proxies API/admin traffic to the backend; there is no separate reverse proxy.

## Components

### 1. Frontend (Refine + Vite)
- **Tech Stack**: React, TypeScript, Refine, Vite, Tailwind CSS.
- **Role**: Single Page Application (SPA) serving the user interface, published directly on `:5173`.
- **Proxy**: The Vite dev server forwards `/api`, `/admin`, `/static`, and `/go` to `backend:8000`, so the frontend origin behaves like a single entry point.
- **Routing**:
    - `/*`: Main application routes.
    - `/login`: Authentication page.

### 2. Backend (Django REST Framework)
- **Tech Stack**: Python, Django, Django REST Framework.
- **Role**: API provider, business logic, and database interaction.
- **Deployment**: `backend` service listening on container port `:8000`, mapped to host `:8001` (host `8000` is left free to avoid the common Portainer conflict).
- **Database**: PostgreSQL.

### 3. Database (PostgreSQL)
- **Role**: Persistent data storage.
- **Models**: `Company`, `User`, `ApiKey`, `ProductModel`, `PhysicalProduct`, `ProductBatch`, `Movement`, etc. (There is no `License` model — licensing lives on `Company`.)

## Topology

```
db          (postgres :5432)
backend     (django :8000  -> 8001:8000)   # host 8001 (8000 left free for Portainer)
frontend    (vite :5173    -> 5173:5173)   # proxies /api,/admin,/static,/go -> backend:8000
docs        (mkdocs :8002)
demo-client (nginx :8081)
```

## Polymorphic Product Layering

A product's polymorphic behaviour is split across **two parallel abstractions**
on purpose — keep them distinct when extending the system:

| Layer | Base class | Lives in | Responsibility |
| :--- | :--- | :--- | :--- |
| Write / ledger | `ProfileBehavior` | `inventory/strategies.py` | How a movement is committed to the ledger (bulk vs batch vs serialized vs assembled). |
| UI / calculation | `BaseEngine` | `inventory/engines/` | How the widget renders inputs and computes the stock delta (e.g. counter, converter, dimension, bucket, time_based, tracker). |

The mapping is `profile → {tracking_mode, engine_type} → {behavior, engine}`,
resolved by `inventory/profiles.py` (`PROFILE_MAP`) and
`inventory/engines/factory.py`. A given `ProductModel` therefore picks up **both**
a `ProfileBehavior` (write path) and a `BaseEngine` (read/UI path) from its single
`profile` field. See [Strategies](../concepts/strategies.md) for the full table.

## Directory Structure

```
portable-inventory/
├── backend/                # Django Application
│   ├── config/             # Settings & URLs
│   ├── core/               # Auth, Tenants, Middleware
│   ├── inventory/          # Domain Logic (Models, Services)
│   └── requirements.txt
├── frontend/               # React Application
│   ├── src/
│   │   ├── features/       # Feature-based Modules
│   │   └── components/     # Shared UI Components
├── docs/                   # This documentation (MkDocs)
├── docker-compose.yml      # Orchestration
└── Makefile                # Helper commands
```
