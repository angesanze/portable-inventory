"""Inventory app signal handlers.

Wires ``ProductModel.save()`` into ``RestockService.sync_threshold_rule`` so
that any threshold change keeps the matching ``MonitoringRule`` in sync, and
ensures PERISHABLE products get their advance-expiry ``DATE_OFFSET`` rule.
"""

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import ProductModel
from .services.restock import RestockService


@receiver(post_save, sender=ProductModel)
def sync_threshold_rule_on_save(sender, instance, **kwargs):
    RestockService.sync_threshold_rule(instance)


@receiver(post_save, sender=ProductModel)
def ensure_expiry_rule_on_save(sender, instance, **kwargs):
    """Create the advance-expiry DATE_OFFSET rule for PERISHABLE products.

    Without this the auto-rule was never created, so DateOffsetMonitor had
    nothing to evaluate and the whole expiry-alert pipeline was inert (COR-17).
    Mirrors the threshold-rule sync above; ``ensure_monitoring_rules`` is an
    idempotent get_or_create, so re-running on every save is safe.
    """
    if instance.engine_type != "time_based":
        return
    from .engines import EngineFactory

    engine = EngineFactory.get_engine_for_profile(instance)
    ensure = getattr(engine, "ensure_monitoring_rules", None)
    if callable(ensure):
        ensure()
