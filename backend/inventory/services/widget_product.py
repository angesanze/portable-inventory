import logging

from decimal import Decimal
from ..models import Location, ProductModel, PhysicalProduct, ProductBatch, WorkOrder
from ..engines import EngineFactory
from .stock import StockService

logger = logging.getLogger('inventory.widget')


# ---------------------------------------------------------------------------
# Canonical widget product payload contract
# ---------------------------------------------------------------------------
# Both `get_widget_products` (list) and `get_widget_product_details` (detail)
# must satisfy this shape so the frontend dispatcher receives the same fields
# regardless of which endpoint loaded the product. The 2026-05-26 incident
# showed the list endpoint had drifted (missing `profile`, `status_transitions`)
# and frontend tolerated it by coincidence.
#
# Required keys (BOTH list-item dict and detail dict):
#   - id                 : str (UUID of ProductModel)
#   - sku                : str
#   - name               : str        (detail exposes as `product_name` too)
#   - profile            : str        (ProductModel.profile enum)
#   - engine_type        : str        (effective engine after preset/kit override)
#   - tracking_mode      : str        (BULK / SERIAL)
#   - quantity           : Decimal|float
#   - stock_display      : str        (engine-rendered)
#   - unit               : str|None   (engine.get_display_unit())
#   - calc_config        : dict
#       - engine             : str            (raw p.engine_type)
#       - ui_config          : dict           (engine.get_ui_config())
#       - status_transitions : dict|None      (two-tier lookup:
#           p.engine_config['status_transitions'] OR
#           p.default_calculator.engine_config['status_transitions'])
#   - components         : list[dict]         (child_id, sku, child_name,
#                                              child_tracking_mode, quantity)
#
# Detail-only additions:
#   - current_stock_display : str
#   - stock_value           : list|number    (per-engine: bucket=batches,
#                                             tracker=units, time_based=batches,
#                                             else=total)
#   - grouped_items         : dict           (batch_manager kits only; else {})
#   - is_template           : bool
#
# Invariant: `calc_config.status_transitions` is None/absent for products
# with no preset assigned. The ui_config can carry an engine-default but
# the top-level `status_transitions` field must NOT leak the ui_config one.
# ---------------------------------------------------------------------------


