import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "portable_inventory.settings")
django.setup()

from inventory.models import ProductModel

print("--- Listing Products ---")
for p in ProductModel.objects.all():
    print(f"SKU: '{p.sku}' | Name: '{p.name}' | Components: {p.components.count()}")
