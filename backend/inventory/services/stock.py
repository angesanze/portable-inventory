from typing import List, Dict, Any
from django.db import transaction
from django.db.models import Sum, F
from django.core.exceptions import ValidationError
from decimal import Decimal
from ..models import Movement, Location, ProductModel, PhysicalProduct, ProductBatch, WorkOrder
from ..profiles import profiles_for_tracking_mode
from ..constants import (
    TRACKING_MODE_BATCH, TRACKING_MODE_INDIVIDUAL, PROFILE_PERISHABLE,
    PHYSICAL_STATUS_ACTIVE, LOCATION_TYPE_VIRTUAL, LOCATION_TYPE_LOSS,
)

BULK_PROFILES = profiles_for_tracking_mode('BULK')
import uuid
from django.utils import timezone


def _parse_expiry(value):
    """Parse a batch `expiry_date` string into an aware datetime, or None."""
    from django.utils.dateparse import parse_datetime, parse_date
    if not value:
        return None
    exp_dt = parse_datetime(str(value))
    if exp_dt is None:
        d = parse_date(str(value))
        if d is not None:
            exp_dt = timezone.datetime.combine(d, timezone.datetime.min.time())
    if exp_dt is not None and timezone.is_naive(exp_dt):
        exp_dt = timezone.make_aware(exp_dt)
    return exp_dt


def _batch_expired(batch, now) -> bool:
    expiry = batch.data.get("expiry_date") if batch.data else None
    exp_dt = _parse_expiry(expiry)
    return exp_dt is not None and exp_dt <= now


def _has_tracker_preset(product_model: 'ProductModel') -> bool:
    """True when this product is governed by a tracker state machine.

    Either the product carries its own `status_transitions` map, or its
    assigned `default_calculator` preset uses the tracker engine. In that
    world a non-ACTIVE status (BROKEN/REPAIRED/AO/…) is metadata about a
    unit that is still physically on the books — it must NOT zero out
    on-hand stock.
    """
    cfg = getattr(product_model, 'engine_config', None) or {}
    if cfg.get('status_transitions'):
        return True
    calc = getattr(product_model, 'default_calculator', None)
    if calc and getattr(calc, 'engine_type', None) == 'tracker':
        return True
    return False


