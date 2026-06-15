"""GDPR data-portability export for a single tenant (PLATFORM-API-10).

A company owner (or a developer acting on a child via ``X-Acting-Company``)
can pull a complete, machine-readable dump of *their* tenant's data as a ZIP
of newline-delimited JSON — one file per model. The export is streamed, never
staged on disk, and rate-limited to one pull per hour to keep a heavy full-table
serialization from being abused.

Scope is the *effective company* (see :func:`core.scope.resolve_effective_company`),
so the same isolation rules that govern the dashboard govern the export: a
manager only ever sees its own data; a developer must name a child it owns.
Superusers may target any company. Every model is filtered to that one company
— directly where it carries a ``company`` FK, or through ``product_model``
where it does not (batches, physical products, movements, event logs).
"""
import io
import json
import zipfile
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, OpenApiResponse

from core.audit import record_audit
from core.models import AuditLog
from core.scope import resolve_effective_company


class ExportRateThrottle(UserRateThrottle):
    """Severe per-user limit: one full export per hour."""

    scope = 'company_export'
    rate = '1/hour'


# Field names never included in the export (signing keys / secrets).
_SENSITIVE_FIELDS = {'secret'}


def _json_default(value):
    """Make Django field values JSON-serializable.

    Covers the value types ``QuerySet.values()`` yields that ``json`` cannot
    encode natively: UUIDs, Decimals, and date/datetime objects.
    """
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, UUID):
        return str(value)
    return str(value)


# Each entry maps an export filename to a callable that, given the effective
# company, returns the queryset of rows belonging to it. Models carrying a
# direct ``company`` FK filter on it; the rest reach the company through their
# ``product_model``. Ordering is deterministic for reproducible exports.
def _build_exporters(company):
    from inventory.models.core import ProductModel, Location
    from inventory.models.ledger import Movement
    from inventory.models.tracking import ProductBatch, PhysicalProduct
    from inventory.models.suppliers import Supplier
    from inventory.models.customers import Customer
    from inventory.models.qr import DynamicQRCode
    from inventory.models.monitoring import EventLog
    from inventory.models.reservations import Reservation
    from inventory.models.purchasing import PurchaseOrder, PurchaseOrderLine
    from inventory.models.sales import SalesOrder, SalesOrderLine
    from inventory.models.transfers import TransferOrder, TransferOrderLine
    from inventory.models.rma import ReturnOrder, ReturnOrderLine
    from inventory.models.stocktake import CountSession, CountLine
    from inventory.models.costing import ProductCost
    from inventory.models.notifications import NotificationChannel, NotificationDelivery
    from inventory.models.monitoring import MonitoringRule
    from inventory.models.composition import WorkOrder

    cid = company.id
    return {
        'products': ProductModel.objects.filter(company_id=cid),
        'locations': Location.objects.filter(company_id=cid),
        'suppliers': Supplier.objects.filter(company_id=cid),
        'customers': Customer.objects.filter(company_id=cid),
        'movements': Movement.objects.filter(product_model__company_id=cid),
        'batches': ProductBatch.objects.filter(product_model__company_id=cid),
        'physical_products': PhysicalProduct.objects.filter(product_model__company_id=cid),
        'qr_codes': DynamicQRCode.objects.filter(company_id=cid),
        'event_logs': EventLog.objects.filter(product__company_id=cid),
        'monitoring_rules': MonitoringRule.objects.filter(product_model__company_id=cid),
        'reservations': Reservation.objects.filter(company_id=cid),
        'product_costs': ProductCost.objects.filter(product_model__company_id=cid),
        'purchase_orders': PurchaseOrder.objects.filter(company_id=cid),
        'purchase_order_lines': PurchaseOrderLine.objects.filter(purchase_order__company_id=cid),
        'sales_orders': SalesOrder.objects.filter(company_id=cid),
        'sales_order_lines': SalesOrderLine.objects.filter(sales_order__company_id=cid),
        'transfer_orders': TransferOrder.objects.filter(company_id=cid),
        'transfer_order_lines': TransferOrderLine.objects.filter(transfer_order__company_id=cid),
        'return_orders': ReturnOrder.objects.filter(company_id=cid),
        'return_order_lines': ReturnOrderLine.objects.filter(return_order__company_id=cid),
        'count_sessions': CountSession.objects.filter(company_id=cid),
        'count_lines': CountLine.objects.filter(session__company_id=cid),
        'notification_channels': NotificationChannel.objects.filter(company_id=cid),
        'notification_deliveries': NotificationDelivery.objects.filter(channel__company_id=cid),
        'work_orders': WorkOrder.objects.filter(company_id=cid),
    }


