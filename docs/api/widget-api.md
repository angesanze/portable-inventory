---
type: reference
title: Widget API Reference
created: 2026-04-22
tags:
  - api
  - integration
  - widget
related:
  - '[[authentication]]'
  - '[[webhooks]]'
---

# Widget API Reference

The Widget API powers the embeddable inventory widget. All endpoints are under `/api/v1/widget/` and require API key authentication.

Interactive API docs are also available at `/api/docs/` (Swagger UI) and `/api/redoc/` (ReDoc).

## Authentication

Every widget call is authenticated with a company **API key**, accepted three ways:

- `X-API-Key: <key>` header (preferred for server-side calls),
- `?api_key=<key>` query parameter,
- `api_key` in the JSON request body (for POSTs).

### QR token flow (recommended for QR scans)

QR redirects no longer put the long-lived key in the URL — that leaks it into
browser history, server logs, and `Referer` headers. Instead, scanning a code
hits `/go/<code>/`, which redirects to the widget with a **short-lived signed
token** (`?token=...`). The widget exchanges it once for the key:

```
POST /api/v1/widget/exchange_token/
Content-Type: application/json

{ "token": "<token-from-redirect>" }
```

**Response `200`:**

```json
{ "api_key": "abc123" }
```

Tokens expire after ~10 minutes (`410 Gone` afterwards — re-scan to get a fresh
one). Keep the returned key in memory / `sessionStorage`; never put it back in
the URL. The SDK helper `PortableInventory.exchangeToken(token)` wraps this call.

> **Deprecated:** embedding `?api_key=<key>` directly in a QR-code URL. Use the
> token exchange above. Passing `api_key` on ordinary direct API calls is still
> supported. See [API Versioning Policy](versioning.md).

## Products

### List Products

```
GET /api/v1/widget/?api_key={key}
```

Returns all products with stock info for the company.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `api_key` | string | Yes | Company API key |
| `location_id` | UUID | No | Filter stock by location |

**Example:**

```bash
curl "https://your-domain.com/api/v1/widget/?api_key=abc123"
```

**Response:**

```json
{
  "company": "Acme Corp",
  "products": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Widget A",
      "sku": "WA-001",
      "stock_display": "150 units",
      "engine_type": "STANDARD"
    }
  ],
  "poly_products": []
}
```

### Get Product Details

```
GET /api/v1/widget/{id}/?api_key={key}
```

Returns detailed product info including stock breakdown by location.

### Process Transaction

```
POST /api/v1/widget/{id}/transaction/
```

Add or subtract stock for a product.

**Request Body:**

```json
{
  "api_key": "abc123",
  "direction": "Inbound",
  "quantity": 50,
  "location_id": "550e8400-e29b-41d4-a716-446655440001",
  "reason": "Purchase order received"
}
```

**Response:**

```json
{
  "success": true,
  "new_stock_display": "200 units"
}
```

## Movements

### Stock Adjustment

```
POST /api/v1/widget/move/
```

Handle inbound/outbound stock adjustment via the InventoryOrchestrator.

**Request Body:**

```json
{
  "api_key": "abc123",
  "product_id": "550e8400-...",
  "location_id": "550e8400-...",
  "direction": "Inbound",
  "quantity": 25,
  "reason": "Receiving"
}
```

### Stock Transfer

```
POST /api/v1/widget/transfer/
```

Transfer stock between two physical locations.

**Request Body:**

```json
{
  "api_key": "abc123",
  "product_id": "550e8400-...",
  "from_location_id": "550e8400-...",
  "to_location_id": "550e8400-...",
  "quantity": 10,
  "reason": "Warehouse rebalance"
}
```

## Inventory Queries

### List Physical Items

```
GET /api/v1/widget/items/?api_key={key}&product_id={id}
```

List active physical items (serialized units) for a product.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `product_id` | UUID | Yes | Product model UUID |
| `location_id` | UUID | No | Filter by location |

### List Batches

```
GET /api/v1/widget/batches/?api_key={key}&product_id={id}
```

List batches with remaining stock for a product.

## Locations

### List Locations

```
GET /api/v1/widget/locations/?api_key={key}
```

Returns active locations for the company (excludes VIRTUAL type).

### Create Location

```
POST /api/v1/widget/create_location/
```

**Request Body:**

```json
{
  "api_key": "abc123",
  "name": "Warehouse B",
  "type": "WAREHOUSE"
}
```

### Get Location Inventory

```
GET /api/v1/widget/location_inventory/?api_key={key}&location_id={id}
```

Returns inventory breakdown for a specific location.

## QR Codes

### Get QR Info

```
GET /api/v1/widget/qr_info/?api_key={key}&code={code}
```

Returns QR code status, target type, and target ID.

### Configure QR Code

```
POST /api/v1/widget/configure_qr/
```

Assign a VIRGIN QR code to a product, item, or work order. Transitions status to CONFIGURED.

**Request Body:**

```json
{
  "api_key": "abc123",
  "code": "QR-ABC-123",
  "target_type": "PRODUCT",
  "target_id": "550e8400-..."
}
```

### Lock QR Code

```
POST /api/v1/widget/lock_qr/
```

Lock a CONFIGURED QR code, preventing further changes.

```json
{
  "api_key": "abc123",
  "code": "QR-ABC-123"
}
```

## Work Orders

### List Open Work Orders

```
GET /api/v1/widget/work_orders/?api_key={key}
```

Returns open work orders for the company.

## Error Responses

All errors follow a consistent format:

```json
{
  "error": "Human-readable error message",
  "code": "error_code",
  "details": {
    "field_specific": "info"
  },
  "request_id": "uuid-for-support"
}
```

### Common Status Codes

| Code | Meaning |
|------|---------|
| 400 | Validation error or bad request |
| 401 | Missing or invalid API key |
| 403 | API key lacks required permission |
| 404 | Resource not found |
| 409 | Conflict (insufficient stock, invalid state transition) |
| 429 | Rate limit exceeded |

## Widget Iframe Security

When embedding the widget via an `<iframe>`, apply the `sandbox` attribute to limit capabilities:

```html
<iframe
  src="https://your-domain.com/widget/?api_key=abc123"
  sandbox="allow-scripts allow-same-origin allow-forms"
  referrerpolicy="strict-origin-when-cross-origin"
></iframe>
```

**Recommended `sandbox` values:**

| Directive | Purpose |
|-----------|---------|
| `allow-scripts` | Required for widget JavaScript to run |
| `allow-same-origin` | Required for API requests to the host |
| `allow-forms` | Required for form submissions (transactions) |

Do **not** add `allow-top-navigation`, `allow-popups`, or `allow-modals` unless your integration specifically requires them. This limits the attack surface if the widget content is ever compromised.
