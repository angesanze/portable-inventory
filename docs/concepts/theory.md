# Mathematical Formulation of Unified Inventory Theory

## Abstract

The **Unified Inventory Theory** postulates that all inventory management problems, regardless of their apparent complexity (simple counts, continuous measurements, serialized assets, or segmented batches), can be modeled as a single **State Machine** governed by a specific topological structure and a transition function.

This document provides the formal mathematical definition of the system implemented in `portable-inventory`.

---

## 1. General Definition

Let $I$ be an Inventory System. The state of a specific Product Item at time $t$ is denoted by $S_t$.
A Transaction $T$ represents a perturbation or delta to the system.

The fundamental equation of the system is:

$$ S_{t+1} = f(S_t, T) $$

Where:
*   $S_t \in \mathcal{K}$ (The configuration space of the stock)
*   $T \in \mathcal{T}$ (The space of possible transactions)
*   $f: \mathcal{K} \times \mathcal{T} \rightarrow \mathcal{K}$ (The Engine Function)

The distinction between "Simple", "Batch", and "Serialized" inventory is purely a distinction of the **Topology** of the space $\mathcal{K}$ and the definition of the function $f$.

---

## 2. The Engine Topologies (Calculators)

The system implements this theory through specific **Engine Classes**, each handling a distinct topological space.

### 2.1 Scalar Engine (The `CounterEngine`)

This engine models fungible goods where identity is irrelevant, and only quantity matters (e.g., screws, liters of fluid, kg of powder).

*   **Class**: `CounterEngine`
*   **Space**: $\mathcal{K} = \mathbb{R}$ (The set of Real numbers)
*   **State**: $s \in \mathbb{R}$ (e.g., $10.50$ Kg)
*   **Transaction**: $T = \{ \Delta q \}$ where $\Delta q \in \mathbb{R}$

The transition function is a simple linear translation:

$$ f(s, \Delta q) = s + \Delta q $$

*Implementation Notes*:
*   If `config.step` is integer, $\mathcal{K} = \mathbb{Z}$.
*   If `config.allow_negative = False`, domain is restricted to $\mathbb{R}_{\ge 0}$.

### 2.2 Segmented Engine (The `BucketEngine`)

This engine models non-fungible groups of fungible goods. Identity exists at the group level, but quantity exists within the group (e.g., specific production lots, expiry dates).

*   **Class**: `BucketEngine`
*   **Space**: $\mathcal{K} = \mathcal{P}(\mathbb{I} \times \mathbb{R})$ (Power set of tuples of Identifier and Quantity)
*   **State**: $S = \{ (id_1, q_1), (id_2, q_2), ... \}$
*   **Transaction**: $T = \{ id, \Delta q \}$

The transition function is defined per-component:

$$ f(S, \{id, \Delta q\}) = \{ (k, v') \mid (k, v) \in S \} \cup \{ (id, \Delta q) \mid id \notin S_{keys} \} $$

Where for a matching component $(id, q) \in S$:
$$ v' = q + \Delta q $$

*Implementation Notes*:
*   This creates a "Bag of Tuples" topology.

### 2.3 Serialized Engine (The `Tracker` / `CounterEngine` variant)

This is a special case of the Segmented Engine where the quantity is strictly binary (existence) and usually singular per identifier.

*   **Class**: `CounterEngine` (configured as Tracker) or specialized `TrackerEngine`
*   **Space**: $\mathcal{K} = \mathcal{P}(\mathbb{I})$ (Set of Identifiers)
*   **State**: $S = \{ id_1, id_2, ... \}$
*   **Transaction**: $T = \{ id, \text{op} \}$ where $\text{op} \in \{ \text{ADD}, \text{REMOVE} \}$

$$ f(S, \{id, \text{ADD}\}) = S \cup \{id\} $$
$$ f(S, \{id, \text{REMOVE}\}) = S \setminus \{id\} $$

---

## 3. The Converter Engine (Linear Transformation)

The `ConverterEngine` introduces a dimensional transformation. It maps a transaction in one unit space (Input Space $\mathcal{U}_{in}$) to a delta in the stock space (Storage Space $\mathcal{U}_{store}$).

*   **Class**: `ConverterEngine`
*   **Transformation**: $L: \mathcal{U}_{in} \rightarrow \mathcal{U}_{store}$
*   **Coefficient**: $k$ (The conversion ratio)

$$ f(S, \Delta_{in}) = S + (\Delta_{in} \cdot k) $$

This allows the system to receive inputs in "Boxes" while tracking stock in "Units", or receive "Hours" while tracking consumption in "Liters".

---

## 4. Algebraic Properties and Invariants

A key advantage of this formalization is the ability to prove system properties.

### 4.1 Commutativity of Transactions
For the Scalar Engine ($\mathbb{R}$), transactions are commutative:
$$ f(f(S, T_a), T_b) = f(f(S, T_b), T_a) $$
$$ S + \Delta_a + \Delta_b = S + \Delta_b + \Delta_a $$

This implies that the *order* of arrival of asynchronous stock updates (e.g., from offline devices) does not affect the final state of the system, provided no boundary constraints (zero-crossing) are violated during the sequence.

### 4.2 Non-Commutativity in Bucket/Serialized
For Set-based engines, operations may be non-commutative if they involve creation/destruction of the same identifier.

$$ 
\text{Add}(id) \rightarrow \text{Remove}(id) \neq \text{Remove}(id) \rightarrow \text{Add}(id) 
$$

(The latter might fail if the system enforces existence constraints).

### 4.3 Conservation of Mass (per-transaction invariant)
Every transaction $T$ is a **Movement** vector affecting two states $S_{source}$ and $S_{dest}$:

$$ 
S_{source}' = f(S_{source}, -T) 
$$

$$ 
S_{dest}' = f(S_{dest}, +T) 
$$

so each movement conserves mass, $\Delta S_{total} = 0$ (in an open system the sum
includes the virtual Vendor/Customer/Adjustment/Transit nodes a movement is
booked against). The `Movement` ledger is therefore append-only and every
movement is individually auditable.

> **Scope of the invariant — important.** "Current stock is a *pure derivative*
> of the ledger" holds **only for `BULK` products** (`SIMPLE_COUNT`,
> `UNIT_CONVERSION`, `DIMENSIONAL`), where the on-hand quantity is computed as
> $\sum \text{in} - \sum \text{out}$ over `Movement` rows (see
> `services/stock.py`).
>
> For the other tracking modes the ledger is a **parallel audit log** that can
> *diverge* from the authoritative state:
>
> * `BATCH` (`BATCH_TRACKED`, `PERISHABLE`) → the source of truth is the mutable
>   field `ProductBatch.quantity`.
> * `INDIVIDUAL` (`SERIALIZED`) → the source of truth is the **count of
>   `PhysicalProduct`** rows in a location.
>
> The code says as much in the `services/stock.py` docstring. Treat the
> conservation law as a *per-transaction* guarantee, not a global "stock is
> always re-derivable from the ledger" guarantee. (A future ledger↔state
> reconciliation command could surface any drift.)

