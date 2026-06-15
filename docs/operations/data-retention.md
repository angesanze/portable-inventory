---
type: reference
title: Data Retention & Tenant Deletion
created: 2026-06-12
tags:
  - operations
  - gdpr
  - data-retention
related:
  - '[[../api/versioning]]'
---

# Data Retention & Tenant Deletion

This page documents how a tenant's data can be **exported** (GDPR data
portability) and **erased** (right to be forgotten), and what survives a
deletion.

## Export (data portability)

A company owner — or a developer acting on a child tenant via the
`X-Acting-Company` header — can download a complete machine-readable dump:

```
GET /api/v1/platform/export/
```

- **Auth:** JWT bearer. Scoped to the *effective company* (own company, a child
  a developer owns, or — for a superuser — any company).
- **Rate limit:** 1 request/hour (severe, by design).
- **Format:** a streamed `application/zip` containing one JSON array per model
  plus a `manifest.json` (company id/name, export timestamp, per-model row
  counts). Nothing is staged on disk.

### Models included

`products`, `locations`, `suppliers`, `customers`, `movements`, `batches`,
`physical_products`, `qr_codes`, `event_logs`, `reservations`,
`purchase_orders`, `sales_orders`, `transfer_orders`, `return_orders`,
`work_orders`.

Foreign keys are exported as raw ids, so the object graph can be re-stitched on
import. The UI exposes this as **Impostazioni → Esporta dati azienda**.

## Deletion (right to be forgotten)

Tenant deletion is an operator command, not a self-service endpoint:

```bash
# Dry run — prints per-model row counts, deletes nothing:
python manage.py delete_company <company-uuid>

# Actually delete (cascade):
python manage.py delete_company <company-uuid> --confirm
```

- Without `--confirm` the command prints a **report only** and exits without
  changing anything.
- A **developer company that still owns child tenants is refused** — delete the
  children first, so tenants are never silently orphaned or cascade-deleted.
- Deletion runs inside a transaction. A `COMPANY_DELETED` row is written to
  `core.AuditLog` **before** the delete; because that row's company FK is
  `SET_NULL`, the audit trail survives the cascade.

### What is deleted

Everything that hangs off the company by FK, via Django `on_delete=CASCADE`:
the company row, its users, API keys, products and all product-scoped data
(movements, batches, physical products, event logs), locations, suppliers,
customers, QR codes, reservations, and every order type (purchase, sales,
transfer, return, work).

### What remains

Nothing tenant-identifying. The only residue is the **audit log entry** of the
deletion itself, with the company FK nulled — it records *that* a company was
deleted and the row counts, but no longer points at a (now non-existent)
company. This is intentional: it is the operator's durable evidence that the
erasure happened.

### Timing

Deletion is **immediate and irreversible**. There is no soft-delete or grace
window for the hard `delete_company` path. (To temporarily block access without
erasing data, suspend the company instead via the platform console — that flips
`is_active` and is fully reversible.)
