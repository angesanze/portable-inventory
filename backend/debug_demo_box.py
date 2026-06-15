import os
import django
from django.test import RequestFactory
import json

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "portable_inventory.settings")
django.setup()

from inventory.api.public.viewsets.products import ProductWidgetViewSet
from inventory.models import ProductModel
from core.models import Company, ApiKey

# Find Product
try:
    product = ProductModel.objects.get(sku="demo-box")
    print(f"FOUND Product: {product.name} (ID: {product.id})")
    print(f"Components Count: {product.components.count()}")
    for comp in product.components.all():
        print(f" - Component: {comp.child.sku} x {comp.quantity}")
except ProductModel.DoesNotExist:
    print("ERROR: Product with SKU 'demo-box' NOT FOUND!")
    exit(1)

# Setup Request
company = product.company
api_key = ApiKey.objects.filter(company=company).first()
if not api_key:
     api_key = ApiKey.objects.create(company=company, label="DebugAPI")

factory = RequestFactory()

# 1. Test LIST Endpoint
print("\n--- Testing LIST Endpoint ---")
request = factory.get(f'/api/widget/products/?api_key={api_key.key}')
view = ProductWidgetViewSet.as_view({'get': 'list'})
response = view(request)
if response.status_code == 200:
    data = response.data
    # data['products'] is a list
    found_in_list = False
    for p in data['products']:
        if p['sku'] == "demo-box":
            print(f"List Response for demo-box:")
            print(f"  engine_type: {p.get('engine_type')}")
            print(f"  components: {len(p.get('components', []))}")
            found_in_list = True
            break
    if not found_in_list:
        print("Product not found in LIST response!")
else:
    print(f"List Response Error: {response.status_code}")

# 2. Test RETRIEVE Endpoint
print("\n--- Testing RETRIEVE Endpoint ---")
request = factory.get(f'/api/widget/products/{product.id}/?api_key={api_key.key}')
view_retrieve = ProductWidgetViewSet.as_view({'get': 'retrieve'})
response = view_retrieve(request, pk=product.id)
if response.status_code == 200:
    p = response.data
    print(f"Retrieve Response for demo-box:")
    print(f"  engine_type: {p.get('engine_type')}")
    print(f"  is_template: {p.get('is_template')}")
    print(f"  grouped_items keys: {list(p.get('grouped_items', {}).keys())}")
else:
    print(f"Retrieve Response Error: {response.status_code}")
