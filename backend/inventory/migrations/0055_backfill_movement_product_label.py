from django.db import migrations
from django.db.models import F, OuterRef, Subquery, Value
from django.db.models.functions import Concat, Left


def backfill_product_label(apps, schema_editor):
    """Stamp the product snapshot onto existing movements that still have
    a live product_model FK. Orphans (already SET_NULL) stay blank — their
    identity is unrecoverable."""
    Movement = apps.get_model('inventory', 'Movement')
    ProductModel = Movement._meta.get_field('product_model').related_model
    # A correlated subquery keeps this a single UPDATE — `.update()` forbids
    # direct joined-field references (`product_model__sku`), which raises a
    # FieldError on every backend.
    label = Subquery(
        ProductModel.objects.filter(pk=OuterRef('product_model')).values(
            value=Left(Concat(F('sku'), Value(' - '), F('name')), 255)
        )[:1]
    )
    Movement.objects.filter(
        product_label='', product_model__isnull=False
    ).update(product_label=label)


def reverse_noop(apps, schema_editor):
    # Snapshot column is additive; nothing to undo.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0054_movement_product_label'),
    ]

    operations = [
        migrations.RunPython(backfill_product_label, reverse_noop),
    ]
