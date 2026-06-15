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
- **Deployment**: Single `backend` service published directly on `:8000`.
- **Database**: PostgreSQL.

### 3. Database (PostgreSQL)
- **Role**: Persistent data storage.
- **Models**: `License`, `Company`, `User`, `ApiKey`, `ProductModel`, `PhysicalProduct`, etc.

## Topology

```
db          (postgres :5432)
backend     (django :8000  -> 8000:8000)
frontend    (vite :5173    -> 5173:5173)   # proxies /api,/admin,/static,/go -> backend:8000
docs        (mkdocs :8002)
demo-client (nginx :8081)
```

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
