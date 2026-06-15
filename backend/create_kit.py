import os
import django
from django.test import RequestFactory
import json

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "portable_inventory.settings")
django.setup()

from inventory.api.public.viewsets.products import ProductWidgetViewSet
from inventory.models import ProductModel, ProductComponent, Location
from core.models import Company, ApiKey

# 1. Setup Data
company = Company.objects.first()
if not company:
    company = Company.objects.create(name="Test Company")

api_key = ApiKey.objects.filter(company=company).first()
if not api_key:
    api_key = ApiKey.objects.create(company=company)

# Create Kit
kit, created = ProductModel.objects.get_or_create(sku="TEST-KIT", company=company, defaults={"name": "Test Kit Product"})
child, _ = ProductModel.objects.get_or_create(sku="TEST-CHILD", company=company, defaults={"name": "Test Child"})

# Ensure components
ProductComponent.objects.get_or_create(parent=kit, child=child, quantity=1)

print(f"Kit: {kit.name} (ID: {kit.id})")
print(f"Components in DB: {kit.components.count()}")

# Create Location for filtering test
loc, _ = Location.objects.get_or_create(company=company, name="Test Loc", type="WAREHOUSE")

# 2. Test LIST Endpoint
factory = RequestFactory()
print("\n--- Testing LIST Endpoint (No Location) ---")
request = factory.get(f'/api/widget/products/?api_key={api_key.key}')
view = ProductWidgetViewSet.as_view({'get': 'list'})
response = view(request)

found = False
if response.status_code == 200:
    for p in response.data['products']:
        if p['id'] == str(kit.id):
            print(f"FOUND KIT in List: {p['name']}")
            print(f"  engine_type: {p['engine_type']}")
            print(f"  components: {len(p['components'])}")
            found = True
else:
    print(f"Error: {response.status_code}")

if not found:
    print("Kit NOT found in list!")

# 3. Test LIST Endpoint with Location
print("\n--- Testing LIST Endpoint (With Location) ---")
request = factory.get(f'/api/widget/products/?api_key={api_key.key}&location_id={loc.id}')
# Note: if stock is 0, it might be filtered out depending on logic.
# Let's verify stock logic.
# If we don't add stock, it might disappear.

view = ProductWidgetViewSet.as_view({'get': 'list'})
response = view(request)

if response.status_code == 200:
    found_loc = False
    for p in response.data['products']:
         if p['id'] == str(kit.id):
             print(f"FOUND KIT in Loc List: {p['name']}")
             print(f"  components: {len(p['components'])}")
             found_loc = True
    if not found_loc:
        print("Kit NOT found in Loc list (Likely 0 stock filtered)")
