"""PLATFORM-API-10 — OpenAPI schema, GDPR export, tenant deletion.

Three guarantees:

* The OpenAPI schema generates without raising (drf-spectacular ``SchemaGenerator``
  walks every registered view) — a broken ``@extend_schema`` would blow up here
  rather than silently in production docs.
* The GDPR export streams a ZIP whose per-model JSON contains the requesting
  company's rows and *only* that company's — the isolation guarantee.
* ``delete_company`` refuses to delete without ``--confirm`` (dry-run report),
  and deletes the company plus its cascade once confirmed.
"""
import io
import json
import zipfile

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework.test import APIClient

from core.models import AuditLog, Company, User
from core.provisioning import provision_manager_company
from inventory.models.core import Location, ProductModel
from inventory.models.suppliers import Supplier

EXPORT_URL = '/api/v1/platform/export/'


def _manager(name='Export Co'):
    company, _api_key, _value = provision_manager_company(name=name)
    user = User.objects.create_user(
        username=f'mgr-{company.id}', password='password123',
        company=company, role='Admin',
    )
    return company, user


def _seed(company, *, sku, supplier_name):
    """Give a company one product, one location and one supplier."""
    pm = ProductModel.objects.create(company=company, sku=sku, name=sku, profile='SIMPLE_COUNT')
    Location.objects.create(company=company, name=f'Loc-{sku}')
    Supplier.objects.create(company=company, name=supplier_name)
    return pm


# ---------------------------------------------------------------------------
# Schema generation
# ---------------------------------------------------------------------------

def test_schema_generates_without_exceptions():
    """SchemaGenerator must walk every view without raising."""
    from drf_spectacular.generators import SchemaGenerator

    generator = SchemaGenerator()
    schema = generator.get_schema(request=None, public=True)

    assert schema['openapi'].startswith('3.')
    assert EXPORT_URL in schema['paths']
    # The QR token exchange endpoint must be documented (Fase 1).
    assert '/api/v1/widget/exchange_token/' in schema['paths']


def test_schema_documents_security_and_acting_company():
    """JWT + api_key security schemes and the X-Acting-Company header."""
    from drf_spectacular.generators import SchemaGenerator

    schema = SchemaGenerator().get_schema(request=None, public=True)
    schemes = schema['components']['securitySchemes']
    assert schemes['BearerAuth']['scheme'] == 'bearer'
    assert schemes['ApiKeyAuth']['in'] == 'query'

    # An authenticated v1 (non-widget) op carries the optional acting-company header.
    op = schema['paths']['/api/v1/product-models/']['get']
    names = {p['name'] for p in op.get('parameters', [])}
    assert 'X-Acting-Company' in names


# ---------------------------------------------------------------------------
# GDPR export
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_export_returns_zip_with_expected_models():
    company, user = _manager('Alpha Co')
    _seed(company, sku='ALPHA-1', supplier_name='Alpha Supplier')

    client = APIClient()
    client.force_authenticate(user=user)
    resp = client.get(EXPORT_URL)

    assert resp.status_code == 200
    assert resp['Content-Type'] == 'application/zip'

    payload = b''.join(resp.streaming_content)
    archive = zipfile.ZipFile(io.BytesIO(payload))
    names = set(archive.namelist())
    for expected in [
        'products.json', 'movements.json', 'locations.json', 'suppliers.json',
        'customers.json', 'batches.json', 'physical_products.json',
        'qr_codes.json', 'event_logs.json', 'reservations.json',
        'purchase_orders.json', 'sales_orders.json', 'manifest.json',
    ]:
        assert expected in names, f"missing {expected}"

    products = json.loads(archive.read('products.json'))
    assert {p['sku'] for p in products} == {'ALPHA-1'}

    manifest = json.loads(archive.read('manifest.json'))
    assert manifest['company']['id'] == str(company.id)
    assert manifest['models']['products'] == 1

    # The audit trail records the export.
    assert AuditLog.objects.filter(
        action=AuditLog.Action.COMPANY_EXPORTED, target_company=company,
    ).exists()


@pytest.mark.django_db
def test_export_contains_only_the_requesting_company():
    """A tenant's export must never leak another tenant's rows."""
    alpha, alpha_user = _manager('Alpha Co')
    beta, _beta_user = _manager('Beta Co')
    _seed(alpha, sku='ALPHA-1', supplier_name='Alpha Supplier')
    _seed(beta, sku='BETA-1', supplier_name='Beta Supplier')

    client = APIClient()
    client.force_authenticate(user=alpha_user)
    resp = client.get(EXPORT_URL)
    payload = b''.join(resp.streaming_content)
    archive = zipfile.ZipFile(io.BytesIO(payload))

    products = json.loads(archive.read('products.json'))
    suppliers = json.loads(archive.read('suppliers.json'))
    assert {p['sku'] for p in products} == {'ALPHA-1'}
    assert {s['name'] for s in suppliers} == {'Alpha Supplier'}


@pytest.mark.django_db
def test_export_requires_authentication():
    resp = APIClient().get(EXPORT_URL)
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Tenant deletion
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_delete_company_refuses_without_confirm():
    company, _user = _manager('Doomed Co')
    _seed(company, sku='DOOM-1', supplier_name='Doom Supplier')

    # No --confirm: dry-run report only, company survives.
    call_command('delete_company', str(company.id))
    assert Company.objects.filter(pk=company.id).exists()


@pytest.mark.django_db
def test_delete_company_deletes_with_confirm():
    company, _user = _manager('Doomed Co')
    _seed(company, sku='DOOM-1', supplier_name='Doom Supplier')
    cid = company.id

    call_command('delete_company', str(cid), '--confirm')

    assert not Company.objects.filter(pk=cid).exists()
    assert not ProductModel.objects.filter(company_id=cid).exists()
    # The audit row survives the cascade (target_company FK is SET_NULL).
    assert AuditLog.objects.filter(action=AuditLog.Action.COMPANY_DELETED).exists()


@pytest.mark.django_db
def test_delete_company_unknown_id_errors():
    with pytest.raises(CommandError):
        call_command('delete_company', '00000000-0000-0000-0000-000000000000', '--confirm')


@pytest.mark.django_db
def test_delete_company_with_children_refuses():
    """A developer that still owns children cannot be deleted."""
    parent = Company.objects.create(name='Dev Parent', account_type=Company.AccountType.DEVELOPER)
    Company.objects.create(name='Child', account_type=Company.AccountType.MANAGER, parent=parent)

    with pytest.raises(CommandError):
        call_command('delete_company', str(parent.id), '--confirm')
    assert Company.objects.filter(pk=parent.id).exists()
