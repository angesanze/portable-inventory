"""Inventory app signal handlers.

Wires ``ProductModel.save()`` into ``RestockService.sync_threshold_rule`` so
that any threshold change keeps the matching ``MonitoringRule`` in sync.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import ProductModel
from .services.restock import RestockService


@receiver(post_save, sender=ProductModel)
def sync_threshold_rule_on_save(sender, instance, **kwargs):
    RestockService.sync_threshold_rule(instance)
