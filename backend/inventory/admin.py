from django.contrib import admin, messages
from django.utils import timezone
from import_export import resources
from import_export.admin import ImportExportModelAdmin
from rangefilter.filters import DateRangeFilterBuilder
from core.admin_site import varasto_admin_site
from .models import (
    ProductModel, Location, PhysicalProduct, Movement, ProductBatch,
    ProductComponent, Supplier, WorkOrder, DynamicQRCode,
    CalculatorTemplate, MonitoringRule, EventLog,
    Customer, Reservation, ProductCost,
    PurchaseOrder, PurchaseOrderLine, SalesOrder, SalesOrderLine,
    TransferOrder, TransferOrderLine, ReturnOrder, ReturnOrderLine,
    CountSession, CountLine, NotificationChannel, NotificationDelivery,
)

@admin.register(Movement, site=varasto_admin_site)
class MovementAdmin(ImportExportModelAdmin):
    """Immutable ledger view.

    Movements are append-only and created via the API, never the admin. The
    admin is therefore strictly read-only (no add/change/delete) and offers
    export-only import-export — blocking import preserves ledger integrity.
    """
    list_display = ('occurred_at', 'product_model', 'from_location', 'to_location', 'quantity', 'supplier', 'performed_by')
    list_filter = (
        ('occurred_at', DateRangeFilterBuilder()),
        'from_location',
        'to_location',
        'supplier',
    )
    search_fields = ('product_model__sku', 'product_model__name', 'reason', 'performed_by__username')
    date_hierarchy = 'occurred_at'
    list_select_related = ('product_model', 'from_location', 'to_location', 'supplier', 'performed_by')
    autocomplete_fields = ('product_model', 'from_location', 'to_location', 'supplier', 'performed_by', 'work_order')
    ordering = ('-occurred_at',)
    list_per_page = 50

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_import_permission(self, request):
        # Export-only: importing rows would corrupt the append-only ledger.
        return False

class ProductBatchInline(admin.TabularInline):
    """A product's batches, inline on the ProductModel page."""
    model = ProductBatch
    extra = 0
    fields = ('batch_identifier', 'location', 'quantity', 'work_order', 'created_at')
    readonly_fields = ('created_at',)
    raw_id_fields = ('location', 'work_order')
    show_change_link = True


class ProductComponentInline(admin.TabularInline):
    """A product's bill of materials (the children it is composed of)."""
    model = ProductComponent
    fk_name = 'parent'
    extra = 0
    fields = ('child', 'quantity', 'created_at')
    readonly_fields = ('created_at',)
    autocomplete_fields = ('child',)
    show_change_link = True


@admin.register(ProductModel, site=varasto_admin_site)
class ProductModelAdmin(admin.ModelAdmin):
    list_display = [
        'sku', 'name', 'profile', 'get_tracking_mode', 'get_engine_type',
        'company', 'reorder_threshold', 'critical_threshold', 'max_threshold', 'created_at',
    ]
    fields = (
        'company', 'sku', 'name', 'profile', 'default_calculator',
        'initial_balance', 'attributes', 'engine_config',
        'reorder_threshold', 'critical_threshold', 'max_threshold', 'reorder_qty',
    )
    # search_fields is REQUIRED: Movement/QR autocomplete to product_model relies on it.
    search_fields = ('sku', 'name', 'company__name')
    list_filter = ('profile', 'company')
    autocomplete_fields = ('company',)
    list_select_related = ('company',)
    date_hierarchy = 'created_at'
    ordering = ('sku',)
    inlines = [ProductBatchInline, ProductComponentInline]

    def get_tracking_mode(self, obj):
        return obj.tracking_mode
    get_tracking_mode.short_description = 'Tracking Mode'

    def get_engine_type(self, obj):
        return obj.engine_type
    get_engine_type.short_description = 'Engine Type'


@admin.register(ProductComponent, site=varasto_admin_site)
class ProductComponentAdmin(admin.ModelAdmin):
    list_display = ('parent', 'child', 'quantity', 'created_at')
    search_fields = (
        'parent__sku', 'parent__name',
        'child__sku', 'child__name',
    )
    list_select_related = ('parent', 'child')
    autocomplete_fields = ('parent', 'child')
    ordering = ('parent__sku',)


