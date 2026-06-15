import os
import sys
import django

# Add project root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from inventory.models import ProductModel, Location
from core.models import ApiKey, Company

def run():
    company = Company.objects.first()
    if not company:
        print("ERROR: No company found")
        sys.exit(1)

    # Create or Get API Key
    # Note: ApiKey model does not auto-generate key on save, so we must provide it in defaults.
    import secrets
    key_val = secrets.token_hex(32)
    key, created = ApiKey.objects.get_or_create(
        company=company, 
        label='E2E Shell Key',
        defaults={'key': key_val}
    )
    if not key.key:
        key.key = key_val
        key.save()

    # Ensure Locations
    # Check for existing WAREHOUSE
    if not Location.objects.filter(company=company, type='WAREHOUSE').exists():
        Location.objects.create(company=company, type='WAREHOUSE', name='Main Warehouse')
    
    # Check for existing VIRTUAL External
    if not Location.objects.filter(company=company, type='VIRTUAL', name='External').exists():
        Location.objects.create(company=company, type='VIRTUAL', name='External')

    product = ProductModel.objects.create(
        company=company,
        name='Shell Widget Product',
        sku=f'SHELL-{os.urandom(4).hex()}',
        tracking_mode='BULK',
        engine_type='counter'
    )
    
    print(f"export TEST_PRODUCT_ID={product.id}")
    print(f"export TEST_API_KEY={key.key}")

if __name__ == "__main__":
    run()
