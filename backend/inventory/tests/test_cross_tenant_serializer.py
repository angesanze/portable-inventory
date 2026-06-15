"""
Tests for cross-tenant location/parent bypass fixes in serializers.
Ensures PhysicalProductSerializer.location_id and LocationSerializer.parent_id
validate company ownership via DRF validated_data (not initial_data).
"""
from django.test import TestCase, RequestFactory
from rest_framework.exceptions import ValidationError
from inventory.models import ProductModel, Location, PhysicalProduct
from inventory.serializers.products import PhysicalProductSerializer
from inventory.serializers.locations import LocationSerializer
from inventory.tests.helpers import make_company as _make_company


def _fake_request(user):
    factory = RequestFactory()
    request = factory.get("/")
    request.user = user
    return request


class PhysicalProductSerializerCrossTenantTest(TestCase):
    """PhysicalProductSerializer must reject locations from other companies."""

    def setUp(self):
        self.company_a, self.user_a, _ = _make_company("A")
        self.company_b, self.user_b, _ = _make_company("B")

        self.model_a = ProductModel.objects.create(
            company=self.company_a, sku="MOD-A", name="Model A",
            profile="SERIALIZED",
        )
        self.loc_a = Location.objects.create(
            company=self.company_a, name="Warehouse A", type="WAREHOUSE",
        )
        self.loc_b = Location.objects.create(
            company=self.company_b, name="Warehouse B", type="WAREHOUSE",
        )

    def test_create_with_own_location_succeeds(self):
        request = _fake_request(self.user_a)
        data = {
            "identifier": "SN-001",
            "product_model": str(self.model_a.id),
            "location_id": str(self.loc_a.id),
        }
        serializer = PhysicalProductSerializer(data=data, context={"request": request})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        product = serializer.save()
        self.assertEqual(product.location_id, self.loc_a.id)

    def test_create_with_cross_tenant_location_rejected(self):
        request = _fake_request(self.user_a)
        data = {
            "identifier": "SN-002",
            "product_model": str(self.model_a.id),
            "location_id": str(self.loc_b.id),
        }
        serializer = PhysicalProductSerializer(data=data, context={"request": request})
        self.assertFalse(serializer.is_valid())
        self.assertIn("location_id", serializer.errors)

    def test_update_with_cross_tenant_location_rejected(self):
        product = PhysicalProduct.objects.create(
            product_model=self.model_a, identifier="SN-003", location=self.loc_a,
        )
        request = _fake_request(self.user_a)
        data = {"location_id": str(self.loc_b.id)}
        serializer = PhysicalProductSerializer(
            product, data=data, partial=True, context={"request": request},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("location_id", serializer.errors)

    def test_update_with_own_location_succeeds(self):
        loc_a2 = Location.objects.create(
            company=self.company_a, name="Store A", type="STORE",
        )
        product = PhysicalProduct.objects.create(
            product_model=self.model_a, identifier="SN-004", location=self.loc_a,
        )
        request = _fake_request(self.user_a)
        data = {"location_id": str(loc_a2.id)}
        serializer = PhysicalProductSerializer(
            product, data=data, partial=True, context={"request": request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        product = serializer.save()
        self.assertEqual(product.location_id, loc_a2.id)

    def test_update_clear_location_succeeds(self):
        product = PhysicalProduct.objects.create(
            product_model=self.model_a, identifier="SN-005", location=self.loc_a,
        )
        request = _fake_request(self.user_a)
        data = {"location_id": None}
        serializer = PhysicalProductSerializer(
            product, data=data, partial=True, context={"request": request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        product = serializer.save()
        self.assertIsNone(product.location)


class LocationSerializerCrossTenantTest(TestCase):
    """LocationSerializer must reject parent locations from other companies."""

    def setUp(self):
        self.company_a, self.user_a, _ = _make_company("A")
        self.company_b, self.user_b, _ = _make_company("B")

        self.loc_a = Location.objects.create(
            company=self.company_a, name="Parent A", type="WAREHOUSE",
        )
        self.loc_b = Location.objects.create(
            company=self.company_b, name="Parent B", type="WAREHOUSE",
        )

    def test_update_with_own_parent_succeeds(self):
        child = Location.objects.create(
            company=self.company_a, name="Child A", type="PHYSICAL",
        )
        request = _fake_request(self.user_a)
        data = {"parent_id": str(self.loc_a.id)}
        serializer = LocationSerializer(
            child, data=data, partial=True, context={"request": request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        loc = serializer.save()
        self.assertEqual(loc.parent_id, self.loc_a.id)

    def test_update_with_cross_tenant_parent_rejected(self):
        child = Location.objects.create(
            company=self.company_a, name="Child A2", type="PHYSICAL",
        )
        request = _fake_request(self.user_a)
        data = {"parent_id": str(self.loc_b.id)}
        serializer = LocationSerializer(
            child, data=data, partial=True, context={"request": request},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("parent_id", serializer.errors)

    def test_update_clear_parent_succeeds(self):
        child = Location.objects.create(
            company=self.company_a, name="Child A3", type="PHYSICAL",
            parent=self.loc_a,
        )
        request = _fake_request(self.user_a)
        data = {"parent_id": None}
        serializer = LocationSerializer(
            child, data=data, partial=True, context={"request": request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        loc = serializer.save()
        self.assertIsNone(loc.parent)
