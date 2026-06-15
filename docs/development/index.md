# Engineering Methodology

## 1. Guiding Principles

### 1.1 "Strategy Pattern" over "If-Else"
In a polymorphic system, "If-Else" chains are the root of all evil.
*   **Bad**: `if product.type == 'SERIALIZED': do_this() elif product.type == 'BULK': do_that()`
*   **Good**: `strategy_engine.process_movement(product, quantity)`
We define an abstract base class `StrategyEngine` and enforce that every specific engine (`CounterEngine`, `TrackerEngine`) implements the standard methods (`validate`, `move`, `create`). This makes the system extensible without modifying core code.

### 1.2 "Thin Views, Fat Services"
Our Django Views (Controllers) are incredibly thin. They do not contain business logic.
*   **View Role**: Authenticate user -> Parse JSON -> Call Service -> Return JSON.
*   **Service Role**: Validate Rules -> Check Permissions -> Update DB -> Handle Transactions -> Return Result.
This ensures that whether a request comes from the Web UI, the Mobile App, or a CLI script, the **Business Logic is identical**.

### 1.3 "Double-Entry" Integrity
Data integrity is paramount. We use Database Constraints (`CHECK constraints`, `FOREIGN KEYS`) to enforce logic at the lowest level.
*   Example: A database constraint prevents `quantity` from being negative for Bulk items.
*   Example: A constraint prevents a `PhysicalProduct` from having a duplicate `serial_number` within the same `company`.

---

## 2. The Development Lifecycle

### 2.1 Backend-First Design (Schema Driven)
We start every feature by designing the **Data Model**.
1.  **Schema**: What does the table look like?
2.  **Constraints**: What is physically impossible? (Constraint: A laptop cannot be in two places).
3.  **Service Layer**: exposing the "Verbs" (Move, Create, Retire).
4.  **API Layer**: Exposing the Service via REST endpoints.

### 2.2 Component-Driven Frontend (React + Refine)
We treat the UI as a reflection of the Data State, minimized by "Magic".
*   We use **React Context** to share global state (e.g., Create Wizard Steps).
*   We build **Atomic Components** (e.g., `LocationSelector`, `ProductSearch`) that are reused across different pages.
*   **Refine.dev** handles the "boring" CRUD wiring (Routing, Auth, Tables), allowing us to focus on the custom "Wizard" logic and "Widget" interactions.

### 2.3 Testing Strategy
We employ a "Pyramid" testing strategy:
1.  **Unit Tests (Models/Services)**: `tests/test_ledger.py`. Does the math work? Does the double-entry balance? (Coverage: 100% of critical paths).
2.  **Integration Tests (Views)**: Does the API accept valid JSON and reject invalid JSON?
3.  **E2E / Verification Scripts**: We use scripts like `debug_create.py` to simulate complex user flows (Create Product -> Receive Stock -> Move Stock) in a realistic environment.

---

## 3. DevOps & Infrastructure

### 3.1 Containerization (Docker)
Everything runs in Docker.
*   `backend`: Python environment.
*   `frontend`: Node.js/Vite environment.
*   `db`: PostgreSQL.
*   `docs`: MkDocs.
This ensures "It works on my machine" means "It works in Production".

### 3.2 Blue/Green Deployment (Planned)
To ensure high availability, we architecture for Blue/Green deployments.
*   Two instances of the backend (`blue`, `green`) run simultaneously.
*   **Traefik** (Reverse Proxy) routes traffic to the active instance.
*   Updates are applied to the idle instance, health-checked, and then traffic is hot-swapped.

### 3.3 Configuration Management
*   Environment variables (`.env`) manage secrets and flags.
*   `settings.py` reads these variables to configure Debug modes, Database URLs, and Allowed Hosts.

---

## 4. Documentation Culture
Documentation is not an afterthought; it is a deliverable.
*   **Code Comments**: Explain *Why*, not *What*.
*   **MkDocs**: Central knowledge base for "The Big Picture".
*   **ADR (Architecture Decision Records)**: (Future) We will record major architectural decisions (e.g., "Why we chose Integer IDs over UUIDs for movements") to preserve institutional memory.