class StockService:
    @staticmethod
    def get_stock_for_location(product_model: ProductModel, location: Location) -> Decimal:
        """
        Calculates stock for a specific model in a specific location.

        Each tracking mode uses its semantically correct stock source:
        - BATCH: SUM of ProductBatch quantities
        - INDIVIDUAL: COUNT of PhysicalProduct at location (ACTIVE-only for
          legacy serialized products; ALL statuses when a tracker preset is
          configured, since non-ACTIVE statuses are just metadata labels on
          units still physically present)
        - BULK: Movement ledger aggregation (incoming - outgoing)
        """
        if product_model.tracking_mode == TRACKING_MODE_BATCH:
            # PERISHABLE: expired batches are not available stock. Expiry
            # lives in JSON (`data.expiry_date`), so filter in Python.
            if product_model.profile == PROFILE_PERISHABLE:
                now = timezone.now()
                batches = ProductBatch.objects.filter(
                    product_model=product_model,
                    location=location,
                    quantity__gt=0,
                )
                return sum(
                    (b.quantity for b in batches if not _batch_expired(b, now)),
                    Decimal('0'),
                )
            total = ProductBatch.objects.filter(
                product_model=product_model,
                location=location
            ).aggregate(t=Sum('quantity'))['t']
            return total or Decimal('0')

        if product_model.tracking_mode == TRACKING_MODE_INDIVIDUAL:
            qs = PhysicalProduct.objects.filter(
                product_model=product_model,
                location=location,
            )
            if not _has_tracker_preset(product_model):
                qs = qs.filter(status=PHYSICAL_STATUS_ACTIVE)
            return Decimal(qs.count())

        # BULK: Ledger aggregation
        incoming = Movement.objects.filter(
            product_model=product_model,
            to_location=location
        ).aggregate(total=Sum('quantity'))['total'] or Decimal('0')

        outgoing = Movement.objects.filter(
            product_model=product_model,
            from_location=location
        ).aggregate(total=Sum('quantity'))['total'] or Decimal('0')

        return incoming - outgoing

    @staticmethod
    def get_available_for_location(product_model: ProductModel, location: Location) -> Decimal:
        """Available-to-sell stock at ``location``.

        Physical on-hand minus ACTIVE reservations. Non-sellable locations
        (RMA-08 quarantine: real WAREHOUSE-type stock flagged
        ``is_sellable=False``) are never available — the goods are physically
        present but held pending a return resolution, so they contribute 0.
        """
        if location is not None and not location.is_sellable:
            return Decimal('0')
        from .reservations import ReservationService  # inline import: breaks the services import cycle (ledger↔reservations↔stock↔costing)
        physical = StockService.get_stock_for_location(product_model, location)
        return physical - ReservationService.active_reserved_qty(product_model, location)

    @staticmethod
    def get_stock_for_model(product_model: ProductModel) -> dict:
        """
        Returns total stock and breakdown by location.
        Optimized to avoid N+1 queries by using aggregation.
        """
        # Exclude virtual/loss counterparties and non-sellable areas (RMA-08
        # quarantine): the "stock" total reported here is the *sellable* total.
        # Quarantine on-hand is surfaced separately via get_quarantine_for_model.
        locations = Location.objects.filter(
            company=product_model.company,
            is_sellable=True,
        ).exclude(type__in=[LOCATION_TYPE_VIRTUAL, LOCATION_TYPE_LOSS])

        breakdown = {}
        total = Decimal('0')

        # BATCH: Simple aggregation on ProductBatch
        if product_model.tracking_mode == TRACKING_MODE_BATCH:
            # PERISHABLE: skip expired batches — see get_stock_for_location.
            if product_model.profile == PROFILE_PERISHABLE:
                now = timezone.now()
                batches = ProductBatch.objects.filter(
                    product_model=product_model,
                    location__in=locations,
                    quantity__gt=0,
                ).select_related('location')
                for b in batches:
                    if _batch_expired(b, now):
                        continue
                    name = b.location.name
                    breakdown[name] = breakdown.get(name, Decimal('0')) + b.quantity
                total = sum(breakdown.values(), Decimal('0'))
                return {"total": total, "breakdown": breakdown}

            batch_stocks = ProductBatch.objects.filter(
                product_model=product_model,
                location__in=locations
            ).values('location__name').annotate(total_qty=Sum('quantity'))

            for entry in batch_stocks:
                qty = entry['total_qty'] or Decimal('0')
                if qty != 0:
                    breakdown[entry['location__name']] = qty
                    total += qty

            return {"total": total, "breakdown": breakdown}

        # INDIVIDUAL: Count PhysicalProducts per location. ACTIVE-only for
        # plain serialized products; ALL statuses when a tracker preset
        # governs the product (a BROKEN unit is still on the books).
        if product_model.tracking_mode == TRACKING_MODE_INDIVIDUAL:
            from django.db.models import Count
            qs = PhysicalProduct.objects.filter(
                product_model=product_model,
                location__in=locations,
            )
            if not _has_tracker_preset(product_model):
                qs = qs.filter(status=PHYSICAL_STATUS_ACTIVE)
            item_stocks = qs.values('location__name').annotate(total_qty=Count('id'))

            for entry in item_stocks:
                qty = Decimal(entry['total_qty'])
                if qty != 0:
                    breakdown[entry['location__name']] = qty
                    total += qty

            return {"total": total, "breakdown": breakdown}

        # BULK: Ledger aggregation (Incoming - Outgoing)
        incoming_map = {
            item['to_location__name']: item['total_qty'] or Decimal('0')
            for item in Movement.objects.filter(
                product_model=product_model,
                to_location__in=locations
            ).values('to_location__name').annotate(total_qty=Sum('quantity'))
        }

        outgoing_map = {
            item['from_location__name']: item['total_qty'] or Decimal('0')
            for item in Movement.objects.filter(
                product_model=product_model,
                from_location__in=locations
            ).values('from_location__name').annotate(total_qty=Sum('quantity'))
        }

        all_loc_names = set(incoming_map.keys()) | set(outgoing_map.keys())

        for loc_name in all_loc_names:
            net = incoming_map.get(loc_name, Decimal('0')) - outgoing_map.get(loc_name, Decimal('0'))
            if net != 0:
                breakdown[loc_name] = net
                total += net

        return {
            "total": total,
            "breakdown": breakdown
        }

    @staticmethod
    def get_quarantine_for_model(product_model: ProductModel) -> dict:
        """On-hand quantity of this product sitting in non-sellable (quarantine)
        locations (RMA-08). Returns {total, breakdown: {location_name: qty}}.

        Mirrors get_stock_for_model but inverts the sellable filter, so callers
        can surface an "In quarantine" section distinct from sellable stock.
        """
        quarantine_locs = Location.objects.filter(
            company=product_model.company,
            is_sellable=False,
        )
        breakdown = {}
        total = Decimal('0')
        for loc in quarantine_locs:
            qty = StockService.get_stock_for_location(product_model, loc)
            if qty != 0:
                breakdown[loc.name] = qty
                total += qty
        return {"total": total, "breakdown": breakdown}

    @staticmethod
    def get_tracker_status_counts(product_model: ProductModel) -> dict:
        """Returns a dict of {status: count} for all PhysicalProducts of this model."""
        from django.db.models import Count
        return dict(
            PhysicalProduct.objects.filter(product_model=product_model)
            .values_list('status')
            .annotate(count=Count('id'))
        )

    @staticmethod
    def get_expiry_display_data(product_model: ProductModel, engine_config: dict) -> dict:
        """Returns {value: total, expired: N, expiring_soon: N} for time-based products."""
        from django.utils import timezone as tz
        from django.utils.dateparse import parse_datetime, parse_date
        from datetime import timedelta

        total = ProductBatch.objects.filter(
            product_model=product_model,
            quantity__gt=0,
        ).aggregate(t=Sum('quantity'))['t'] or Decimal('0')

        time_unit = engine_config.get("time_unit", "days")
        soon_delta = timedelta(days=3) if time_unit == "days" else timedelta(hours=72)
        now = tz.now()

        batches = ProductBatch.objects.filter(
            product_model=product_model,
            quantity__gt=0,
        )
        expiring_soon = 0
        expired = 0
        for batch in batches:
            expiry = batch.data.get("expiry_date") if batch.data else None
            exp_dt = _parse_expiry(expiry)
            if exp_dt:
                if exp_dt <= now:
                    expired += int(batch.quantity)
                elif exp_dt <= now + soon_delta:
                    expiring_soon += int(batch.quantity)

        return {
            "value": float(total),
            "expired": expired,
            "expiring_soon": expiring_soon,
        }

    @staticmethod
    def get_location_contents(location: Location) -> list:
        """
        Returns a list of all items currently in the location.
        Combines Batches, Physical Items, and Bulk sums.
        
        Optimized to use aggregation for Bulk items, avoiding N+1 queries.
        """
        contents = []
        
        # 1. Batches (Container/Bucket Strategy)
        # Fetch all batches with positive quantity in this location
        batches = ProductBatch.objects.filter(location=location, quantity__gt=0).select_related('product_model')
        for b in batches:
            contents.append({
                "type": "BATCH",
                "product_id": str(b.product_model.id),
                "product_name": b.product_model.name,
                "sku": b.product_model.sku,
                "quantity": b.quantity,
                "batch_id": b.batch_identifier,
                "meta": b.data 
            })

        # 2. Physical Products (Individual Strategy)
        # Fetch all active physical items in this location
        items = PhysicalProduct.objects.filter(location=location, status=PHYSICAL_STATUS_ACTIVE).select_related('product_model')
        for i in items:
            contents.append({
                "type": "ITEM",
                "product_id": str(i.product_model.id),
                "product_name": i.product_model.name,
                "sku": i.product_model.sku,
                "quantity": 1,
                "identifier": i.identifier
            })

        # 3. Bulk Items (Ledger Aggregation)
        # Optimize: instead of iterating products, aggregate movements for this location by product
        
        # Incoming quantities by product
        incoming = Movement.objects.filter(
            to_location=location,
            product_model__profile__in=BULK_PROFILES
        ).values('product_model__id', 'product_model__name', 'product_model__sku').annotate(total=Sum('quantity'))

        # Outgoing quantities by product
        outgoing = Movement.objects.filter(
            from_location=location,
            product_model__profile__in=BULK_PROFILES
        ).values('product_model__id', 'product_model__name', 'product_model__sku').annotate(total=Sum('quantity'))

        stock_map = {}

        # Process Incoming
        for entry in incoming:
            pid = str(entry['product_model__id'])
            if pid not in stock_map:
                stock_map[pid] = {
                    "name": entry['product_model__name'],
                    "sku": entry['product_model__sku'],
                    "qty": Decimal('0')
                }
            stock_map[pid]['qty'] += entry['total'] or Decimal('0')

        # Process Outgoing
        for entry in outgoing:
            pid = str(entry['product_model__id'])
            if pid not in stock_map:
                 # Should not happen (negative stock) but handle gracefully
                 stock_map[pid] = {
                    "name": entry['product_model__name'],
                    "sku": entry['product_model__sku'],
                    "qty": Decimal('0')
                }
            stock_map[pid]['qty'] -= entry['total'] or Decimal('0')

        # Convert map to list
        for pid, data in stock_map.items():
            if data['qty'] != 0:
                contents.append({
                    "type": "BULK",
                    "product_id": pid,
                    "product_name": data['name'],
                    "sku": data['sku'],
                    "quantity": data['qty']
                })
                  
        return contents
