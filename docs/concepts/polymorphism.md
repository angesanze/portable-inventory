# Polymorphism & Domain Model

Varasto uses a polymorphic domain model to decouple the "Blueprint" of an item from its "Instance".

## 1. The Product Model (`ProductModel`)
This represents the **Class** or **Definition** of an item.

*   **Role**: Defines *what* the item is.
*   **Attributes**: `SKU`, `Name`, `Description`, `Category`.
*   **Behavior**: Defined by the `strategy_id`.
*   **Example**: "MacBook Pro M1 (2020)"

## 2. The Physical Product (`PhysicalProduct`)
This represents a **Concrete Instance** of a Product Model.

*   **Existence**: Only exists for **Serialized** (Individual) items.
*   **Role**: Tracks the specific lifecycle of a unique asset.
*   **Attributes**: `Serial Number`, `Status` (New, Used, Broken), `Custom Fields` (IP Address, Firmware).
*   **Location**: Can be strictly tracked to a specific user or shelf.
*   **Example**: "MacBook Serial #C02XY123Z"

## 3. The Unified Ledger (`Movement`)
Regardless of whether an item is Bulk, Serialized, or Batched, all state changes are recorded in a single table: `InventoryMovement`.

| ID | Model | From | To | Qty | Batch | Physical |
|----|-------|------|----|-----|-------|----------|
| 1  | Screw | Vendor | Shelf A | 500 | NULL | NULL |
| 2  | Laptop | IT Room | John Doe | 1 | NULL | #12345 |
| 3  | Milk | Vendor | Fridge | 10 | Lot-99 | NULL |

This unification allows for powerful cross-domain reporting (e.g., "Total Inventory Value") without complex joins across disparate tables.
