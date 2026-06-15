import logging

from django.db import transaction
from decimal import Decimal
from ..models import Movement, Location, ProductModel, PhysicalProduct, ProductBatch
from ..exceptions import InventoryError, ItemNotFoundError

logger = logging.getLogger('inventory.widget')


class BatchManagerService:
    """Handles work order composition — batch manager transactions and kit production."""

    @staticmethod
    @transaction.atomic
    def handle_batch_manager_transaction(work_order, data):
        """
        Handles assigning/unassigning items to a Work Order.
        Creates Movement records for every operation to maintain audit trail.
        """
        try:
            delta = float(data.get('delta', 0))
            if delta == 0:
                return {"success": True}

            def _get_location(item=None):
                """Resolve location for movement records."""
                if item and hasattr(item, 'location') and item.location:
                    return item.location
                wh = Location.objects.filter(company=work_order.company, type='WAREHOUSE').first()
                return wh if wh else Location.objects.filter(company=work_order.company).first()

            def _record_movement(product_model, location, quantity, reason,
                                 physical_product=None, batch=None):
                """Create an audit Movement record for a batch manager operation."""
                Movement.objects.create(
                    product_model=product_model,
                    from_location=location,
                    to_location=location,
                    quantity=Decimal(str(abs(quantity))),
                    work_order=work_order,
                    physical_product=physical_product,
                    batch=batch,
                    reason=reason,
                )

            # 1. Handle Physical Products (Serials)
            if data.get('physical_product_id') or data.get('physical_identifier'):
                identifier = data.get('physical_identifier')
                pp_id = data.get('physical_product_id')

                qs = PhysicalProduct.objects.filter(product_model__company=work_order.company)
                if pp_id:
                    qs = qs.filter(id=pp_id)
                elif identifier:
                    qs = qs.filter(identifier=identifier)

                item = qs.select_related('product_model', 'location').first()
                if not item:
                    raise ItemNotFoundError(detail="Item not found")

                loc = _get_location(item)
                if delta < 0:
                    # Remove from WO
                    if item.work_order_id == work_order.id:
                        item.work_order = None
                        item.save()
                        _record_movement(
                            item.product_model, loc, 1,
                            reason=f"WO_UNASSIGN: {item.identifier} removed from WO {work_order.name}",
                            physical_product=item,
                        )
                else:
                    # Add to WO
                    item.work_order = work_order
                    item.save()
                    _record_movement(
                        item.product_model, loc, 1,
                        reason=f"WO_ASSIGN: {item.identifier} assigned to WO {work_order.name}",
                        physical_product=item,
                    )

            # 2. Handle Batches
            elif data.get('batch_id'):
                batch = ProductBatch.objects.filter(
                    id=data.get('batch_id'), work_order=work_order
                ).select_related('product_model', 'location').first()
                if batch:
                    loc = _get_location(batch)
                    abs_delta = abs(delta)
                    if delta < 0:
                        if (batch.quantity + Decimal(str(delta))) <= 0:
                            removed_qty = batch.quantity
                            product_model = batch.product_model
                            batch.delete()
                            _record_movement(
                                product_model, loc, float(removed_qty),
                                reason=f"BATCH_REMOVE: batch removed from WO {work_order.name}",
                            )
                        else:
                            batch.quantity += Decimal(str(delta))
                            batch.save()
                            _record_movement(
                                batch.product_model, loc, abs_delta,
                                reason=f"BATCH_REMOVE: {abs_delta} removed from batch in WO {work_order.name}",
                                batch=batch,
                            )
                    else:
                        batch.quantity += Decimal(str(delta))
                        batch.save()
                        _record_movement(
                            batch.product_model, loc, abs_delta,
                            reason=f"BATCH_ADD: {abs_delta} added to batch in WO {work_order.name}",
                            batch=batch,
                        )
                else:
                    raise ItemNotFoundError(detail="Batch not found")

            # 3. Handle Generic Add (Batch Creation / Adjustment)
            elif data.get('product_model_id') and delta != 0:
                wh = Location.objects.filter(company=work_order.company, type='WAREHOUSE').first()
                loc = wh if wh else Location.objects.filter(company=work_order.company).first()
                batch_identifier = f"BATCH-{work_order.id.hex[:6].upper()}-{data.get('product_model_id')[:4]}"

                product_model = ProductModel.objects.get(id=data.get('product_model_id'))

                batch = ProductBatch.objects.filter(
                    product_model_id=data.get('product_model_id'),
                    work_order=work_order,
                    location=loc,
                    batch_identifier=batch_identifier
                ).first()

                if batch:
                    batch.quantity += Decimal(str(delta))
                    if batch.quantity <= 0:
                        removed_qty = batch.quantity - Decimal(str(delta))  # original qty
                        batch.delete()
                        _record_movement(
                            product_model, loc, float(abs(removed_qty)),
                            reason=f"BATCH_REMOVE: batch {batch_identifier} removed from WO {work_order.name}",
                        )
                    else:
                        batch.save()
                        if delta > 0:
                            _record_movement(
                                product_model, loc, delta,
                                reason=f"BATCH_ADD: {delta} added to batch {batch_identifier} in WO {work_order.name}",
                                batch=batch,
                            )
                        else:
                            _record_movement(
                                product_model, loc, abs(delta),
                                reason=f"BATCH_REMOVE: {abs(delta)} removed from batch {batch_identifier} in WO {work_order.name}",
                                batch=batch,
                            )
                elif delta > 0:
                    new_batch = ProductBatch.objects.create(
                        product_model_id=data.get('product_model_id'),
                        work_order=work_order,
                        quantity=Decimal(str(delta)),
                        location=loc,
                        batch_identifier=batch_identifier,
                        data={"source": "Widget Manual Add"}
                    )
                    _record_movement(
                        product_model, loc, delta,
                        reason=f"BATCH_ADD: batch {batch_identifier} created in WO {work_order.name}",
                        batch=new_batch,
                    )

            # 4. Handle Produce Kit
            elif data.get('operation') == 'produce_kit' and delta > 0:
                wh = Location.objects.filter(company=work_order.company, type='WAREHOUSE').first()
                loc = wh if wh else Location.objects.filter(company=work_order.company).first()

                if work_order.product_model:
                    for comp in work_order.product_model.components.all():
                        qty_needed = Decimal(str(delta)) * comp.quantity

                        existing_batch = ProductBatch.objects.filter(
                            work_order=work_order,
                            product_model=comp.child,
                            location=loc
                        ).first()

                        if existing_batch:
                            existing_batch.quantity += qty_needed
                            existing_batch.save()
                            _record_movement(
                                comp.child, loc, float(qty_needed),
                                reason=f"KIT_PRODUCTION: {float(qty_needed)} of {comp.child.sku} for WO {work_order.name}",
                                batch=existing_batch,
                            )
                        else:
                            new_batch = ProductBatch.objects.create(
                                product_model=comp.child,
                                work_order=work_order,
                                quantity=qty_needed,
                                location=loc,
                                batch_identifier=f"AUTO-{work_order.id.hex[:4]}-{comp.child.sku[:4]}",
                                data={"source": "Widget Kit Production"}
                            )
                            _record_movement(
                                comp.child, loc, float(qty_needed),
                                reason=f"KIT_PRODUCTION: {float(qty_needed)} of {comp.child.sku} for WO {work_order.name}",
                                batch=new_batch,
                            )

            return {"success": True}
        except InventoryError:
            raise
        except Exception as e:
            logger.exception("Unexpected error in batch manager transaction")
            raise InventoryError(detail=str(e))