def _serialize_queryset(queryset):
    """Render a queryset as a JSON array string of plain field dicts.

    Uses ``.values()`` so every column is included without needing a bespoke
    serializer per model, and so FKs come out as their raw ids — enough to
    re-stitch the graph on import without dragging in related objects.

    Sensitive secrets (e.g. a webhook channel's HMAC signing key) are stripped
    so the dump can never leak signing material.
    """
    rows = list(queryset.values())
    for row in rows:
        for field in _SENSITIVE_FIELDS:
            row.pop(field, None)
    return json.dumps(rows, default=_json_default, indent=2)


def build_export_zip(company):
    """Build the export ZIP for ``company`` entirely in memory.

    Returns the raw ZIP bytes. Each model becomes ``<name>.json`` (a JSON array)
    plus a top-level ``manifest.json`` recording the company, the export time,
    and per-model row counts. No file ever touches disk.
    """
    exporters = _build_exporters(company)
    manifest = {
        'company': {'id': str(company.id), 'name': company.name},
        'exported_at': timezone.now().isoformat(),
        'format': 'json-per-model',
        'models': {},
    }

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, queryset in exporters.items():
            payload = _serialize_queryset(queryset)
            manifest['models'][name] = queryset.count()
            archive.writestr(f'{name}.json', payload)
        archive.writestr('manifest.json', json.dumps(manifest, indent=2))

    buffer.seek(0)
    return buffer.getvalue()


class _ExportErrorSerializer(serializers.Serializer):
    detail = serializers.CharField()


class CompanyDataExportView(APIView):
    """Stream a ZIP of the effective company's data as JSON-per-model.

    Authenticated; scoped to the effective company (own company, or a child a
    developer owns via ``X-Acting-Company``, or any company for a superuser).
    Rate-limited to one export per hour. Records a ``COMPANY_EXPORTED`` audit
    entry on success.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ExportRateThrottle]

    @extend_schema(
        summary="Export company data (GDPR)",
        description=(
            "Download a ZIP archive containing one JSON file per model for the "
            "effective company (products, movements, locations, batches, "
            "physical_products, suppliers, customers, qr_codes, event_logs, "
            "monitoring_rules, reservations, product_costs, purchase_orders(+lines), "
            "sales_orders(+lines), transfer_orders(+lines), return_orders(+lines), "
            "count_sessions(+lines), notification_channels/deliveries, work_orders) "
            "plus a manifest.json with row counts. Secrets are stripped. "
            "Scoped to the caller's company, or — for a developer — a child "
            "named via the X-Acting-Company header. Rate-limited to 1/hour."
        ),
        tags=["Platform"],
        responses={
            (200, 'application/zip'): OpenApiResponse(description="ZIP archive of the tenant's data."),
            403: _ExportErrorSerializer,
            429: _ExportErrorSerializer,
        },
    )
    def get(self, request):
        company = resolve_effective_company(request)
        if company is None:
            return Response(
                {"detail": "No company is associated with this account."},
                status=403,
            )

        archive_bytes = build_export_zip(company)

        record_audit(
            request.user,
            AuditLog.Action.COMPANY_EXPORTED,
            target_company=company,
            byte_size=len(archive_bytes),
        )

        filename = f"export-{company.id}-{timezone.now():%Y%m%d}.zip"
        response = StreamingHttpResponse(
            iter([archive_bytes]),
            content_type='application/zip',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['Content-Length'] = str(len(archive_bytes))
        return response
