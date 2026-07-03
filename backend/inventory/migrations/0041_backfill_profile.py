"""Backfill ProductModel.profile from tracking_mode + engine_type + strategy."""

from django.db import migrations


# Inline the derivation logic to make migration self-contained
# (don't import from app code — migrations must be frozen in time)
PROFILE_DERIVATION = {
    # (tracking_mode, engine_type, strategy_type_or_None) → profile
    ("BULK", "counter", None): "SIMPLE_COUNT",
    ("BULK", "converter", "CONVERTER"): "UNIT_CONVERSION",
    ("BULK", "converter", None): "UNIT_CONVERSION",
    ("BULK", "dimension", "DIMENSION"): "DIMENSIONAL",
    ("BULK", "dimension", None): "DIMENSIONAL",
    ("BATCH", "bucket", "BUCKET"): "BATCH_TRACKED",
    ("BATCH", "bucket", None): "BATCH_TRACKED",
    ("BATCH", "time_based", "TIME"): "PERISHABLE",
    ("BATCH", "time_based", "BUCKET"): "PERISHABLE",
    ("BATCH", "time_based", None): "PERISHABLE",
    ("INDIVIDUAL", "tracker", None): "SERIALIZED",
    ("BULK", "counter", "ASSEMBLY"): "ASSEMBLED",
}


def _derive(tracking_mode, engine_type, strategy_type):
    """Fuzzy derivation matching profiles.derive_profile logic."""
    key = (tracking_mode, engine_type, strategy_type)
    if key in PROFILE_DERIVATION:
        return PROFILE_DERIVATION[key]

    # Fuzzy fallbacks
    if tracking_mode == "BATCH" and engine_type == "time_based":
        return "PERISHABLE"
    if tracking_mode == "BULK" and engine_type == "counter":
        return "ASSEMBLED" if strategy_type == "ASSEMBLY" else "SIMPLE_COUNT"
    if tracking_mode == "BULK" and engine_type == "converter":
        return "UNIT_CONVERSION"
    if tracking_mode == "BULK" and engine_type == "dimension":
        return "DIMENSIONAL"
    if tracking_mode == "BATCH" and engine_type == "bucket":
        return "BATCH_TRACKED"
    if tracking_mode == "INDIVIDUAL" and engine_type == "tracker":
        return "SERIALIZED"
    return None


def backfill_profile(apps, schema_editor):
    ProductModel = apps.get_model("inventory", "ProductModel")
    InventoryStrategy = apps.get_model("inventory", "InventoryStrategy")

    unmapped = []
    updated = 0

    for pm in ProductModel.objects.select_related("strategy").all():
        strategy_type = pm.strategy.strategy_type if pm.strategy else None
        profile = _derive(pm.tracking_mode, pm.engine_type, strategy_type)

        if profile is None:
            unmapped.append(
                f"  ProductModel {pm.id} ({pm.sku}): "
                f"tracking={pm.tracking_mode}, engine={pm.engine_type}, "
                f"strategy={strategy_type}"
            )
            continue

        pm.profile = profile
        pm.save(update_fields=["profile"])
        updated += 1

    if unmapped:
        raise Exception(
            f"Cannot derive profile for {len(unmapped)} products:\n"
            + "\n".join(unmapped)
            + "\n\nFix these products manually before re-running migration."
        )

    print(f"  Backfilled {updated} products with inventory profile.")


def reverse_backfill(apps, schema_editor):
    """Reverse: just null out profile (legacy fields still intact)."""
    ProductModel = apps.get_model("inventory", "ProductModel")
    ProductModel.objects.all().update(profile=None)


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0040_productmodel_profile"),
    ]

    operations = [
        migrations.RunPython(backfill_profile, reverse_backfill),
    ]
