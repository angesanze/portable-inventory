---
type: reference
title: Troubleshooting Guide
created: 2026-04-22
tags:
  - operations
  - troubleshooting
  - debugging
related:
  - '[[monitoring]]'
  - '[[deployment]]'
---

# Troubleshooting Guide

## Company Isolation Leaks

**Symptom:** User sees data from another company, or API returns `403 Access denied`.

**Diagnosis:**

```bash
# Check if the request's company matches the resource
docker compose exec backend python manage.py shell -c "
from inventory.models import ProductModel
pm = ProductModel.objects.get(id='<product_id>')
print(f'Product company: {pm.company_id}')
"
```

**Common Causes:**

- Missing `company` filter in a custom queryset — all viewsets must filter by `request.user.company`
- API key used from wrong domain — check `ApiKey.allowed_domains` configuration
- Admin accidentally assigned user to wrong company

**Fix:** Verify all queryset methods include company scoping. The `CompanyIsolationError` exception (403) is deliberately vague to prevent information leakage.

---

## QR Code State Stuck

**Symptom:** QR code cannot be scanned or transitions fail with `409 Conflict`.

**Diagnosis:**

```bash
docker compose exec backend python manage.py shell -c "
from inventory.models import DynamicQRCode
qr = DynamicQRCode.objects.get(code='<qr_code>')
print(f'Status: {qr.status}, Product: {qr.product_model_id}')
"
```

**Common Causes:**

- QR code locked after configuration — locked codes reject further state changes
- Invalid transition attempted (e.g., trying to configure an already-active code)
- Batch generation created codes in unexpected initial state

**Fix:** Check `QRCodeStateError.allowed_transitions` in the error response for valid next states. If a code is genuinely stuck, an admin can update its `status` directly via Django admin or shell.

---

## Engine Configuration Validation Failures

**Symptom:** Creating or updating an engine returns `400 Invalid engine configuration`.

**Diagnosis:**

```bash
# The engine config is validated when creating/updating a product; the 400
# body carries the details. There is no separate "engines" endpoint.
curl -s -X POST http://localhost:8001/api/v1/product-models/ \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"sku":"X","name":"X","profile":"DIMENSIONAL","engine_config":{}}' | python -m json.tool
```

**Common Causes:**

- Missing required fields in `condition_config` for the engine type
- Engine type does not match the product's tracking mode (e.g., batch engine on a non-batch product)
- JSON schema validation failure on nested config objects

**Fix:** Check the `validation_errors` field in the error response. Each engine type has specific config requirements — see the strategy/engine documentation for valid schemas.

---

## Rate Limiting False Positives

**Symptom:** Legitimate API requests receive `429 Too Many Requests`.

**Diagnosis:**

```bash
# On a throttled response the server sends Retry-After (no x-ratelimit headers).
curl -v http://localhost:8001/api/v1/widget/?api_key=KEY 2>&1 | grep -i "retry-after"
```

**Common Causes:**

- Multiple widget instances on same page sharing an API key — each instance makes independent requests
- Automated scripts hitting the API without backoff
- Rate limit configured too aggressively for the use case

**Fix:**

1. Check the `retry_after` value in the error response and wait accordingly
2. Review rate limit configuration in `config/settings.py` (`REST_FRAMEWORK.DEFAULT_THROTTLE_RATES`)
3. For widget deployments with high scan volume, consider increasing per-key limits or using separate API keys per widget instance

---

## Database Connection Issues

**Symptom:** `OperationalError: could not connect to server` or connection pool exhaustion.

**Diagnosis:**

```bash
# Check database health
docker compose exec db pg_isready -U postgres

# Check active connections
docker compose exec db psql -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'portable_inventory';"
```

**Fix:**

- Verify `DATABASE_URL` is correct in environment
- Check if PostgreSQL container is healthy: `docker compose ps db`
- If connections exhausted, restart backend to release connections and consider connection pooling (see [Scaling](scaling.md))

---

## Common Docker Issues

**Container won't start:**

```bash
# Check logs
docker compose logs <service-name>

# Rebuild from scratch
docker compose build --no-cache <service-name>
docker compose up -d <service-name>
```

**Database volume corruption:**

```bash
# Back up and recreate
docker compose exec db pg_dump -U postgres portable_inventory > backup.sql
docker compose down -v  # WARNING: destroys volumes
docker compose up -d
docker compose exec -T db psql -U postgres portable_inventory < backup.sql
```

**Port conflicts:**

```bash
# Check what's using the port
lsof -i :5173  # Frontend (Vite)
lsof -i :8000  # Backend (Django)
lsof -i :5432  # PostgreSQL
```