---

## 5. Derivation and Concrete Applications

This section demonstrates how the General Law derives into specific inventory operations used in daily business.

### 5.1 The "Coffee Silo" Derivation (Scalar)

**Given**:
*   Topological Space $\mathcal{K} = \mathbb{R}_{\ge 0}$ (Real positive numbers).
*   State $S_t$: Current fill level in Kg.
*   Transaction $T$: Consumption $\Delta c$.

**Derivation**:
From the general $f(S, T) = S + T$:

$$ 
S_{new} = S_{current} - \Delta c 
$$

**Concrete Example**:
*   **Initial State**: Silo contains $50.0$ Kg ($S_0 = 50.0$).
*   **Transaction**: Barista grinds $0.5$ Kg for a batch of espressos ($T = -0.5$).
*   **Result**: $S_1 = 50.0 - 0.5 = 49.5$ Kg.
*   **Invariant Check**: The "Consumption" virtual node (Bin) increases by $0.5$, preserving mass.

### 5.2 The "Yogurt Batch" Derivation (Vector)

**Given**:
*   Topological Space $\mathcal{K} = \text{Bag}(\text{Tuple})$.
*   Tuple Dimensions: $\langle \text{Expiry}, \text{FatContent} \rangle$.
*   State $S_t$: A collection of batches.

**Derivation**:
The transition function $f$ iterates over the set $S$ to find a matching vector $v \in S$ such that $v_{id} = T_{id}$.

$$ 
f(S, T) = \{ v' \mid v \in S, v_{id} = T_{id}, v'_{qty} = v_{qty} + T_{qty} \} \cup \{ v \mid v \in S, v_{id} \neq T_{id} \} 
$$

**Concrete Example**:
*   **Initial State**: Fridge contains $\{ (\text{Exp:Dec10}, 10\text{L}), (\text{Exp:Dec15}, 20\text{L}) \}$.
*   **Transaction**: Sell $5$ Liters from batch "Exp:Dec10".
*   **Result**: $\{ (\text{Exp:Dec10}, \mathbf{5\text{L}}), (\text{Exp:Dec15}, 20\text{L}) \}$.
*   **Application**: This prevents sending expired yogurt (Dec10) when fulfilling an order for fresh yogurt (Dec15), even though they are the same SKU.

### 5.3 The "Digital Twin" Derivation (Serialized)

**Given**:
*   $\mathcal{K} = \mathcal{P}(\mathbb{ UUID })$.
*   Constraint: Uniqueness ($\forall S, |S| = \text{count}(S)$).

**Concrete Example**:
*   **Initial State**: Warehouse A has $\{ \text{Laptop-001}, \text{Laptop-002} \}$.
*   **Transaction**: Move $\text{Laptop-001}$ to Office B.
*   **Step 1 (Source)**: $S_A' = S_A \setminus \{ \text{Laptop-001} \} = \{ \text{Laptop-002} \}$.
*   **Step 2 (Dest)**: $S_B' = S_B \cup \{ \text{Laptop-001} \}$.
*   **Result**: The asset strictly exists in exactly one location at any time $t$.

---

## 6. Implementation Topology

The software architecture mirrors this mathematical topology:

1.  **ProductModel** defines the topological space ($\mathbb{R}$, Vector, Set).
2.  **Engine** implements the transition function $f$.
3.  **Strategies** (InventoryStrategy) define the dimensions of the Vector space (e.g., $\{ \text{Expiry}, \text{BatchID} \}$).
4.  **Ledger** enforces the conservation invariant.

By adhering strictly to this formalism, `portable-inventory` avoids the "Spaghetti Code" trap of ad-hoc inventory logic, providing a robust, provable foundation for supply chain management.


