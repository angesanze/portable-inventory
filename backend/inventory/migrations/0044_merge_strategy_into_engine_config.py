"""Merge InventoryStrategy.schema_definition into ProductModel.engine_config."""
from django.db import migrations


def merge_strategy_config(apps, schema_editor):
    ProductModel = apps.get_model('inventory', 'ProductModel')

    merged = 0
    for pm in ProductModel.objects.select_related('strategy').filter(strategy__isnull=False):
        schema = pm.strategy.schema_definition or {}
        if schema:
            # Merge: engine_config takes precedence, schema fills gaps
            merged_config = {**schema, **(pm.engine_config or {})}
            # Also preserve the schema_definition under a namespaced key for audit
            merged_config['_legacy_schema_definition'] = schema
            pm.engine_config = merged_config
            pm.save(update_fields=['engine_config'])
            merged += 1

    print(f"  Merged schema_definition into engine_config for {merged} products.")


def reverse_merge(apps, schema_editor):
    """Reverse: remove _legacy_schema_definition key (cannot fully reverse)."""
    ProductModel = apps.get_model('inventory', 'ProductModel')
    for pm in ProductModel.objects.all():
        config = pm.engine_config or {}
        if '_legacy_schema_definition' in config:
            del config['_legacy_schema_definition']
            pm.engine_config = config
            pm.save(update_fields=['engine_config'])


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0043_rename_legacy_fields'),
    ]

    operations = [
        migrations.RunPython(merge_strategy_config, reverse_merge),
    ]
