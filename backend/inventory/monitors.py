import logging
from datetime import timedelta
from django.utils import timezone
from .models import MonitoringRule, EventLog, ProductModel, ProductBatch
from .services import StockService
from .services.notifications import NotificationService
from .constants import TRACKING_MODE_BULK, TRIGGER_TYPE_THRESHOLD, TRIGGER_TYPE_DATE_OFFSET

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
        # Only applicable for products with batches (BUCKET)
        if product_model.tracking_mode != TRACKING_MODE_BULK:
            return

        config = rule.condition_config
        date_field = config.get('date_field', 'expiration_date')
        days_offset = config.get('days_offset', 0)
        
        today = timezone.now().date()
        target_date = today + timedelta(days=days_offset)

        # Query Batches directly
        batches = ProductBatch.objects.filter(product_model=product_model, quantity__gt=0)

        for batch in batches:
            # Check expiration_date in the data JSONField
            b_date_str = batch.data.get('expiration_date')
            if not b_date_str:
                continue
                
            try:
                # Assuming ISO format YYYY-MM-DD
                if b_date_str <= target_date.isoformat():
                     self._log_event(rule, product_model, batch, f"Batch {batch.batch_identifier} approaches expiry ({b_date_str}).")
            except Exception as e:
                logger.error(f"Error parsing date {b_date_str}: {e}")

    def _log_event(self, rule, product_model, batch, message):
        event, created = EventLog.objects.get_or_create(
            rule=rule,
            product=product_model,
            batch=batch,
            message=message,
            status='OPEN'
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
