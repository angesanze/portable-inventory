"""
Data migration: existing ProductModel records with tracking_mode='BULK'
and a BUCKET strategy get updated to tracking_mode='BATCH'.
"""
from django.db import migrations


def forward(apps, schema_editor):
    ProductModel = apps.get_model('inventory', 'ProductModel')
    InventoryStrategy = apps.get_model('inventory', 'InventoryStrategy')

    bucket_strategy_ids = InventoryStrategy.objects.filter(
        type='BUCKET'
    ).values_list('id', flat=True)

    ProductModel.objects.filter(
        tracking_mode='BULK',
        strategy_id__in=list(bucket_strategy_ids),
    ).update(tracking_mode='BATCH')


def reverse(apps, schema_editor):
    ProductModel = apps.get_model('inventory', 'ProductModel')
    ProductModel.objects.filter(tracking_mode='BATCH').update(tracking_mode='BULK')


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0036_add_batch_tracking_mode'),
    ]

    operations = [
        migrations.RunPython(forward, reverse),
    ]
