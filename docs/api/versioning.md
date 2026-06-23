---
type: reference
title: API Versioning Policy
created: 2026-06-12
tags:
  - api
  - versioning
  - policy
related:
  - '[[widget-api]]'
  - '[[authentication]]'
---

# API Versioning Policy

The Varasto REST API is **URL-versioned**. Every endpoint lives under a version
prefix:

```
/api/v1/...
```

The interactive schema is published at `/api/docs/` (Swagger UI) and
`/api/redoc/` (ReDoc); the raw OpenAPI document is at `/api/schema/`.

## What counts as a breaking change

A change is **breaking** (and requires a new major version, e.g. `/api/v2/`)
when it can break a correct existing client:

- Removing or renaming an endpoint, field, query parameter, or enum value.
- Changing a field's type or its meaning.
- Making a previously optional request field required.
- Changing authentication or the success status code of an operation.

The following are **non-breaking** and ship within `v1`:

- Adding a new endpoint.
- Adding an optional request field or query parameter.
- Adding a field to a response body.
- Adding a new enum value to a response (clients must tolerate unknown values).
- Relaxing a validation rule.

## Deprecation window

When an endpoint or field is slated for removal:

1. It is marked **deprecated** in the OpenAPI schema (drf-spectacular renders a
   strikethrough in Swagger/ReDoc).
2. Deprecated endpoints emit an **`X-API-Deprecated: true`** response header, and
   where applicable an `X-API-Sunset: <ISO-8601 date>` header naming the removal
   date.
3. The endpoint keeps working for a **minimum of 90 days** after the deprecation
   is published before it can be removed in a new major version.

### Currently deprecated

- **`?api_key=` embedded in QR URLs.** QR redirects (`/go/<code>/`) now emit a
  short-lived signed token exchanged once at
  `POST /api/v1/widget/exchange_token/`. The long-lived key must never travel in
  a URL. Passing `api_key` as a query parameter on *direct API calls* remains
  supported; only the QR-URL embedding is deprecated.

## Request-time version

DRF's `request.version` is **not** currently populated by a versioning class.
`URLPathVersioning` was evaluated but **not enabled**: the existing test suite
reverses routes without a `version` kwarg (e.g. `reverse('movement-list')`),
and `DEFAULT_VERSIONING_CLASS = URLPathVersioning` would make those reverses
require a `version` argument, breaking a large number of tests for zero runtime
benefit today. The `/api/v1/` prefix already encodes the version in the URL.

When `v2` is introduced, enable `URLPathVersioning` at that point and migrate
the route names together — the cost is paid once, deliberately, rather than
pre-emptively.

## Publishing the schema

The versioned schema is served by the backend via ReDoc at `/api/redoc/` and
Swagger UI at `/api/docs/` (e.g. `http://localhost:8001/api/docs/`). The
canonical machine-readable contract is `/api/schema/`.
