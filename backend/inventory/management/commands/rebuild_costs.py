"""Rebuild weighted-average cost state by replaying the immutable ledger.

`ProductCost` is an incremental cache. This command discards it and replays
every `Movement` for a company (or all companies) in `occurred_at` order,
reconstructing `avg_unit_cost` / `valued_qty` and re-stamping each outbound
movement's frozen `cogs_unit_cost`. Use it to adopt costing on existing data
or to realign after manual ledger surgery.

Because the ledger is immutable and ordered, the replay is deterministic: it
must land on exactly the same numbers the incremental path produces.

Usage:
    python manage.py rebuild_costs                # all companies
    python manage.py rebuild_costs --company <id>  # one company
    python manage.py rebuild_costs --dry-run       # report, write nothing
"""
import logging
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from inventory.models import Movement, ProductCost, ProductModel
from inventory.services.costing import _is_inbound, _is_outbound

logger = logging.getLogger('inventory.costing')
ZERO = Decimal('0')


class Command(BaseCommand):
    help = "Replay the ledger to rebuild weighted-average cost state (ProductCost)."

    def add_arguments(self, parser):
        parser.add_argument('--company', type=str, default=None,
                            help='Limit to a single company id.')
        parser.add_argument('--dry-run', action='store_true',
                            help='Compute but do not persist.')

    def handle(self, *args, **options):
        company_id = options.get('company')
        dry_run = options.get('dry_run')

        products = ProductModel.objects.all()
        if company_id:
            products = products.filter(company_id=company_id)

        rebuilt = 0
        warnings = 0
        with transaction.atomic():
            for product in products.iterator():
                avg = ZERO
                valued = ZERO
                negative_seen = False

                movements = (
                    Movement.objects.filter(product_model=product)
                    .select_related('from_location', 'to_location')
                    .order_by('occurred_at', 'id')
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
                        # Re-stamp the frozen COGS for this historical outbound.
                        if not dry_run:
                            Movement.objects.filter(pk=mv.pk).update(cogs_unit_cost=avg)
                        valued = valued - qty
                        if valued < 0:
                            negative_seen = True
                            valued = ZERO
                    # else: internal transfer, no cost effect.

                if negative_seen:
                    warnings += 1
                    logger.warning(
                        "Stock went negative during replay for product %s (%s); valued_qty clamped to 0",
                        product.pk, product.sku,
                    )
                    self.stdout.write(self.style.WARNING(
                        f"  warning: negative stock during replay for {product.sku}"
                    ))

                if not dry_run:
                    ProductCost.objects.update_or_create(
                        product_model=product,
                        defaults={'avg_unit_cost': avg, 'valued_qty': valued},
                    )
                rebuilt += 1

            if dry_run:
                transaction.set_rollback(True)

        msg = f"Rebuilt cost state for {rebuilt} product(s)"
        if warnings:
            msg += f" ({warnings} with negative-stock warnings)"
        if dry_run:
            msg += " [dry-run, nothing written]"
        self.stdout.write(self.style.SUCCESS(msg))
