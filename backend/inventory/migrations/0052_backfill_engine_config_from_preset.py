"""Backfill ProductModel.engine_config from default_calculator preset.

Products that received a `default_calculator` before the serializer-side
auto-seed (`_seed_engine_config_from_preset`) landed still carry an empty
`engine_config = {}`. The widget then falls back to engine defaults and
omits the preset's `input_label`, so On-Hand reads e.g. "3" instead of
"3 Kg".

Forward pass:
  For every ProductModel where `default_calculator_id IS NOT NULL` AND
  `engine_config` is empty (None or {}), deep-copy the preset's
  `engine_config` if the preset's `engine_type` matches the resolved
  engine_type of the product (derived from `profile`). On mismatch the
  row is skipped and a warning is logged.

Reverse pass: no-op. Restoring the previous empty config would discard
runtime edits made after the backfill; backups/snapshots are the proper
restore tool.

Idempotent: rows with a non-empty `engine_config` are left untouched, so
re-running is safe.
"""
import copy
import logging

from django.db import migrations

logger = logging.getLogger(__name__)


# Profile → engine_type map (inlined; migrations must not import app code).
_PROFILE_ENGINE_TYPE = {
    'SIMPLE_COUNT':    'counter',
    'UNIT_CONVERSION': 'converter',
    'DIMENSIONAL':     'dimension',
    'BATCH_TRACKED':   'bucket',
    'PERISHABLE':      'time_based',
    'SERIALIZED':      'tracker',
    'ASSEMBLED':       'counter',
}


def backfill_engine_config(apps, schema_editor):
    ProductModel = apps.get_model('inventory', 'ProductModel')

    qs = ProductModel.objects.select_related('default_calculator').filter(
        default_calculator__isnull=False,
    )

    copied = 0
    skipped_filled = 0
    skipped_mismatch = 0
    skipped_unknown_profile = 0

    for pm in qs:
        if pm.engine_config:  # non-empty dict — leave alone
            skipped_filled += 1
            continue

        product_engine_type = _PROFILE_ENGINE_TYPE.get(pm.profile)
        if product_engine_type is None:
            logger.warning(
                "Skipping engine_config backfill for ProductModel %s (%s): "
                "unknown profile %r", pm.pk, pm.sku, pm.profile,
            )
            skipped_unknown_profile += 1
            continue

        preset = pm.default_calculator
        if preset.engine_type != product_engine_type:
            logger.warning(
                "Skipping engine_config backfill for ProductModel %s (%s): "
                "preset engine_type=%s != product engine_type=%s",
                pm.pk, pm.sku, preset.engine_type, product_engine_type,
            )
            skipped_mismatch += 1
            continue

        pm.engine_config = copy.deepcopy(preset.engine_config or {})
        pm.save(update_fields=['engine_config'])
        copied += 1

    if copied or skipped_mismatch or skipped_unknown_profile:
        print(
            f"  engine_config backfill: copied={copied} "
            f"skipped_filled={skipped_filled} "
            f"skipped_mismatch={skipped_mismatch} "
            f"skipped_unknown_profile={skipped_unknown_profile}"
        )


def reverse_noop(apps, schema_editor):
    """Reverse intentionally does nothing — backups are the restore path."""
    return


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0051_add_threshold_fields'),
    ]

    operations = [
        migrations.RunPython(backfill_engine_config, reverse_noop),
    ]
