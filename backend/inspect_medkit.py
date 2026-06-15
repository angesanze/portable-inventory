import os
import django
import json

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "portable_inventory.settings")
django.setup()

from inventory.models import ProductModel, ProductBatch, ProductComponent

sku = "demo-batch" # From screenshot
try:
    p = ProductModel.objects.get(sku=sku)
    print(f"PRODUCT: {p.name} ({p.sku})")
    print(f"  ID: {p.id}")
    print(f"  Engine: {p.engine_type}")
    print(f"  Strategy: {p.strategy.strategy_type if p.strategy else 'None'}")
    print(f"  Components (DB count): {p.components.count()}")
    for c in p.components.all():
         print(f"    - Costituent: {c.child.sku} x {c.quantity}")

    print("\nBATCHES:")
    batches = ProductBatch.objects.filter(product_model=p)
    if batches.exists():
        for b in batches:
            print(f"  Batch ID: {b.id}")
            print(f"  Identifier: '{b.batch_identifier}'")
            print(f"  Quantity: {b.quantity}")
    else:
        print("  No batches found.")

except ProductModel.DoesNotExist:
    print(f"Product with SKU '{sku}' not found.")
