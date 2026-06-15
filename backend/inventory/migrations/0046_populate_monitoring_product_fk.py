"""Populate MonitoringRule.product_model from strategy → ProductModel link."""
from django.db import migrations


def migrate_monitoring_rules(apps, schema_editor):
    MonitoringRule = apps.get_model('inventory', 'MonitoringRule')
    ProductModel = apps.get_model('inventory', 'ProductModel')

    migrated = 0
    for rule in MonitoringRule.objects.select_related('strategy').filter(strategy__isnull=False):
        # Find first product using this strategy
        product = ProductModel.objects.filter(strategy=rule.strategy).first()
        if product:
            rule.product_model = product
            rule.save(update_fields=['product_model'])
            migrated += 1

    print(f"  Linked {migrated} monitoring rules to product_model.")


def reverse_migrate(apps, schema_editor):
    """Reverse: clear product_model FK (cannot fully reverse)."""
    MonitoringRule = apps.get_model('inventory', 'MonitoringRule')
    MonitoringRule.objects.update(product_model=None)


class Migration(migrations.Migration):
    dependencies = [
        ('inventory', '0045_monitoring_add_product_fk'),
    ]

    operations = [
        migrations.RunPython(migrate_monitoring_rules, reverse_migrate),
    ]
