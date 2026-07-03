---
type: reference
title: Scaling Guide
created: 2026-04-22
tags:
  - operations
  - scaling
  - performance
related:
  - '[[deployment]]'
  - '[[monitoring]]'
  - '[[troubleshooting]]'
---

# Scaling Guide

## When to Scale

| Signal | Action |
|--------|--------|
| API p95 > 500ms consistently | Add backend workers or optimize queries |
| Database CPU > 70% | Add read replicas or optimize queries |
| QR scan volume > 10k/day | Consider CDN for SDK, caching for scan resolution |

## Database Read Replicas

When the primary database becomes a bottleneck for read-heavy widget queries:

### Setup

```python
# config/settings.py
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        # ... primary connection
    },
    'replica': {
        'ENGINE': 'django.db.backends.postgresql',
        # ... replica connection
    }
}

DATABASE_ROUTERS = ['config.db_router.ReadReplicaRouter']
```

### Router

```python
# config/db_router.py
class ReadReplicaRouter:
    def db_for_read(self, model, **hints):
        # Route widget reads to replica
        if model._meta.app_label == 'inventory':
            return 'replica'
        return 'default'

    def db_for_write(self, model, **hints):
        return 'default'

    def allow_relation(self, obj1, obj2, **hints):
        return True

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        return db == 'default'
```

### Considerations

- Replica lag: stock data may be 1-2 seconds stale — acceptable for display, not for transactions
- Always write to primary, read from replica only for non-critical queries
- Use `using('default')` explicitly for reads that must be fresh (e.g., pre-transaction stock checks)

## CDN for SDK Distribution

When widget deployments scale globally:

### Setup

1. Build SDK: `cd sdk && npm run build`
2. Upload `dist/` to CDN (CloudFront, Cloudflare R2, etc.)
3. Update SDK docs with CDN URL:
   ```html
   <script src="https://cdn.yourdomain.com/sdk/v1/portable-inventory-sdk.umd.js"></script>
   ```

### Cache Headers

```
Cache-Control: public, max-age=31536000, immutable
```

Version the SDK path (`/sdk/v1/`, `/sdk/v2/`) so cache-busting is unnecessary.

## Horizontal Backend Scaling

The default stack runs a single `backend` service. To run more than one backend
instance, place a load balancer (e.g. nginx, Caddy, or a cloud LB) in front of
several backend containers and round-robin `/api/` requests across them.

**Important:** With multiple instances, ensure:

- Session/auth is stateless (JWT is, by default) or backed by shared storage
- File uploads go to shared storage (S3/NFS), not local disk
- Migrations run on only one instance before deployment
