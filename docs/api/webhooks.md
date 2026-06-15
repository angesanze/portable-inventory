---
type: reference
title: Webhooks (Planned)
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

> **Status:** Planned for a future release. This document describes the intended design.

Webhooks will allow external systems to receive real-time notifications when inventory events occur, eliminating the need for polling.

## Planned Event Types

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

## Planned Payload Format

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

## Planned Configuration

Webhooks will be configurable per company via the Authority Dashboard:

- **URL:** HTTPS endpoint to receive POST requests
- **Events:** Select which event types to subscribe to
- **Secret:** HMAC-SHA256 signing key for payload verification
- **Retry policy:** Exponential backoff with 3 retries on failure (5s, 30s, 300s)

## Planned Security

- Payloads signed with `X-Webhook-Signature` header (HMAC-SHA256)
- HTTPS required for webhook URLs
- IP allowlisting optional
- Failed deliveries logged in event log for debugging

## Integration Pattern

Until webhooks are available, use polling with the existing API:

```bash
# Poll every 60 seconds for stock changes
while true; do
  curl -s "https://your-domain.com/api/v1/widget/?api_key=key" | jq '.products'
  sleep 60
done
```
