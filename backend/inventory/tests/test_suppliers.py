"""Tests for Supplier (fornitore) registry + supplier attribution on receipts."""

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from inventory.models import Location, Movement, ProductModel, Supplier
from inventory.tests.helpers import make_company


class SupplierCrudTest(TestCase):
    def setUp(self):
        self.company, self.user, _ = make_company("SUP")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = "/api/v1/suppliers/"

    def test_create_and_list_supplier(self):
        resp = self.client.post(
            self.url,
            {
                "name": "Acme Srl",
                "vat_number": "IT12345678901",
                "email": "orders@acme.example",
                "phone": "+39 02 1234567",
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data["name"], "Acme Srl")

        listing = self.client.get(self.url)
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        names = [
            s["name"]
            for s in (listing.data["results"] if isinstance(listing.data, dict) else listing.data)
        ]
        self.assertIn("Acme Srl", names)

    def test_duplicate_name_rejected(self):
        Supplier.objects.create(company=self.company, name="Dup Co")
        resp = self.client.post(self.url, {"name": "Dup Co"})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cross_tenant_supplier_invisible(self):
        company_b, _, _ = make_company("SUP-B")
        Supplier.objects.create(company=company_b, name="B Supplier")
        listing = self.client.get(self.url)
        names = [
            s["name"]
            for s in (listing.data["results"] if isinstance(listing.data, dict) else listing.data)
        ]
        self.assertNotIn("B Supplier", names)


class ReceiptWithSupplierTest(TestCase):
    def setUp(self):
        self.company, self.user, _ = make_company("RWS")
        self.product = ProductModel.objects.create(
            company=self.company,
            sku="RWS-001",
            name="Bulk Product",
        )
        self.warehouse = Location.objects.create(
            company=self.company,
            name="Warehouse",
            type="WAREHOUSE",
        )
        self.vendor, _ = Location.objects.get_or_create(
            company=self.company,
            name="External Vendor",
            defaults={"type": "VIRTUAL"},
        )
        self.supplier = Supplier.objects.create(company=self.company, name="Acme Srl")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = "/api/v1/movements/"

    def test_inbound_receipt_records_supplier(self):
        resp = self.client.post(
            self.url,
            {
                "sku": "RWS-001",
                "from": "External Vendor",
                "to": "Warehouse",
                "qty": "10",
                "supplier_id": str(self.supplier.id),
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        movement = Movement.objects.get(product_model=self.product)
        self.assertEqual(movement.supplier, self.supplier)

    def test_supplier_name_exposed_in_list(self):
        self.client.post(
            self.url,
            {
                "sku": "RWS-001",
                "from": "External Vendor",
                "to": "Warehouse",
                "qty": "5",
                "supplier_id": str(self.supplier.id),
            },
        )
        listing = self.client.get(self.url)
        rows = listing.data["results"] if isinstance(listing.data, dict) else listing.data
        self.assertEqual(rows[0]["supplier_name"], "Acme Srl")

    def test_supplier_from_other_company_rejected(self):
        company_b, _, _ = make_company("RWS-B")
        other = Supplier.objects.create(company=company_b, name="Other Co")
        resp = self.client.post(
            self.url,
            {
                "sku": "RWS-001",
                "from": "External Vendor",
                "to": "Warehouse",
                "qty": "1",
                "supplier_id": str(other.id),
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("supplier_id", str(resp.data))

    def test_receipt_without_supplier_still_works(self):
        resp = self.client.post(
            self.url,
            {
                "sku": "RWS-001",
                "from": "External Vendor",
                "to": "Warehouse",
                "qty": "3",
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIsNone(Movement.objects.get(product_model=self.product).supplier)


class ProductOnboardingSupplierTest(TestCase):
    """Initial balance on product creation can be attributed to a supplier."""

    def setUp(self):
        self.company, self.user, _ = make_company("POS")
        self.warehouse = Location.objects.create(
            company=self.company,
            name="Warehouse",
            type="WAREHOUSE",
        )
        self.supplier = Supplier.objects.create(company=self.company, name="Acme Srl")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = "/api/v1/product-models/"

    def test_initial_balance_with_supplier(self):
        resp = self.client.post(
            self.url,
            {
                "sku": "POS-001",
                "name": "Bulk",
                "profile": "SIMPLE_COUNT",
                "initial_balance": "20",
                "initial_location_id": str(self.warehouse.id),
                "initial_supplier_id": str(self.supplier.id),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        movement = Movement.objects.get(product_model__sku="POS-001")
        self.assertEqual(movement.supplier, self.supplier)
        self.assertEqual(movement.from_location.name, "External Vendor")
        self.assertEqual(movement.to_location, self.warehouse)

    def test_initial_balance_without_supplier_defaults_external_vendor(self):
        resp = self.client.post(
            self.url,
            {
                "sku": "POS-002",
                "name": "Bulk2",
                "profile": "SIMPLE_COUNT",
                "initial_balance": "5",
                "initial_location_id": str(self.warehouse.id),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        movement = Movement.objects.get(product_model__sku="POS-002")
        self.assertIsNone(movement.supplier)
        self.assertEqual(movement.from_location.name, "External Vendor")

    def test_initial_balance_not_booked_against_adjustment(self):
        """Even if an 'Inventory Adjustment' virtual location exists first, onboarding uses External Vendor."""
        Location.objects.create(company=self.company, name="Inventory Adjustment", type="VIRTUAL")
        resp = self.client.post(
            self.url,
            {
                "sku": "POS-003",
                "name": "Bulk3",
                "profile": "SIMPLE_COUNT",
                "initial_balance": "7",
                "initial_location_id": str(self.warehouse.id),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        movement = Movement.objects.get(product_model__sku="POS-003")
        self.assertEqual(movement.from_location.name, "External Vendor")
