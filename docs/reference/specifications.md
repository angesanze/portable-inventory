# Specifications

## Core Entities

> **Note:** there is no separate `License` model. Licensing lives on the
> `Company` (GOVERNANCE-11): the company carries its own license fields and
> usage caps.

### Company
- **Purpose**: Represents the tenant using the system (the multi-tenant root).
- **Fields**: `name`, `vat`, `settings` (JSON), `account_type`
  (`manager` | `developer`), `parent` (owning developer, for managed tenants),
  `is_active` (superadmin suspend switch).
- **Licensing fields**: `license_code` (login code), `license_expires_at`
  (null = perpetual), `max_users`, `max_products`, `max_managed_companies`
  (null = unlimited), `license_rotated_at`.

### User
- **Purpose**: Access control inside a company.
- **Fields**: Standard Django user fields + `role`
  (`OWNER` | `ADMIN` | `OPERATOR` | `VIEWER`; blank/legacy resolves to ADMIN),
  link to `Company`. The effective account type (manager/developer) comes from
  the user's company.

### ApiKey
- **Purpose**: External API / widget access for devices and integrations.
- **Fields**: `key_hash` (SHA-256 — the plaintext is shown once at creation and
  never stored), `key_prefix` (non-secret display prefix), `label`,
  `permissions` (read/write/delete/manage_qr/scan), `rate_limit_tier`
  (free/standard/premium), `default_location`, `allowed_domains`, `expires_at`,
  `is_active`, link to `Company`.

## Inventory Management

### ProductModel
- **Purpose**: The "blueprint" / catalog entry for a product (e.g. "iPhone 13 128GB").
- **Key field**: `profile` (one of the 7 inventory profiles — see
  [Strategies](../concepts/strategies.md)), which derives `tracking_mode` and
  `engine_type`.

### PhysicalProduct
- **Purpose**: A specific serialized instance of a product.
- **Fields**: `identifier` (the serial/unique id — **not** `serial_number`),
  `status` (see `STATUS_CHOICES`; e.g. `ACTIVE`, `RECALL`, `EXPIRED`),
  `batch_date`, link to `ProductModel`, link to `Location`, optional
  link to `WorkOrder`.

### ProductBatch
- **Purpose**: A lot/batch for `BATCH`-mode products (`BATCH_TRACKED`,
  `PERISHABLE`). Carries `quantity` and a `data` JSON blob (e.g. `expiry_date`).

### Location
- **Purpose**: Where items are stored (e.g. "Warehouse A"), including virtual
  counterparty locations (Vendor/Customer/Adjustment/Transit).

### Movement
- **Purpose**: The append-only ledger of inventory history (in / out / transfer).

## API Endpoints (selection)

Routes are registered under `/api/v1/` with hyphenated prefixes:

- `/api/v1/product-models/`: CRUD for product catalogs.
- `/api/v1/physical-products/`: Manage individual serialized items.
- `/api/v1/batches/`: Read batch-level stock (read-only).
- `/api/v1/work-orders/`: Batches/kits and composition.
- `/api/v1/locations/`: Manage storage locations.
- `/api/v1/api-keys/`: API key management (developer/superuser tiers).
- `/api/token/`: JWT authentication.
