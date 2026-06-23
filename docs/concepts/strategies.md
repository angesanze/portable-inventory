# Inventory Profiles, Engines & Strategies

The core flexibility of Varasto comes from its **profile system**. Instead of
forcing all items to behave the same way, each `ProductModel` is assigned an
**inventory profile** — a named, valid combination of three legacy axes
(`tracking_mode`, `engine_type`, `strategy_type`). There are **7 profiles**
backed by **6 calculation engines**.

## Profile → engine → behavior map

The canonical mapping lives in `inventory/profiles.py` (`PROFILE_MAP`) and the
engine factory in `inventory/engines/factory.py`:

| Profile (`profile`) | Engine (`engine_type`) | Write behavior | `tracking_mode` |
| :--- | :--- | :--- | :--- |
| `SIMPLE_COUNT`    | `counter`    | Bulk       | `BULK` |
| `UNIT_CONVERSION` | `converter`  | Bulk       | `BULK` |
| `DIMENSIONAL`     | `dimension`  | Bulk       | `BULK` |
| `BATCH_TRACKED`   | `bucket`     | Batch      | `BATCH` |
| `PERISHABLE`      | `time_based` | Batch      | `BATCH` |
| `SERIALIZED`      | `tracker`    | Serialized | `INDIVIDUAL` |
| `ASSEMBLED`       | `counter` (+ assembly pattern) | Assembled | `BULK` |

> There is **no dedicated "Composite/Assembly" engine**. An assembled product
> is a `counter`-engine product whose composition is described by
> `ProductComponent` rows and produced/consumed through a `WorkOrder`.

## The 6 engines

### 1. `counter` — Simple Count
*   **Profile**: `SIMPLE_COUNT`
*   **Use case**: Screws, water, T-shirts, generic cables.
*   **Mechanism**: Stock is fungible; one unit is identical to another. Tracks a
    single `Quantity` (Decimal) per `Location`. Optional non-negative guard.

### 2. `converter` — Unit Conversion
*   **Profile**: `UNIT_CONVERSION`
*   **Use case**: Items consumed in a different unit than they are stocked
    (e.g. stock in liters, consume in bottles).
*   **Mechanism**: Multiplies the input quantity by a configurable ratio before
    applying it to the bulk stock.

### 3. `dimension` — Dimensional (Area / Volume)
*   **Profile**: `DIMENSIONAL`
*   **Use case**: Fabric, sheet metal, flooring — anything measured by a formula
    over dimensions (length × width, etc.).
*   **Mechanism**: Evaluates a configured formula via the safe expression parser
    (no `eval`) to compute the delta; stores the dimension inputs on the movement.

### 4. `bucket` — Batch / Lot Tracked
*   **Profile**: `BATCH_TRACKED`
*   **Use case**: Glue, chemicals, components tracked by lot number.
*   **Mechanism**: Stock is grouped into `ProductBatch` rows (lots). Items within
    a batch are fungible; different batches are distinct and individually
    traceable (recall by querying batch locations).

### 5. `time_based` — Perishable / Time-Based
*   **Profile**: `PERISHABLE`
*   **Use case**: Milk, vaccines, rentals — batches that carry an `expiry_date`.
*   **Mechanism**: A batch profile (like `bucket`) that additionally attaches
    `expiry_date` metadata, enabling FEFO consumption and the expiry monitor.

### 6. `tracker` — Serialized / Individual
*   **Profile**: `SERIALIZED`
*   **Use case**: Laptops, vehicles, high-value machinery.
*   **Mechanism**: Every unit is a unique `PhysicalProduct` (quantity always 1).
    Enforces unique identifiers, single-location occupancy, and status
    transitions (e.g. cannot check out a recalled item).

## The assembly pattern (`ASSEMBLED`)

*   **Profile**: `ASSEMBLED` (engine `counter` + `strategy_type=ASSEMBLY`)
*   **Use case**: First-aid kits, server racks, gift baskets.
*   **Mechanism**: The product is a virtual container whose recipe is a set of
    `ProductComponent` rows (child `ProductModel` + quantity). A `WorkOrder`
    drives production: building consumes the components from stock; the assembled
    quantity is tracked by the `counter` engine.

## Two abstractions, one product

Note that the *write/ledger* path and the *UI/calculation* path are deliberately
separate layers — see the dual-abstraction note in
[Architecture](../reference/architecture.md). `ProfileBehavior` decides how a
movement is committed to the ledger; `BaseEngine` decides how the widget renders
inputs and computes deltas.
