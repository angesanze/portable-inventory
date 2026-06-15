---
type: reference
title: Deployment Guide
created: 2026-04-22
tags:
  - operations
  - deployment
  - docker
related:
  - '[[monitoring]]'
  - '[[scaling]]'
  - '[[troubleshooting]]'
---

# Deployment Guide

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- PostgreSQL 17 (bundled in Docker Compose, or external)
- Domain with DNS pointing to your server (for production)

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | Django secret key. Generate with `openssl rand -base64 32` |
| `DEBUG` | Yes | Set to `0` in production |
| `DJANGO_ALLOWED_HOSTS` | Yes | Space-separated hostnames (e.g., `yourdomain.com`) |
| `CORS_ALLOWED_ORIGINS` | Yes | Comma-separated origins (e.g., `https://yourdomain.com`) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SECURE_SSL_REDIRECT` | Recommended | Set to `1` to enforce HTTPS |
| `PUBLIC_BASE_URL` | Production | Public origin (e.g. `https://app.varasto.example`) baked into scanned QR codes; if unset, codes point at the internal host and lead nowhere |
| `JWT_ACCESS_TOKEN_LIFETIME_MINUTES` | No | Default: 1440 (1 day) |
| `JWT_REFRESH_TOKEN_LIFETIME_MINUTES` | No | Default: 10080 (7 days) |

## Docker Compose Setup

### Development

```bash
# Start all services
docker compose up -d

# Services available (each published directly on its own port):
#   http://localhost:5173       — Frontend (proxies /api,/admin,/static,/go -> backend)
#   http://localhost:8000/api/  — Backend API
#   http://localhost:8000/admin — Django Admin
#   http://localhost:8002       — Documentation (MkDocs)
#   http://localhost:8081       — Demo Client
```

### Production Override

Create `docker-compose.prod.yml` to override development defaults:

```yaml
services:
  backend:
    environment:
      - DEBUG=0
      - SECRET_KEY=${SECRET_KEY}
      - DJANGO_ALLOWED_HOSTS=${ALLOWED_HOSTS}
      - CORS_ALLOWED_ORIGINS=${CORS_ORIGINS}
      - DATABASE_URL=${DATABASE_URL}
      - SECURE_SSL_REDIRECT=1
    command: gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 4

  db:
    environment:
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - /var/lib/portable-inventory/postgres:/var/lib/postgresql/data
```

Launch with:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

> **TLS / reverse proxy (optional add-on):** the default stack publishes services on plain HTTP ports. If you need TLS termination or a single public entry point, you can put a reverse proxy (e.g. nginx, Caddy, Traefik) in front of `frontend:5173` and `backend:8000` yourself. This is not part of the default stack.

## Deployment

Deploy the single backend and frontend, then apply migrations:

1. **Build and start the services:**
   ```bash
   docker compose up -d --build backend frontend
   ```

2. **Run migrations:**
   ```bash
   docker compose exec backend python manage.py migrate
   ```

3. **Verify health:**
   ```bash
   docker compose exec backend python manage.py check --deploy
   curl -f http://localhost:8000/admin/login/ || echo "Health check failed"
   ```

## Database Migrations

Always run migrations as part of a deployment:

```bash
# Check pending migrations
docker compose exec backend python manage.py showmigrations --list | grep "\[ \]"

# Apply migrations
docker compose exec backend python manage.py migrate

# For irreversible migrations, back up first:
docker compose exec db pg_dump -U postgres portable_inventory > backup_$(date +%Y%m%d_%H%M%S).sql
```

## Pre-Deployment Checklist

```bash
# Run Django deployment checks
python manage.py check --deploy

# Validate API schema
python manage.py spectacular --validate --fail-on-warn

# Run full test suite
make test-all  # or scripts/test-all.sh

# Collect static files (production)
python manage.py collectstatic --noinput
```
