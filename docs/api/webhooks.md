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

Webhooks allow external systems to receive real-time notifications when
inventory events occur, eliminating the need for polling. The authoritative
list of emitted events lives in the code; the table below summarises them.

## Event Types

| Event | Description | Trigger |
|-------|-------------|---------|
| `stock.updated` | Stock level changed for a product at a location | Any inbound/outbound transaction or transfer |
| `stock.low` | Stock fell below configured threshold | Transaction that reduces stock below minimum |
| `movement.created` | New movement recorded | Any stock movement (inbound, outbound, transfer) |
| `work_order.completed` | Work order status changed to COMPLETED | Work order closure |
| `work_order.created` | New work order created | Work order creation |
| `qr.configured` | QR code assigned to a target | QR code configuration |
| `qr.locked` | QR code locked | QR code lock action |
| `qr.scanned` | QR code scanned via redirect | `/go/{code}/` redirect hit |
| `product.created` | New product model created | Product creation |
| `batch.created` | New batch created | Batch creation via work order |

## Payload Format

```json
{
  "event": "stock.updated",
  "timestamp": "2026-04-22T14:30:00Z",
  "company_id": "550e8400-...",
  "data": {
    "product_id": "550e8400-...",
    "product_name": "Widget A",
    "location_id": "550e8400-...",
    "location_name": "Warehouse A",
    "previous_quantity": 100,
    "new_quantity": 75,
    "change": -25,
    "reason": "Outbound shipment"
  }
}
```

## Configuration

Webhooks are configurable per company via the Authority Dashboard:

- **URL:** HTTPS endpoint to receive POST requests
- **Events:** Select which event types to subscribe to
- **Secret:** HMAC-SHA256 signing key for payload verification
- **Retry policy:** Up to 5 attempts with exponential backoff (`2^n × 60s`), retried on subsequent monitor evaluation runs

## Security

- Payloads signed with the `X-PI-Signature: sha256=<hex>` header (HMAC-SHA256 of the raw JSON body)
- HTTPS required for webhook URLs
- IP allowlisting optional
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
