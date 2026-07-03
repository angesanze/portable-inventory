"""Continuous weighted-average costing (COSTING-06).

`CostingService` maintains `ProductCost` (the running weighted-average unit
cost and valued quantity per product) as movements flow through the single
choke point `LedgerService.transfer_stock`. It also freezes the COGS unit
cost on each outbound movement so historical reports stay stable.

Direction is decided purely from the movement's locations:

  * INBOUND  — from a VIRTUAL location into real stock (a receipt). If the
    movement carries `purchased_cost`, it re-weights the average; without a
    cost it enters at the current average (no dilution).
  * OUTBOUND — out of real stock into a VIRTUAL or LOSS sink (a shipment,
    consumption, scrap). Freezes `cogs_unit_cost = avg_unit_cost` on the
    movement and reduces `valued_qty` (the average is unchanged on outbound).
  * INTERNAL — physical → physical transfer. No effect on cost: the goods
    never left the books.

Concurrency: callers (BulkBehavior et al.) already hold a `select_for_update`
lock on the ProductModel row for the duration of the enclosing
`transaction.atomic`. We re-lock the `ProductCost` row here with
`select_for_update` so two concurrent costing updates serialize even when the
product lock is not held (e.g. INDIVIDUAL/BATCH paths), giving a per-product
critical section around the average math.

Decimals: 4 internal places (see ProductCost). `valued_qty` is clamped to
>= 0 — the weighted average is undefined below zero.
"""

import logging
from decimal import Decimal

from ..constants import LOCATION_TYPE_LOSS, LOCATION_TYPE_VIRTUAL
from ..models import Movement, ProductCost

logger = logging.getLogger("inventory.costing")

ZERO = Decimal("0")


def _is_inbound(movement: Movement) -> bool:
    """A receipt: comes FROM a virtual source INTO real stock."""
    return (
        movement.from_location is not None
        and movement.from_location.type == LOCATION_TYPE_VIRTUAL
        and movement.to_location is not None
        and movement.to_location.type not in (LOCATION_TYPE_VIRTUAL, LOCATION_TYPE_LOSS)
    )


def _is_outbound(movement: Movement) -> bool:
    """A consumption/shipment/scrap: leaves real stock into a VIRTUAL/LOSS sink."""
    return (
        movement.to_location is not None
        and movement.to_location.type in (LOCATION_TYPE_VIRTUAL, LOCATION_TYPE_LOSS)
        and movement.from_location is not None
        and movement.from_location.type not in (LOCATION_TYPE_VIRTUAL,)
    )


class CostingService:
    @staticmethod
    def _lock_state(product_model) -> ProductCost:
        """Fetch-or-create the per-product cost row under a row lock."""
        state = ProductCost.objects.select_for_update().filter(product_model=product_model).first()
        if state is None:
            state, _ = ProductCost.objects.get_or_create(product_model=product_model)
            state = ProductCost.objects.select_for_update().get(pk=state.pk)
        return state

    @staticmethod
    def rebuild_for_product(product_model, *, dry_run: bool = False) -> bool:
        """Replay the immutable ledger for one product to reconstruct its
        ``ProductCost`` (avg_unit_cost / valued_qty) and re-stamp each outbound
        movement's frozen ``cogs_unit_cost``.

        Deterministic because the ledger is ordered. Single source of truth for
        the ``rebuild_costs`` command AND for realigning after ledger surgery
        such as a movement bulk-delete (COR-14). Returns True if stock went
        negative during the replay (valued_qty is clamped to 0).
        """
        avg = ZERO
        valued = ZERO
        negative_seen = False

        movements = (
            Movement.objects.filter(product_model=product_model)
            .select_related("from_location", "to_location")
            .order_by("occurred_at", "id")
        )
        for mv in movements:
            qty = Decimal(mv.quantity)
            if _is_inbound(mv):
                unit_cost = mv.purchased_cost
                if unit_cost is not None:
                    new_qty = valued + qty
                    if new_qty > 0:
                        avg = ((valued * avg) + (qty * Decimal(unit_cost))) / new_qty
                    valued = new_qty
                else:
                    valued = valued + qty
                if valued < 0:
                    valued = ZERO
            elif _is_outbound(mv):
                if not dry_run:
                    Movement.objects.filter(pk=mv.pk).update(cogs_unit_cost=avg)
                valued = valued - qty
                if valued < 0:
                    negative_seen = True
                    valued = ZERO
            # else: internal transfer, no cost effect.

        if not dry_run:
            ProductCost.objects.update_or_create(
                product_model=product_model,
                defaults={"avg_unit_cost": avg, "valued_qty": valued},
            )
        return negative_seen

    @staticmethod
    def on_inbound(movement: Movement, *, unit_cost: Decimal = None) -> None:
        """Re-weight the running average for a receipt.

        `unit_cost` defaults to the movement's `purchased_cost`, which is a
        *per-unit* cost (mirrored from the PO line, never a line total). When
        no cost is available the quantity enters at the current average so it
        does not dilute the value.
        """
        if movement.product_model is None or movement.quantity <= 0:
            return
        if unit_cost is None:
            unit_cost = movement.purchased_cost

        state = CostingService._lock_state(movement.product_model)
        qty = Decimal(movement.quantity)

        if unit_cost is not None:
            cost = Decimal(unit_cost)
            new_qty = state.valued_qty + qty
            if new_qty > 0:
                state.avg_unit_cost = (
                    (state.valued_qty * state.avg_unit_cost) + (qty * cost)
                ) / new_qty
            state.valued_qty = new_qty
        else:
            # No cost signal: qty enters at current average (no dilution).
            state.valued_qty = state.valued_qty + qty

        if state.valued_qty < 0:
            state.valued_qty = ZERO
        state.save(update_fields=["avg_unit_cost", "valued_qty", "updated_at"])

    @staticmethod
    def on_outbound(movement: Movement) -> None:
        """Freeze COGS on the movement and reduce valued quantity.

        The average is unchanged by an outbound (we ship at the current
        average). `cogs_unit_cost` is stamped via a targeted UPDATE that
        bypasses Movement.save() immutability.
        """
        if movement.product_model is None or movement.quantity <= 0:
            return
        state = CostingService._lock_state(movement.product_model)
        qty = Decimal(movement.quantity)

        cogs_unit = state.avg_unit_cost or ZERO
        Movement.objects.filter(pk=movement.pk).update(cogs_unit_cost=cogs_unit)
        # Keep the in-memory instance consistent for callers/tests.
        movement.cogs_unit_cost = cogs_unit

        state.valued_qty = state.valued_qty - qty
        if state.valued_qty < 0:
            logger.warning(
                "Negative valued_qty for product %s after outbound %s; clamping to 0",
                movement.product_model_id,
                movement.pk,
            )
            state.valued_qty = ZERO
        state.save(update_fields=["valued_qty", "updated_at"])

    @staticmethod
    def apply(movement: Movement) -> None:
        """Single entry point invoked from LedgerService after a movement is
        created. Routes to inbound/outbound; internal transfers are a no-op."""
        if _is_inbound(movement):
            CostingService.on_inbound(movement)
        elif _is_outbound(movement):
            CostingService.on_outbound(movement)
        # else: internal physical→physical transfer — no cost effect.
