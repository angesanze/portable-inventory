---
type: reference
title: Webhooks
created: 2026-04-22
tags:
  - api
  - integration
  - webhooks
related:
  - '[[authentication]]'
  - '[[widget-api]]'
---

# Webhooks

> **Status:** Implemented. Delivery is handled by `NotificationService`
> (`inventory/services/notifications.py`) and persisted via the
> `NotificationChannel` / `NotificationDelivery` models — payloads are
> HMAC-SHA256 signed and retried with exponential backoff.

Webhooks let external systems receive a notification when a **monitoring rule
raises an alert** for a product, instead of polling. They are **not** a generic
change feed: a webhook fires only when a `MonitoringRule` opens a new `EventLog`
(e.g. stock crossed a threshold, or a batch is approaching expiry). Delivery
timing is described below.

## Event Types

The event `type` is the rule's trigger type (`inventory/constants.py`):

| Type | Raised when |
|------|-------------|
| `THRESHOLD` | A product's stock crosses a configured min/max threshold |
| `DATE_OFFSET` | A batch is within the configured window of its expiry date |
| `TEST` | A manual test delivery from the dashboard |

## Payload Format

The delivered body (`NotificationService._send_webhook`) is:

```json
{
  "event_id": "550e8400-...",
  "type": "THRESHOLD",
  "company_id": "550e8400-...",
  "product": {
    "id": "550e8400-...",
    "sku": "WIDGET-A",
    "name": "Widget A"
  },
  "payload": {
    "message": "Stock quantity 5 is below minimum threshold of 10.",
    "severity": "WARNING",
    "rule_id": "550e8400-...",
    "batch_id": null,
    "status": "OPEN"
  },
  "created_at": "2026-04-22T14:30:00Z"
}
```

## Delivery timing

There is **no real-time scheduler** in the default stack. Alerts are evaluated —
and their webhooks/emails delivered, plus any due retries flushed — when
`python manage.py check_rules` runs. Schedule it (cron, Celery beat, a k8s
CronJob, …) at whatever cadence your expiry/threshold SLAs require.

## Configuration

Webhooks are configurable per company via the Authority Dashboard:

- **URL:** an `http` or `https` endpoint to receive POST requests
- **Events:** the rule trigger types the channel subscribes to
- **Secret:** HMAC-SHA256 signing key for payload verification
- **Retry policy:** up to 5 attempts with exponential backoff (`2^n × 60s`), retried on the next `check_rules` run

## Security

- Payloads are signed with the `X-PI-Signature: sha256=<hex>` header (HMAC-SHA256 of the raw JSON body)
- Both `http` and `https` URLs are accepted; there is no IP allowlist, but URLs resolving to private / loopback / link-local addresses are refused at save time and again at send time (SSRF guard)
- Failed deliveries are recorded in `NotificationDelivery` for debugging

## Integration Pattern

Webhooks are the recommended way to react to inventory events. Polling the
existing API remains possible as a fallback (send the key as an `X-Api-Key`
header rather than in the URL):

```bash
# Poll every 60 seconds for stock changes
while true; do
  curl -s -H "X-Api-Key: $API_KEY" "https://your-domain.com/api/v1/widget/" | jq '.products'
  sleep 60
done
```
