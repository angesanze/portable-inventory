from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
import datetime

from core.models import User, Company
from inventory.models import (
    Location,
    ProductModel,
    WorkOrder,
    PhysicalProduct,
    ProductBatch,
    CalculatorTemplate,
    MonitoringRule,
    EventLog,
)


class Command(BaseCommand):
    help = 'Seeds comprehensive test data for E2E testing'

    def handle(self, *args, **options):
        from decimal import Decimal
        from inventory.services import LedgerService, StockService

        with transaction.atomic():
            # === 1. Core Setup ===
            company, _ = Company.objects.get_or_create(
                license_code="E2ETST",
                defaults={"name": "E2E Testing Corp"}
            )

            user = User.objects.filter(username="e2e_admin").first()
            if not user:
                user = User.objects.create_user(
                    username="e2e_admin",
                    email="admin@e2e.test",
                    password="password"
                )
                self.stdout.write(self.style.SUCCESS("Created user 'e2e_admin'"))
            else:
                user.set_password("password")
                user.save()
                self.stdout.write(self.style.SUCCESS("Reset password for 'e2e_admin'"))

            user.company = company
            user.role = "Admin"
            user.is_superuser = False # Ensure not superuser to test scoping
            user.is_staff = True      # Needed for admin site access if we test that
            user.save()

            # === 2. Locations ===
            loc_main, _ = Location.objects.get_or_create(
                company=company, name="E2E Main Warehouse",
                defaults={"type": "WAREHOUSE"}
            )
            loc_secondary, _ = Location.objects.get_or_create(
                company=company, name="E2E Secondary Storage",
                defaults={"type": "WAREHOUSE"}
            )
            loc_virtual, _ = Location.objects.get_or_create(
                company=company, name="E2E Virtual Trash",
                defaults={"type": "VIRTUAL"}
            )
            self.stdout.write(self.style.SUCCESS(f"Locations seeded: {loc_main}, {loc_secondary}, {loc_virtual}"))

            # === 3. Calculators ===
            calc_bucket, _ = CalculatorTemplate.objects.get_or_create(
                company=company, name="E2E Bucket Calculator",
                defaults={"engine_type": "bucket", "engine_config": {}}
            )
            calc_tracker, _ = CalculatorTemplate.objects.get_or_create(
                company=company, name="E2E Tracker Calculator",
                defaults={"engine_type": "tracker", "engine_config": {}}
            )
            calc_counter, _ = CalculatorTemplate.objects.get_or_create(
                company=company, name="E2E Counter Calculator",
                defaults={"engine_type": "counter", "engine_config": {}}
            )

            # === 4. Product Models ===
            # Batch Product (BULK + bucket)
            pm_batch, _ = ProductModel.objects.update_or_create(
                company=company, sku="E2E-BATCH-001",
                defaults={
                    "name": "E2E Batch Product",
                    "profile": "BATCH_TRACKED",
                    "default_calculator": calc_bucket,
                }
            )

            # Serialized Product (INDIVIDUAL + tracker)
            pm_serialized, _ = ProductModel.objects.update_or_create(
                company=company, sku="E2E-SERIAL-001",
                defaults={
                    "name": "E2E Serialized Asset",
                    "profile": "SERIALIZED",
                    "default_calculator": calc_tracker,
                }
            )

            # Standard Product (BULK + counter)
            pm_standard, _ = ProductModel.objects.update_or_create(
                company=company, sku="E2E-STD-001",
                defaults={
                    "name": "E2E Standard Product",
                    "profile": "SIMPLE_COUNT",
                    "default_calculator": calc_counter,
                }
            )
            self.stdout.write(self.style.SUCCESS(f"Product Models seeded: {pm_batch}, {pm_serialized}, {pm_standard}"))

            # === 5. Work Order (for batch workflow testing) ===
            wo, _ = WorkOrder.objects.get_or_create(
                company=company, name="E2E Test Batch WO-001",
                defaults={
                    "description": "Seeded work order for E2E testing",
                    "status": "OPEN",
                    "product_model": pm_batch,
                }
            )
            self.stdout.write(self.style.SUCCESS(f"Work Order seeded: {wo}"))

            # === 6. Physical Products (Serialized Assets) ===
            # Create 3 serialized units using LedgerService to ensure Movements are created
            from inventory.services import LedgerService
            
            for i in range(1, 4):
                identifier = f"E2E-SN-{i:04d}"
                # Check if item exists to prevent duplicates or errors
                if not PhysicalProduct.objects.filter(identifier=identifier, product_model=pm_serialized).exists():
                     # Create item first (as 'new' incoming)
                     item = PhysicalProduct.objects.create(
                         product_model=pm_serialized,
                         identifier=identifier,
                         status='ACTIVE',
                         # Location defaults into void until transfer
                     )
                     
                     LedgerService.transfer_stock(
                        product_model=pm_serialized,
                        from_location=loc_virtual,
                        to_location=loc_main,
                        quantity=Decimal("1"),
                        user=user,
                        reason="Initial E2E Seeding (Serialized)",
                        physical_product=item
                     )
            self.stdout.write(self.style.SUCCESS("Physical Products seeded: 3 serialized items via LedgerService"))
            self.stdout.write(self.style.SUCCESS("Physical Products seeded: 3 serialized items"))

            # === 7. Product Batches (for BULK product) ===
            # E2E-LOT-001 for E2E-BATCH-001
            # Check if batch exists to avoid duplicates if seed runs multiple times
            if not ProductBatch.objects.filter(batch_identifier="E2E-LOT-001", location=loc_main, product_model=pm_batch).exists():
                from decimal import Decimal
                from inventory.services import LedgerService
                
                LedgerService.transfer_stock(
                    product_model=pm_batch,
                    from_location=loc_virtual, # Supplier
                    to_location=loc_main,
                    quantity=Decimal("100"),
                    user=user,
                    reason="Initial E2E Seeding (Batch)",
                    batch_data={"expiry_date": "2027-12-31"},
                    batch_id="E2E-LOT-001",
                    work_order=wo
                )
                self.stdout.write(self.style.SUCCESS("Product Batch seeded via LedgerService: E2E-LOT-001 (qty: 100)"))
            else:
                 self.stdout.write(self.style.WARNING("Product Batch E2E-LOT-001 already exists"))

            # Seed standard product stock (BULK) to ensure movements exist for list view
            # We blindly add 50 if total is < 500 to avoid infinite growth on re-runs
            from inventory.services import StockService
            current_stock = StockService.get_stock_for_location(pm_standard, loc_main)
            if current_stock < 500:
                LedgerService.transfer_stock(
                    product_model=pm_standard,
                    from_location=loc_virtual,
                    to_location=loc_main,
                    quantity=Decimal("500"),
                    user=user,
                    reason="Initial E2E Seeding (Standard)"
                )
                self.stdout.write(self.style.SUCCESS("Standard Product stock seeded (500 units)"))

            # === 8. Monitoring & Event Logs ===
            rule_low_stock, _ = MonitoringRule.objects.get_or_create(
                product_model=pm_batch,
                name="E2E Low Stock Rule",
                defaults={
                    "trigger_type": "THRESHOLD",
                    "condition_config": {"min": 10},
                    "severity": "WARNING"
                }
            )
            
            # Create a sample event log
            EventLog.objects.get_or_create(
                rule=rule_low_stock,
                product=pm_batch,
                message="Stock quantity 5 is below minimum threshold of 10.",
                defaults={"status": "OPEN"}
            )
            self.stdout.write(self.style.SUCCESS("Monitoring Rule & Event Log seeded"))

            self.stdout.write(self.style.SUCCESS("\n✅ E2E Seed complete!"))