class WidgetProductService:
    """Handles what data the widget sees — product listing and detail views."""

    @staticmethod
    def _build_product_payload(p, engine, stock_info, *, include_detail_extras=False):
        """Render canonical widget product payload — see contract docblock at top.

        Single source of truth for `get_widget_products` (list) and the
        ProductModel branch of `get_widget_product_details`. `include_detail_extras`
        layers in the detail-only aliases (`product_name`, `engine`, `ui_config`,
        `current_stock_display`, `is_template`). `stock_value` and `grouped_items`
        remain caller-computed because they need per-engine queries the helper
        doesn't have access to.
        """
        total_val = stock_info['total']

        # Effective engine after preset/kit override.
        # Preset always wins; otherwise a kit falls back to batch_manager.
        effective_engine_type = p.engine_type
        if p.default_calculator:
            effective_engine_type = p.default_calculator.engine_type
        elif p.components.exists():
            effective_engine_type = 'batch_manager'

        ui_config = engine.get_ui_config()
        # Two-tier status_transitions lookup: product override, then preset.
        status_transitions = (p.engine_config or {}).get('status_transitions')
        if not status_transitions and p.default_calculator and p.default_calculator.engine_config:
            status_transitions = p.default_calculator.engine_config.get('status_transitions')

        stock_display = engine.format_stock_display(
            StockService.get_tracker_status_counts(p) if not engine.returns_numeric_delta and p.engine_type == 'tracker'
            else StockService.get_expiry_display_data(p, p.engine_config) if not engine.returns_numeric_delta and p.engine_type == 'time_based'
            else total_val
        )

        payload = {
            "id": str(p.id),
            "sku": p.sku,
            "name": p.name,
            "profile": p.profile,
            "engine_type": effective_engine_type,
            "tracking_mode": p.tracking_mode,
            "stock_display": stock_display,
            "unit": engine.get_display_unit(),
            "quantity": total_val,
            "strategy": None,
            "calc_config": {
                "engine": p.engine_type,
                "ui_config": ui_config,
                "status_transitions": status_transitions,
            },
            "components": [{
                "child_id": str(c.child.id),
                "sku": c.child.sku,
                "child_name": c.child.name,
                "child_tracking_mode": c.child.tracking_mode,
                "quantity": float(c.quantity)
            } for c in p.components.all()],
        }

        if include_detail_extras:
            payload["product_name"] = p.name
            payload["engine"] = effective_engine_type
            payload["current_stock_display"] = stock_display
            payload["ui_config"] = ui_config
            payload["is_template"] = True

        return payload

    @staticmethod
    def get_widget_products(company, location_id=None):
        """
        Retrieves all products and work orders formatted for the Widget UI.
        """
        products = ProductModel.objects.filter(
            company=company
        ).select_related('default_calculator')

        data = []
        for p in products:
            try:
                engine = EngineFactory.get_engine_for_profile(p)

                if location_id:
                    try:
                        loc = Location.objects.get(id=location_id, company=company)
                        stock_info = {'total': StockService.get_stock_for_location(p, loc)}
                    except Location.DoesNotExist:
                        stock_info = {'total': 0}
                else:
                    stock_info = StockService.get_stock_for_model(p)

                # Filter out zero-stock items if filtering by location.
                # Skip the gate for tracker products: `get_stock_for_model`
                # counts only `status='ACTIVE'` PhysicalProducts, so a
                # status-machine item that has been moved to BROKEN /
                # REPAIRED / etc. would otherwise vanish from the widget
                # the moment its status changes — exactly the state the
                # user needs to act on next.
                if location_id and stock_info['total'] == 0 and p.engine_type != 'tracker':
                    continue

                data.append(WidgetProductService._build_product_payload(p, engine, stock_info))

            except Exception as e:
                logger.warning("Skipping product %s: %s", p.id, e)
                continue

        # Include WorkOrders as "products" with batch_manager engine
        work_orders = WorkOrder.objects.filter(
            company=company,
            status='OPEN'
        ).select_related('product_model')

        if location_id:
            filtered_wos = []
            for wo in work_orders:
                has_items_here = (
                    wo.batches.filter(location_id=location_id, quantity__gt=0).exists() or
                    wo.physical_products.filter(location_id=location_id, status='ACTIVE').exists()
                )
                has_items_anywhere = (
                    wo.batches.filter(quantity__gt=0).exists() or
                    wo.physical_products.filter(status='ACTIVE').exists()
                )

                # ALLOW ALL OPEN EMPTY WORK ORDERS - Do not filter by location if completely empty.
                # Users need to see empty WorkOrders to start working on them anywhere.
                if has_items_here or not has_items_anywhere:
                    filtered_wos.append(wo)
            work_orders = filtered_wos

        for wo in work_orders:
            data.append({
                "id": str(wo.id),
                "sku": f"WO-{wo.name}",
                "name": f"Batch: {wo.name}",
                "engine_type": "batch_manager",
                "tracking_mode": "BULK",  # Placeholder
                "stock_display": "Work Order",
                "unit": None,
                "quantity": 0,
                "strategy": None,
                "calc_config": {
                    "engine": "batch_manager",
                    "ui_config": {}
                },
                "components": []
            })

        return data

    @staticmethod
    def get_widget_product_details(company, pk, location_id=None):
        """
        Get details for a specific item (ProductModel or WorkOrder).
        Used by the widget to initialize the view.
        """
        # 1. Try WorkOrder (Batch Manager)
        work_order = WorkOrder.objects.filter(id=pk, company=company).first()
        if work_order:
            # Group Items logic from api_views.py
            grouped_items = {}

            # A. Initialize from Recipe (Expected Items)
            if work_order.product_model:
                for comp in work_order.product_model.components.all().select_related('child'):
                    child_id = str(comp.child.id)
                    grouped_items[child_id] = {
                        "model": {
                            "id": child_id,
                            "name": comp.child.name,
                            "sku": comp.child.sku,
                            "tracking_mode": comp.child.tracking_mode
                        },
                        "total_quantity": Decimal('0.0'),
                        "items": []
                    }

            # B. Batches (Bulk) - Populate Existing
            batch_qs = ProductBatch.objects.filter(work_order=work_order).select_related('product_model')

            for b in batch_qs:
                pm_id = str(b.product_model.id)
                if pm_id not in grouped_items:
                    grouped_items[pm_id] = {
                        "model": {
                            "id": pm_id,
                            "name": b.product_model.name,
                            "sku": b.product_model.sku,
                            "tracking_mode": b.product_model.tracking_mode
                        },
                        "total_quantity": Decimal('0.0'),
                        "items": []
                    }
                grouped_items[pm_id]["items"].append({
                    "id": str(b.id),
                    "quantity": b.quantity,
                    "batch_identifier": b.batch_identifier
                })
                grouped_items[pm_id]["total_quantity"] += b.quantity

            # C. Physical Products (Serial)
            item_qs = PhysicalProduct.objects.filter(work_order=work_order, status='ACTIVE').select_related('product_model')

            for item in item_qs:
                pm_id = str(item.product_model.id)
                if pm_id not in grouped_items:
                    grouped_items[pm_id] = {
                        "model": {
                            "id": pm_id,
                            "name": item.product_model.name,
                            "sku": item.product_model.sku,
                            "tracking_mode": item.product_model.tracking_mode
                        },
                        "total_quantity": Decimal('0.0'),
                        "items": []
                    }
                grouped_items[pm_id]["items"].append({
                    "id": str(item.id),
                    "identifier": item.identifier,
                    "quantity": 1
                })
                grouped_items[pm_id]["total_quantity"] += Decimal('1.0')

            return {
                "product_name": f"Batch: {work_order.name}",
                "engine": "batch_manager",
                "current_stock_display": f"{len(grouped_items)} Models",
                "ui_config": {},
                "grouped_items": grouped_items
            }

        # 2. Try ProductModel
        from django.shortcuts import get_object_or_404
        product = get_object_or_404(ProductModel, id=pk, company=company)

        engine = EngineFactory.get_engine_for_profile(product)

        if location_id:
            try:
                loc = Location.objects.get(id=location_id, company=company)
                stock_info = {'total': StockService.get_stock_for_location(product, loc)}
            except Location.DoesNotExist:
                stock_info = {'total': 0}
        else:
            stock_info = StockService.get_stock_for_model(product)

        payload = WidgetProductService._build_product_payload(
            product, engine, stock_info, include_detail_extras=True
        )
        effective_engine_type = payload["engine_type"]
        total_val = stock_info['total']

        # Hydrate grouped items (Recipe) if it's a Batch Manager (Kit)
        grouped_items = {}
        if effective_engine_type == 'batch_manager' or product.components.exists():
            for comp in product.components.all().select_related('child'):
                child_id = str(comp.child.id)
                grouped_items[child_id] = {
                    "model": {
                        "id": child_id,
                        "name": comp.child.name,
                        "sku": comp.child.sku,
                        "tracking_mode": comp.child.tracking_mode
                    },
                    "total_quantity": Decimal('0.0'),
                    "items": []
                }

        if product.engine_type == 'bucket':
            # For Bucket engine, stock_value must be a list of batches
            batch_qs = ProductBatch.objects.filter(
                product_model=product,
                quantity__gt=0
            )

            if location_id:
                try:
                    loc = Location.objects.get(id=location_id, company=company)
                    batch_qs = batch_qs.filter(location=loc)
                except Location.DoesNotExist:
                    batch_qs = batch_qs.none()

            batches = batch_qs.select_related('location')

            stock_value = [{
                "id": str(b.id),
                "batch_identifier": b.batch_identifier,
                "quantity": float(b.quantity),
                "location": b.location.name,
                "expiry_date": b.data.get('expiry_date') if b.data else None,
                **(b.data or {})  # Flatten extra data
            } for b in batches]

        elif product.engine_type == 'tracker':
            items = PhysicalProduct.objects.filter(
                product_model=product,
            ).select_related('location')

            stock_value = [{
                "id": str(i.id),
                "identifier": i.identifier,
                "quantity": 1.0,
                "location": i.location.name if i.location else None,
                "status": i.status
            } for i in items]

        elif product.engine_type == 'time_based':
            batch_qs = ProductBatch.objects.filter(
                product_model=product,
                quantity__gt=0
            )
            if location_id:
                try:
                    loc = Location.objects.get(id=location_id, company=company)
                    batch_qs = batch_qs.filter(location=loc)
                except Location.DoesNotExist:
                    batch_qs = batch_qs.none()

            batches = batch_qs.select_related('location')
            stock_value = [{
                "id": str(b.id),
                "batch_identifier": b.batch_identifier,
                "quantity": float(b.quantity),
                "location": b.location.name if b.location else None,
                "expiry_date": b.data.get('expiry_date') if b.data else None,
                **(b.data or {})
            } for b in batches]
        else:
            stock_value = total_val

        payload["stock_value"] = stock_value
        payload["grouped_items"] = grouped_items if effective_engine_type == 'batch_manager' else {}
        return payload
