import logging
from datetime import timedelta
from django.utils import timezone
from .models import MonitoringRule, EventLog, ProductModel, ProductBatch
from .services import StockService
from .services.stock import _parse_expiry
from .services.notifications import NotificationService
from .constants import TRACKING_MODE_BATCH, TRIGGER_TYPE_THRESHOLD, TRIGGER_TYPE_DATE_OFFSET

logger = logging.getLogger(__name__)

class Monitor:
    """Base class for specific monitoring logic."""
    def check(self, rule: MonitoringRule, product_model: ProductModel):
        pass

class ThresholdMonitor(Monitor):
    def check(self, rule: MonitoringRule, product_model: ProductModel):
        config = rule.condition_config
        min_threshold = config.get('min')
        max_threshold = config.get('max')
        
        # Determine current quantity using StockService
        stock_data = StockService.get_stock_for_model(product_model)
        current_qty = stock_data.get('total', 0)
            
        # Check Min
        if min_threshold is not None and current_qty < min_threshold:
            self._log_event(rule, product_model, f"Stock quantity {current_qty} is below minimum threshold of {min_threshold}.")

        # Check Max
        if max_threshold is not None and current_qty > max_threshold:
             self._log_event(rule, product_model, f"Stock quantity {current_qty} is above maximum threshold of {max_threshold}.")

    def _log_event(self, rule, product_model, message):
        event, created = EventLog.objects.get_or_create(
            rule=rule,
            product=product_model,
            status='OPEN',
            defaults={'message': message}
        )
        # Notify only on the transition (new OPEN event), not on every re-check
        # of an already-open one. Hooked here — not via post_save — so EventLogs
        # created directly in tests/fixtures don't trigger deliveries.
        if created:
            NotificationService.dispatch_event(event)

class DateOffsetMonitor(Monitor):
    def check(self, rule: MonitoringRule, product_model: ProductModel):
        # Date offsets only apply to batch-tracked products (BATCH_TRACKED,
        # PERISHABLE) — ProductBatch rows exist only in BATCH tracking mode.
        # BULK/INDIVIDUAL carry no batches to inspect.
        if product_model.tracking_mode != TRACKING_MODE_BATCH:
            return

        config = rule.condition_config
        # Every writer (stock/purchasing/onboarding/importer/widget/engines)
        # persists the date under `expiry_date`. Keep it configurable but
        # default to the canonical key so rules without an explicit field fire.
        date_field = config.get('date_field', 'expiry_date')
        days_offset = config.get('days_offset', 0)

        today = timezone.now().date()
        target_date = today + timedelta(days=days_offset)

        # Query Batches directly
        batches = ProductBatch.objects.filter(product_model=product_model, quantity__gt=0)

        for batch in batches:
            # Read the configured date field from the data JSONField
            b_date_str = (batch.data or {}).get(date_field)
            if not b_date_str:
                continue
                
            try:
                # Compare as dates, not strings: a batch may store a full ISO
                # datetime while target_date is date-only, so a lexical compare
                # is fragile. _parse_expiry handles both date and datetime input.
                b_dt = _parse_expiry(b_date_str)
                if b_dt is not None and b_dt.date() <= target_date:
                     self._log_event(rule, product_model, batch, f"Batch {batch.batch_identifier} approaches expiry ({b_date_str}).")
            except Exception as e:
                logger.error(f"Error parsing date {b_date_str}: {e}")

    def _log_event(self, rule, product_model, batch, message):
        # Dedup on (rule, product, batch, status) only — `message` goes in
        # defaults (mirroring ThresholdMonitor) so a re-check of an already-open
        # event doesn't mint a duplicate just because the message text differs.
        event, created = EventLog.objects.get_or_create(
            rule=rule,
            product=product_model,
            batch=batch,
            status='OPEN',
            defaults={'message': message},
        )
        if created:
            NotificationService.dispatch_event(event)

class RuleEvaluator:
    _monitors = {
        TRIGGER_TYPE_THRESHOLD: ThresholdMonitor(),
        TRIGGER_TYPE_DATE_OFFSET: DateOffsetMonitor(),
    }

    @classmethod
    def evaluate_product(cls, product_model: ProductModel):
        """
        Evaluates a product model against its strategy rules and individual thresholds.
        """
        # 1. Individual Threshold (via Attributes)
        attributes = product_model.attributes or {}
        min_threshold = attributes.get('min_threshold') or attributes.get('min_stock')
        
        if min_threshold is not None:
             try:
                 val = float(min_threshold)
                 virtual_rule = MonitoringRule(
                     name="Attribute Threshold",
                     trigger_type=TRIGGER_TYPE_THRESHOLD, 
                     condition_config={"min": val},
                     severity="WARNING"
                 )
                 cls._monitors[TRIGGER_TYPE_THRESHOLD].check(virtual_rule, product_model)
             except (ValueError, TypeError):
                 pass

        # 2. Rules linked to product_model
        for rule in product_model.monitoring_rules.all():
            monitor = cls._monitors.get(rule.trigger_type)
            if monitor:
                monitor.check(rule, product_model)