@admin.register(Location, site=varasto_admin_site)
class LocationAdmin(admin.ModelAdmin):
    list_display = ('name', 'type', 'company', 'parent')
    list_filter = ('type', 'company')
    # search_fields required: Location is an autocomplete target (Movement, PhysicalProduct, ...).
    search_fields = ('name', 'company__name')
    autocomplete_fields = ('parent', 'company')
    list_select_related = ('company', 'parent')
    ordering = ('company', 'name')


@admin.register(PhysicalProduct, site=varasto_admin_site)
class PhysicalProductAdmin(admin.ModelAdmin):
    """Per-item view — central to recall and status management."""
    list_display = ('identifier', 'product_model', 'status', 'location', 'batch_date')
    list_filter = ('status', 'product_model', 'location')
    search_fields = ('identifier', 'product_model__sku', 'product_model__name')
    autocomplete_fields = ('product_model', 'location', 'work_order')
    list_select_related = ('product_model', 'location')
    ordering = ('-batch_date',)
    actions = ('mark_recall', 'mark_disposed', 'mark_active')

    @admin.action(description="Mark selected items as RECALL")
    def mark_recall(self, request, queryset):
        updated = queryset.update(status='RECALL')
        self.message_user(request, f"{updated} item(s) marked as RECALL.")

    @admin.action(description="Mark selected items as DISPOSED")
    def mark_disposed(self, request, queryset):
        updated = queryset.update(status='DISPOSED')
        self.message_user(request, f"{updated} item(s) marked as DISPOSED.")

    @admin.action(description="Mark selected items as ACTIVE")
    def mark_active(self, request, queryset):
        updated = queryset.update(status='ACTIVE')
        self.message_user(request, f"{updated} item(s) marked as ACTIVE.")


class SupplierResource(resources.ModelResource):
    """CSV/XLSX round-trip for Supplier — bulk supplier upload is a common
    superadmin need (importing a fornitore registry for a new company)."""

    class Meta:
        model = Supplier
        fields = ('id', 'company', 'name', 'vat_number', 'email', 'phone', 'is_active', 'created_at')
        export_order = fields
        import_id_fields = ('id',)


@admin.register(Supplier, site=varasto_admin_site)
class SupplierAdmin(ImportExportModelAdmin):
    """Fornitore registry — supports bulk CSV/XLSX upload via import-export."""
    resource_classes = [SupplierResource]
    list_display = ('name', 'vat_number', 'company', 'is_active', 'email', 'created_at')
    list_filter = ('is_active', 'company')
    search_fields = ('name', 'vat_number', 'email', 'company__name')
    autocomplete_fields = ('company',)
    list_select_related = ('company',)
    ordering = ('name',)
    actions = ('activate', 'deactivate')

    @admin.action(description="Activate selected suppliers")
    def activate(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f"{updated} supplier(s) activated.")

    @admin.action(description="Deactivate selected suppliers")
    def deactivate(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f"{updated} supplier(s) deactivated.")


@admin.register(WorkOrder, site=varasto_admin_site)
class WorkOrderAdmin(admin.ModelAdmin):
    """Work order / Kit definition — bulk close/archive lifecycle actions."""
    list_display = ('name', 'status', 'company', 'product_model', 'created_at')
    list_filter = ('status', 'company')
    search_fields = ('name', 'company__name')
    autocomplete_fields = ('company', 'product_model')
    list_select_related = ('company', 'product_model')
    ordering = ('-created_at',)
    actions = ('close', 'archive')

    @admin.action(description="Close selected work orders")
    def close(self, request, queryset):
        updated = queryset.update(status='CLOSED')
        self.message_user(request, f"{updated} work order(s) closed.")

    @admin.action(description="Archive selected work orders")
    def archive(self, request, queryset):
        updated = queryset.update(status='ARCHIVED')
        self.message_user(request, f"{updated} work order(s) archived.")


