# Welcome to Varasto

**Varasto** is a modern, open-source system for managing mixed inventory types—from bulk consumables to serialized assets—in a single, unified interface.

[Get Started](getting-started/index.md){ .md-button .md-button--primary } [View Concepts](concepts/index.md){ .md-button }

---

## Why Varasto?

| Feature | Description |
| :--- | :--- |
| **Polymorphic** | Treat a screw, a laptop, and a batch of glue with distinct logic, all in one DB. |
| **Audit-Ready** | An append-only `Movement` ledger records every stock change. For bulk products the on-hand quantity is derived directly from the ledger; for batch/serialized items the ledger is a parallel audit trail (see [Theory §4.3](concepts/theory.md)). |
| **Context-Aware UI** | The interface adapts to the item type (e.g., showing "+/-" for bulk, "Assign User" for assets). |
| **Modern Stack** | Built with Python (Django), React (Refine), and Docker. |

## Documentation Structure

*   **[Getting Started](getting-started/index.md)**: Installation, Environment Setup, and First Run.
*   **[Concepts](concepts/index.md)**: Understanding the "Strategy" pattern and Domain Model.
*   **[Guides](guides/daily-usage.md)**: Step-by-step manuals for Operators and Admins.
*   **[Reference](reference/api.md)**: API Documentation, Architecture, and Specifications.
*   **[Development](development/index.md)**: How to contribute, run tests, and extend the system.
