import os
import django
from django.test import RequestFactory
import json

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "portable_inventory.settings")
django.setup()

from inventory.api.public.viewsets.products import ProductWidgetViewSet
from inventory.models import ProductModel
from core.models import Company, ApiKey

# Target Product ID from User URL
prod_id = "1eedbdcd-4baf-48e2-b4d9-1e9be3fb13df"

try:
    product = ProductModel.objects.get(id=prod_id)
    print(f"FOUND Product: {product.name}")
    print(f"  Start ID: {product.id}")
    print(f"  Strategy: {product.strategy.strategy_type if product.strategy else 'None'}")
    print(f"  Default Calc: {product.default_calculator.engine_type if product.default_calculator else 'None'}")
    print(f"  Components: {product.components.count()}")
    
    company = product.company
    api_key = ApiKey.objects.filter(company=company).first()
    
    factory = RequestFactory()
    
    # Test RETRIEVE
    print("\n--- Testing RETRIEVE Endpoint ---")
    request = factory.get(f'/api/widget/products/{prod_id}/?api_key={api_key.key}')
    view_retrieve = ProductWidgetViewSet.as_view({'get': 'retrieve'})
    response = view_retrieve(request, pk=prod_id)
    if response.status_code == 200:
        p = response.data
        print(f"RETRIEVE Response:")
        print(f"  engine_type: {p.get('engine_type')}")
        print(f"  engine: {p.get('engine')}")
        print(f"  is_template: {p.get('is_template')}")
    else:
        print(f"ERROR: {response.status_code}")

except ProductModel.DoesNotExist:
    print(f"Product {prod_id} NOT FOUND!")
except Exception as e:
    print(f"ERROR: {e}")