@admin.register(DynamicQRCode, site=varasto_admin_site)
class DynamicQRCodeAdmin(admin.ModelAdmin):
    """Dynamic QR codes — lock/unlock respects the VIRGIN→CONFIGURED→LOCKED
    state machine (a VIRGIN code has no target, so it cannot be locked)."""
    list_display = ('code', 'status', 'company', 'target_summary', 'label', 'created_at')
    list_filter = ('status', 'company', 'api_key')
    search_fields = ('code', 'label', 'company__name')
    autocomplete_fields = ('company', 'product_model', 'physical_product', 'batch', 'work_order', 'api_key')
    list_select_related = ('company', 'product_model', 'physical_product', 'batch', 'work_order', 'api_key')
    ordering = ('-created_at',)
    actions = ('lock', 'unlock')

    @admin.display(description="Target")
    def target_summary(self, obj):
        return obj.get_target_display()

    @admin.action(description="Lock selected QR codes")
    def lock(self, request, queryset):
        # Only CONFIGURED codes can be locked; VIRGIN codes have no target.
        skipped = queryset.filter(status='VIRGIN').count()
        updated = queryset.filter(status='CONFIGURED').update(status='LOCKED')
        self.message_user(request, f"{updated} QR code(s) locked.")
        if skipped:
            self.message_user(
                request,
                f"{skipped} VIRGIN code(s) skipped — configure a target before locking.",
                level=messages.WARNING,
            )

    @admin.action(description="Unlock selected QR codes")
    def unlock(self, request, queryset):
        # Reverse of lock: LOCKED → CONFIGURED. VIRGIN codes are left untouched.
        updated = queryset.filter(status='LOCKED').update(status='CONFIGURED')
        self.message_user(request, f"{updated} QR code(s) unlocked.")


@admin.register(ProductBatch, site=varasto_admin_site)
class ProductBatchAdmin(admin.ModelAdmin):
    list_display = ('batch_identifier', 'product_model', 'location', 'quantity', 'work_order', 'created_at')
    list_filter = ('product_model', 'location')
    search_fields = ('batch_identifier', 'product_model__sku')
    autocomplete_fields = ('product_model', 'location', 'work_order')
    list_select_related = ('product_model', 'location', 'work_order')
    date_hierarchy = 'created_at'
    ordering = ('-created_at',)


@admin.register(CalculatorTemplate, site=varasto_admin_site)
class CalculatorTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'engine_type', 'company', 'created_at')
    list_filter = ('engine_type', 'company')
    search_fields = ('name', 'company__name')
    autocomplete_fields = ('company',)
    list_select_related = ('company',)
    ordering = ('name',)


@admin.register(MonitoringRule, site=varasto_admin_site)
class MonitoringRuleAdmin(admin.ModelAdmin):
    list_display = ('name', 'product_model', 'trigger_type', 'severity', 'created_at')
    list_filter = ('trigger_type', 'severity')
    search_fields = ('name', 'product_model__sku')
    autocomplete_fields = ('product_model',)
    list_select_related = ('product_model',)
    ordering = ('-created_at',)


@admin.register(EventLog, site=varasto_admin_site)
class EventLogAdmin(admin.ModelAdmin):
    """Criticality monitoring — resolve/ignore generated events in bulk."""
    list_display = ('created_at', 'status', 'rule', 'product', 'message', 'resolved_at')
    list_filter = (
        'status',
        'rule',
        ('created_at', DateRangeFilterBuilder()),
    )
    search_fields = ('message', 'product__sku')
    date_hierarchy = 'created_at'
    list_select_related = ('rule', 'product', 'batch')
    ordering = ('-created_at',)
    actions = ('resolve_events', 'ignore_events')

    @admin.action(description="Resolve selected events")
    def resolve_events(self, request, queryset):
        updated = queryset.update(status='RESOLVED', resolved_at=timezone.now())
        self.message_user(request, f"{updated} event(s) resolved.")

    @admin.action(description="Ignore selected events")
    def ignore_events(self, request, queryset):
        updated = queryset.update(status='IGNORED')
        self.message_user(request, f"{updated} event(s) ignored.")


# ── New domain models (purchasing / sales / transfers / RMA / stocktake /
# costing / reservations / customers / notifications). Registered on the
# superadmin cockpit so platform staff can inspect every tenant's records. ──

@admin.register(Customer, site=varasto_admin_site)
class CustomerAdmin(admin.ModelAdmin):
    """Cliente registry — mirror of Supplier."""
    list_display = ('name', 'vat_number', 'company', 'is_active', 'email', 'created_at')
    list_filter = ('is_active', 'company')
    # search_fields required: Customer is an autocomplete target (SalesOrder, RMA).
    search_fields = ('name', 'vat_number', 'email', 'company__name')
    autocomplete_fields = ('company',)
    list_select_related = ('company',)
    ordering = ('name',)


@admin.register(Reservation, site=varasto_admin_site)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ('product_model', 'quantity', 'status', 'location', 'company', 'expires_at', 'created_at')
    list_filter = ('status', 'company')
    search_fields = ('product_model__sku', 'product_model__name', 'reference')
    autocomplete_fields = ('company', 'product_model', 'location')
    list_select_related = ('company', 'product_model', 'location')
    ordering = ('-created_at',)


