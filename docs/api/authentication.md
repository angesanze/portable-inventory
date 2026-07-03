---
type: reference
title: Authentication
created: 2026-04-22
tags:
  - api
  - integration
  - security
related:
  - '[[widget-api]]'
  - '[[webhooks]]'
---

# Authentication

Varasto supports two authentication methods depending on the client type.

## JWT Bearer Tokens (Authority Dashboard)

Used by the admin dashboard and server-to-server integrations that manage company settings.

### Obtain Tokens

```bash
curl -X POST https://your-domain.com/api/token/ \
  -H "Content-Type: application/json" \
  -d '{"username": "admin@company.com", "password": "your-password"}'
```

**Response:**

```json
{
  "access": "eyJ0eXAiOiJKV1...",
  "refresh": "eyJ0eXAiOiJKV1..."
}
```

### Use Access Token

Include the access token in the `Authorization` header:

```bash
curl https://your-domain.com/api/v1/product-models/ \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1..."
```

### Refresh Token

Access tokens expire after 15 minutes (refresh tokens after 7 days); both lifetimes are fixed in `SIMPLE_JWT`, not env-configurable. Use the refresh token to get a new access token:

```bash
curl -X POST https://your-domain.com/api/token/refresh/ \
  -H "Content-Type: application/json" \
  -d '{"refresh": "eyJ0eXAiOiJKV1..."}'
```

Refresh tokens expire after 7 days.

## API Key (Widget & External Integrations)

Used by the embeddable widget, SDK, and external integrations. API keys are scoped to a company and support granular permissions.

### Passing the API Key

API keys can be provided in three ways (checked in order):

1. **Query parameter:** `?api_key=your-key-here`
2. **Header:** `X-API-Key: your-key-here`
3. **Request body:** `{"api_key": "your-key-here"}`

### Example

```bash
curl "https://your-domain.com/api/v1/widget/?api_key=your-key-here"
```

### Permissions

API keys have granular permissions: `read`, `write`, `delete`. Each HTTP method maps to a permission:

| HTTP Method | Required Permission |
|-------------|-------------------|
| GET, HEAD, OPTIONS | `read` |
| POST, PUT, PATCH | `write` |
| DELETE | `delete` |

### Key Lifecycle

- Keys are created during company registration or via the API key management UI.
- Keys can be rotated (generates new key value, invalidates old).
- Keys have optional expiry dates — expired keys are rejected.
- Usage is tracked: `last_used_at` and `usage_count` update on each request.

## Domain Whitelisting

API keys support `allowed_domains` to restrict which origins can use the key. When configured, the widget SDK enforces origin checks to prevent unauthorized embedding.

## Rate Limits

| Scope | Limit |
|-------|-------|
| Widget API (sustained) | 1,000 requests/hour |
| Widget API (burst) | 100 requests/minute |
| Auth endpoints (login) | 10 requests/minute |
| Anonymous | 1,000 requests/day |
| Authenticated user | 100,000 requests/day |

Exceeding limits returns `429 Too Many Requests` with a `Retry-After` header.
