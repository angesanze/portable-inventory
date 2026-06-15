# Inventory Strategies

The core flexibility of Varasto comes from its **Strategy Engine**. Instead of forcing all items to behave the same way, each `ProductModel` is assigned a strategy that dictates how its stock is tracked, validated, and moved.

## 1. Simple / Counter Strategy
> **"The Infinite Bucket"**

*   **Symbol**: `CONVERTER` (or `SIMPLE` in UI)
*   **Use Case**: Screws, Water, T-Shirts, Generic Cables.
*   **Mechanism**:
    *   Stock is fungible. One unit is identical to another.
    *   Tracks only the `Quantity` (Decimal) at a `Location`.
    *   **Validation**: Ensures `Quantity >= 0`.

## 2. Serialized / Tracker Strategy
> **"The Unique Snowflake"**

*   **Symbol**: `INDIVIDUAL` (or `SERIALIZED`)
*   **Use Case**: Laptops, Vehicles, High-End Machinery, Key Fobs.
*   **Mechanism**:
    *   Stock is **Unique**. `Quantity` is always 1.
    *   Requires a `PhysicalProduct` record for every single unit.
    *   **Validation**:
        *   Prevents duplicate Serial Numbers.
        *   Prevents moving an item if it's already in another location.
        *   Enforces status transitions (e.g., cannot check out "Broken" items).

## 3. Batch / Bucket Strategy
> **"The Expiry Manager"**

*   **Symbol**: `BUCKET` (or `BATCH`)
*   **Use Case**: Milk, Glue, Chemicals, Vaccines.
*   **Mechanism**:
    *   Stock is grouped by a `Batch ID` (Lot Number).
    *   Items within a batch are fungible, but different batches are distinct.
    *   **Meta-Data**: Each batch carries data like `expiration_date` or `manufacturing_date`.
    *   **Traceability**: Allows full recall capability by querying the location of specific batches.

## 4. Composite / Assembly Strategy
> **"The Sum of Parts"**

*   **Symbol**: `COMPOSITION` (or `KIT`)
*   **Use Case**: First Aid Kits, Server Racks, Gift Baskets.
*   **Mechanism**:
    *   The "Product" is a virtual container.
    *   **Recipe**: Defined as a list of components (other `ProductModels`) + Quantities.
    *   **Assembly**: Creating 1 Kit triggers the *consumption* of its components from stock.
    *   **Disassembly**: Breaking down a Kit returns components to stock.