@admin.register(ProductCost, site=varasto_admin_site)
class ProductCostAdmin(admin.ModelAdmin):
    """Weighted-average cost state — derived; read-only in the admin."""
    list_display = ('product_model', 'avg_unit_cost', 'valued_qty', 'updated_at')
    search_fields = ('product_model__sku', 'product_model__name')
    autocomplete_fields = ('product_model',)
    list_select_related = ('product_model',)
    ordering = ('-updated_at',)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


class PurchaseOrderLineInline(admin.TabularInline):
    model = PurchaseOrderLine
    extra = 0
    autocomplete_fields = ('product_model',)
    raw_id_fields = ()


@admin.register(PurchaseOrder, site=varasto_admin_site)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ('number', 'status', 'supplier', 'company', 'expected_at', 'created_at')
    list_filter = ('status', 'company')
    search_fields = ('number', 'supplier__name', 'company__name')
    autocomplete_fields = ('company', 'supplier')
    list_select_related = ('company', 'supplier')
    ordering = ('-created_at',)
    inlines = [PurchaseOrderLineInline]


class SalesOrderLineInline(admin.TabularInline):
    model = SalesOrderLine
    extra = 0
    autocomplete_fields = ('product_model',)


@admin.register(SalesOrder, site=varasto_admin_site)
class SalesOrderAdmin(admin.ModelAdmin):
    list_display = ('number', 'status', 'customer', 'company', 'promised_at', 'created_at')
    list_filter = ('status', 'company')
    search_fields = ('number', 'customer__name', 'company__name')
    autocomplete_fields = ('company', 'customer')
    list_select_related = ('company', 'customer')
    ordering = ('-created_at',)
    inlines = [SalesOrderLineInline]


class TransferOrderLineInline(admin.TabularInline):
    model = TransferOrderLine
    extra = 0
    autocomplete_fields = ('product_model',)


@admin.register(TransferOrder, site=varasto_admin_site)
class TransferOrderAdmin(admin.ModelAdmin):
    list_display = ('number', 'status', 'from_location', 'to_location', 'company', 'created_at')
    list_filter = ('status', 'company')
    search_fields = ('number', 'company__name')
    autocomplete_fields = ('company', 'from_location', 'to_location')
    list_select_related = ('company', 'from_location', 'to_location')
    ordering = ('-created_at',)
    inlines = [TransferOrderLineInline]


class ReturnOrderLineInline(admin.TabularInline):
    model = ReturnOrderLine
    extra = 0
    autocomplete_fields = ('product_model',)


@admin.register(ReturnOrder, site=varasto_admin_site)
class ReturnOrderAdmin(admin.ModelAdmin):
    list_display = ('number', 'kind', 'status', 'reason_code', 'company', 'created_at')
    list_filter = ('kind', 'status', 'company')
    search_fields = ('number', 'company__name')
    autocomplete_fields = ('company', 'customer', 'supplier')
    list_select_related = ('company',)
    ordering = ('-created_at',)
    inlines = [ReturnOrderLineInline]


class CountLineInline(admin.TabularInline):
    model = CountLine
    extra = 0
    autocomplete_fields = ('product_model',)


@admin.register(CountSession, site=varasto_admin_site)
class CountSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'status', 'location', 'company', 'snapshot_at', 'applied_at', 'created_at')
    list_filter = ('status', 'company')
    search_fields = ('company__name', 'location__name')
    autocomplete_fields = ('company', 'location')
    list_select_related = ('company', 'location')
    ordering = ('-created_at',)
    inlines = [CountLineInline]


@admin.register(NotificationChannel, site=varasto_admin_site)
class NotificationChannelAdmin(admin.ModelAdmin):
    list_display = ('name', 'kind', 'is_active', 'company', 'created_at')
    list_filter = ('kind', 'is_active', 'company')
    search_fields = ('name', 'url', 'recipients', 'company__name')
    autocomplete_fields = ('company',)
    list_select_related = ('company',)
    ordering = ('-created_at',)
    # secret is editable=False on the model; never surface it.
    exclude = ('secret',)


@admin.register(NotificationDelivery, site=varasto_admin_site)
class NotificationDeliveryAdmin(admin.ModelAdmin):
    """Delivery attempt log — read-only audit of channel sends."""
    list_display = ('channel', 'status', 'attempts', 'next_retry_at', 'created_at')
    list_filter = ('status',)
    search_fields = ('channel__name', 'last_error')
    list_select_related = ('channel', 'event_log')
    ordering = ('-created_at',)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
