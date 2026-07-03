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

from django.core.management.base import BaseCommand
from django.db import transaction

from inventory.models import ProductModel
from inventory.services.costing import CostingService

logger = logging.getLogger("inventory.costing")


class Command(BaseCommand):
    help = "Replay the ledger to rebuild weighted-average cost state (ProductCost)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--company", type=str, default=None, help="Limit to a single company id."
        )
        parser.add_argument("--dry-run", action="store_true", help="Compute but do not persist.")

    def handle(self, *args, **options):
        company_id = options.get("company")
        dry_run = options.get("dry_run")

        products = ProductModel.objects.all()
        if company_id:
            products = products.filter(company_id=company_id)

        rebuilt = 0
        warnings = 0
        with transaction.atomic():
            for product in products.iterator():
                # Single source of truth for the replay (shared with the movement
                # bulk-delete recompute, COR-14).
                negative_seen = CostingService.rebuild_for_product(product, dry_run=dry_run)

                if negative_seen:
                    warnings += 1
                    logger.warning(
                        "Stock went negative during replay for product %s (%s); valued_qty clamped to 0",
                        product.pk,
                        product.sku,
                    )
                    self.stdout.write(
                        self.style.WARNING(
                            f"  warning: negative stock during replay for {product.sku}"
                        )
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
