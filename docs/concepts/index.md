# Core Concepts

Varasto is designed to solve the "Multi-Domain Inventory Problem".

## The Problem
Construction companies, hospitals, and IT departments manage mixed inventory types:
*   **Bulk Consumables** (Nails, Bandages)
*   **Serialized Assets** (Drills, MRI Machines)
*   **Perishable Batches** (Glue, Medicine)

Traditional software forces you to choose between an **Asset Manager** (good for distinct items) or a **WMS** (good for bulk), or hacking it all into a spreadsheet.

## The Solution
**Varasto** unifies these worlds using a **Polymorphic Database**.

### Key Pillars
1.  **[Polymorphism](polymorphism.md)**: Separating the "Blueprint" from the "Instance".
2.  **[Strategies](strategies.md)**: Pluggable logic engines that define how stock behaves.
3.  **[Math Theory](theory.md)**: A ledger-based approach where every change is recorded as an immutable `Movement`. For **bulk** products stock is a pure derivative of that ledger (`Σ in − Σ out`); **batch**- and **serial**-tracked products keep their own quantities/rows, with the ledger as a parallel audit trail.

By abstracting "Inventory" into these primitives, the system can adapt to manage almost any physical good without code changes.
