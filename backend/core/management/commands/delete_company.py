"""Hard-delete a tenant and all its data (PLATFORM-API-10, Fase 5).

Tenant deletion was previously only possible through the Django admin. This
command makes it a deliberate, auditable operation: it first reports the row
counts that *would* be deleted, refuses to proceed without an explicit
``--confirm`` flag, and — once confirmed — deletes the company so Django's
``on_delete=CASCADE`` removes every dependent row in one transaction. A
``COMPANY_DELETED`` audit entry is written *before* the delete (the company
FK on the audit row is ``SET_NULL``, so the trail survives the cascade).

A developer company that still owns child tenants cannot be deleted: that would
silently orphan or cascade-delete the children. Delete the children first.

See ``docs/operations/data-retention.md`` for what is removed and what remains.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.audit import record_audit
from core.models import AuditLog, Company


# (label, accessor) pairs counted for the pre-delete report. Each accessor takes
# the company and returns a count of rows that the cascade will remove.
def _collect_counts(company):
    from inventory.models.core import ProductModel, Location
    from inventory.models.ledger import Movement
    from inventory.models.tracking import ProductBatch, PhysicalProduct
    from inventory.models.suppliers import Supplier
    from inventory.models.customers import Customer
    from inventory.models.qr import DynamicQRCode
    from inventory.models.reservations import Reservation
    from inventory.models.purchasing import PurchaseOrder
    from inventory.models.sales import SalesOrder
    from inventory.models.transfers import TransferOrder
    from inventory.models.rma import ReturnOrder
    from inventory.models.composition import WorkOrder

    cid = company.id
    return {
        'users': company.users.count(),
        'api_keys': company.api_keys.count(),
        'products': ProductModel.objects.filter(company_id=cid).count(),
        'locations': Location.objects.filter(company_id=cid).count(),
        'suppliers': Supplier.objects.filter(company_id=cid).count(),
        'customers': Customer.objects.filter(company_id=cid).count(),
        'movements': Movement.objects.filter(product_model__company_id=cid).count(),
        'batches': ProductBatch.objects.filter(product_model__company_id=cid).count(),
        'physical_products': PhysicalProduct.objects.filter(product_model__company_id=cid).count(),
        'qr_codes': DynamicQRCode.objects.filter(company_id=cid).count(),
        'reservations': Reservation.objects.filter(company_id=cid).count(),
        'purchase_orders': PurchaseOrder.objects.filter(company_id=cid).count(),
        'sales_orders': SalesOrder.objects.filter(company_id=cid).count(),
        'transfer_orders': TransferOrder.objects.filter(company_id=cid).count(),
        'return_orders': ReturnOrder.objects.filter(company_id=cid).count(),
        'work_orders': WorkOrder.objects.filter(company_id=cid).count(),
    }


class Command(BaseCommand):
    help = "Hard-delete a company and all its data (cascade). Requires --confirm to proceed."

    def add_arguments(self, parser):
        parser.add_argument('company_id', type=str, help="UUID of the company to delete.")
        parser.add_argument(
            '--confirm',
            action='store_true',
            help="Actually perform the deletion. Without it, only the report is printed.",
        )

    def handle(self, *args, **options):
        company_id = options['company_id']
        confirm = options['confirm']

        try:
            company = Company.objects.get(pk=company_id)
        except (Company.DoesNotExist, ValueError):
            raise CommandError(f"No company with id {company_id!r}.")

        children = list(company.children.all())
        counts = _collect_counts(company)

        self.stdout.write(self.style.WARNING(
            f"Company: {company.name} ({company.id}) — tier={company.account_type}"
        ))
        self.stdout.write("Rows that will be deleted (cascade):")
        for label, count in counts.items():
            self.stdout.write(f"  {label:20s} {count}")
        if children:
            self.stdout.write(self.style.ERROR(
                f"\nThis company owns {len(children)} child tenant(s): "
                + ", ".join(c.name for c in children)
            ))

        if not confirm:
            self.stdout.write(self.style.NOTICE(
                "\nDry run. Re-run with --confirm to delete. Nothing was changed."
            ))
            return

        if children:
            raise CommandError(
                "Refusing to delete: company owns child tenants. Delete the "
                "children first to avoid orphaning or cascade-deleting them."
            )

        # Write the audit row before the cascade. The audit FK to the company is
        # SET_NULL, so the entry survives the delete with company_id nulled out.
        name = company.name
        with transaction.atomic():
            record_audit(
                None,
                AuditLog.Action.COMPANY_DELETED,
                target_company=company,
                name=name,
                counts=counts,
            )
            company.delete()

        self.stdout.write(self.style.SUCCESS(
            f"Deleted company {name} ({company_id}) and all its data."
        ))
