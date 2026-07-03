---
type: reference
title: Monitoring Guide
created: 2026-04-22
tags:
  - operations
  - monitoring
  - alerting
related:
  - '[[deployment]]'
  - '[[troubleshooting]]'
  - '[[scaling]]'
---

# Monitoring Guide

## Key Metrics

### API Performance

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Response time (p95) | < 200ms | > 500ms | > 2s |
| Error rate (5xx) | < 0.1% | > 1% | > 5% |
| Request throughput | Baseline | -50% | -80% |
| Database query time | < 50ms | > 200ms | > 1s |

### Business Metrics

| Metric | What to Watch |
|--------|---------------|
| QR scan volume | Daily scan count, unusual spikes or drops |
| Widget API calls | Requests per API key, rate limit hits |
| Stock movements | Transaction volume, failed transactions |
| Active companies | New registrations, churn signals |

### Infrastructure

| Metric | Target |
|--------|--------|
| PostgreSQL connections | < 80% of `max_connections` |
| Disk usage (DB volume) | < 80% capacity |

## MonitoringRule System

The application has a built-in monitoring system (`inventory/monitors.py`) that evaluates rules against product data.

### Rule Types

**THRESHOLD** — Triggers when stock quantity crosses min/max boundaries:

```json
{
  "trigger_type": "THRESHOLD",
  "condition_config": { "min": 10, "max": 1000 },
  "severity": "WARNING"
}
```

**DATE_OFFSET** — Triggers when batch expiry dates approach:

```json
{
  "trigger_type": "DATE_OFFSET",
  "condition_config": { "date_field": "expiration_date", "days_offset": 30 },
  "severity": "CRITICAL"
}
```

**CUSTOM** — Reserved for custom expression evaluation (not yet implemented).

### How Rules Are Evaluated

1. `RuleEvaluator.evaluate_product(product_model)` is called per product
2. Individual thresholds from product `attributes` (e.g., `min_threshold`, `min_stock`) create virtual rules
3. Strategy-level rules from `MonitoringRule` are evaluated via the matching monitor class
4. Triggered conditions create `EventLog` entries with status `OPEN`

### EventLog States

| Status | Meaning |
|--------|---------|
| `OPEN` | Alert triggered, needs attention |
| `RESOLVED` | Issue addressed |
| `IGNORED` | Manually dismissed |

### Setting Up External Alerting

Connect EventLog to external systems by adding a post-save signal:

```python
# Example: Send alerts to external webhook
from django.db.models.signals import post_save
from inventory.models import EventLog

def notify_on_event(sender, instance, created, **kwargs):
    if created and instance.rule and instance.rule.severity == 'CRITICAL':
        # Send to Slack, PagerDuty, email, etc.
        pass

post_save.connect(notify_on_event, sender=EventLog)
```

## Django Logging

Backend logs are written to stdout (suitable for `docker compose logs`). Key loggers:

```bash
# Tail backend logs
docker compose logs -f backend

# Filter for errors
docker compose logs backend 2>&1 | grep -i error
```

## Health Checks

The Docker Compose stack includes health checks:

- **Backend:** HTTP check against `/admin/login/` (10s interval, 5 retries)
- **Database:** `pg_isready` (5s interval, 5 retries)

Add application-level health endpoint for deeper checks:

```bash
# Quick liveness check
curl -f http://localhost:8001/admin/login/ && echo "OK"

# Database connectivity (via Django)
docker compose exec backend python manage.py dbshell -c "SELECT 1"
```

## Active Notifications (email + webhook)

Monitoring rules that open an `EventLog` are delivered through the company's
`NotificationChannel`s (Settings → Notifications in the dashboard). Delivery is
synchronous inside the monitor run (`python manage.py check_rules`); failed
deliveries are retried with exponential backoff (max 5 attempts) at the start
of every subsequent run — no extra scheduler needed.

### Email environment variables

| Variable | Default | Notes |
|----------|---------|-------|
| `EMAIL_BACKEND` | console backend in `DEBUG`, SMTP otherwise | Override to force a backend |
| `EMAIL_HOST` | `localhost` | SMTP server |
| `EMAIL_PORT` | `587` | |
| `EMAIL_HOST_USER` | empty | |
| `EMAIL_HOST_PASSWORD` | empty | |
| `EMAIL_USE_TLS` | `True` | |
| `DEFAULT_FROM_EMAIL` | `notifications@portable-inventory.local` | Sender address |

### Webhook signature

Webhook POSTs carry an `X-PI-Signature: sha256=<hex>` header — the HMAC-SHA256
of the raw JSON body keyed with the channel's server-generated secret. Verify
on the receiver before trusting the payload. The secret is visible only to the
owning company via the API; it is never written to delivery logs.
