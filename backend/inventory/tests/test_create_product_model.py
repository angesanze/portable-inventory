from django.test import TestCase
from core.models import Company, User
from inventory.models import (
    ProductModel,
    CalculatorTemplate,
    Location,
    ProductBatch,
    Movement,
    PhysicalProduct,
)
from inventory.services import ProductService
from rest_framework.test import APIClient
from rest_framework import status


class ProductModelCreateTest(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="ProductCo", license_code="PROD01")
        self.user = User.objects.create_user(
            username="prodadmin", password="password", company=self.company
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_create_serialized_product(self):
        payload = {
            "sku": "SERIAL-TEST-001",
            "name": "Test Serialized Item",
            "profile": "SERIALIZED",
            "attributes": {},
        }
        response = self.client.post("/api/v1/product-models/", payload, format="json")

        if response.status_code != 201:
            pass

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ProductModel.objects.count(), 1)

        obj = ProductModel.objects.first()
        self.assertEqual(obj.tracking_mode, "INDIVIDUAL")
        self.assertEqual(obj.engine_type, "tracker")

    def test_serialized_product_exposes_engine_ui_config(self):
        """Detail GET surfaces TrackerEngine.get_ui_config() under engine_ui_config.

        Phase 03 contract: engine returns user-configured `status_transitions`
        plus intrinsic `input_type`. `fields` only surfaces from
        `attributes.fields` — not from engine defaults.
        """
        product = ProductModel.objects.create(
            company=self.company,
            sku="TRACKER-UI-001",
            name="Tracker UI",
            profile="SERIALIZED",
            engine_config={
                "status_transitions": {
                    "ACTIVE": ["BROKEN"],
                    "BROKEN": ["REPAIRED"],
                    "REPAIRED": ["ACTIVE"],
                }
            },
        )
        response = self.client.get(f"/api/v1/product-models/{product.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ui = response.data.get("engine_ui_config")
        self.assertIsNotNone(ui)
        self.assertEqual(ui["input_type"], "tracker")
        self.assertEqual(ui["status_transitions"]["BROKEN"], ["REPAIRED"])
        self.assertNotIn("fields", ui)

    def test_create_product_with_preset(self):
        """POST /product-models/ with default_calculator persists FK and seeds engine_config."""
        tpl = CalculatorTemplate.objects.create(
            company=self.company,
            name="Tracker Preset",
            engine_type="tracker",
            engine_config={
                "status_transitions": {
                    "ACTIVE": ["BROKEN"],
                    "BROKEN": ["REPAIRED"],
                }
            },
        )
        payload = {
            "sku": "PRESET-CREATE-1",
            "name": "Preset At Create",
            "profile": "SERIALIZED",
            "default_calculator": str(tpl.id),
        }
        response = self.client.post("/api/v1/product-models/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(str(response.data["default_calculator"]), str(tpl.id))
        self.assertEqual(
            response.data["engine_config"],
            {"status_transitions": {"ACTIVE": ["BROKEN"], "BROKEN": ["REPAIRED"]}},
        )

    def test_create_product_with_preset_explicit_engine_config_wins(self):
        """Explicit engine_config in payload wins over preset's engine_config."""
        tpl = CalculatorTemplate.objects.create(
            company=self.company,
            name="Tracker Preset 2",
            engine_type="tracker",
            engine_config={"status_transitions": {"ACTIVE": ["BROKEN"]}},
        )
        explicit = {"status_transitions": {"ACTIVE": ["RETIRED"]}}
        payload = {
            "sku": "PRESET-CREATE-2",
            "name": "Override",
            "profile": "SERIALIZED",
            "default_calculator": str(tpl.id),
            "engine_config": explicit,
        }
        response = self.client.post("/api/v1/product-models/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["engine_config"], explicit)

    def test_create_duplicate_sku(self):
        ProductModel.objects.create(
            company=self.company, sku="EXISTING", name="Old", profile="SIMPLE_COUNT"
        )

        payload = {"sku": "EXISTING", "name": "Duplicate", "profile": "SIMPLE_COUNT"}
        response = self.client.post("/api/v1/product-models/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # Verify error message from unique_together constraint
        self.assertIn("already exists", str(response.data))

    def test_create_perishable_with_initial_batch(self):
        """PERISHABLE create accepts initial_batch and emits ProductBatch + Movement."""
        warehouse = Location.objects.create(
            company=self.company, name="Main Warehouse", type="WAREHOUSE"
        )
        payload = {
            "sku": "PERISH-INIT-1",
            "name": "Yogurt",
            "profile": "PERISHABLE",
            "initial_batch": {
                "batch_identifier": "L1",
                "expiry_date": "2026-12-31",
                "lot_number": "LOT-001",
                "initial_quantity": 10,
                "initial_location_id": str(warehouse.id),
            },
        }
        response = self.client.post("/api/v1/product-models/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        product = ProductModel.objects.get(id=response.data["id"])
        batches = ProductBatch.objects.filter(product_model=product)
        self.assertEqual(batches.count(), 1)
        batch = batches.first()
        self.assertEqual(batch.batch_identifier, "L1")
        self.assertEqual(float(batch.quantity), 10.0)
        self.assertEqual(batch.location_id, warehouse.id)
        self.assertEqual(batch.data.get("expiry_date"), "2026-12-31")
        self.assertEqual(batch.data.get("lot_number"), "LOT-001")

        movements = Movement.objects.filter(product_model=product, to_location=warehouse)
        self.assertEqual(movements.count(), 1)
        self.assertEqual(float(movements.first().quantity), 10.0)
        self.assertEqual(movements.first().reason, "Initial stock")

    def test_create_batch_tracked_with_initial_batch(self):
        """BATCH_TRACKED create accepts initial_batch (no expiry_date required)."""
        warehouse = Location.objects.create(
            company=self.company, name="Chem Warehouse", type="WAREHOUSE"
        )
        payload = {
            "sku": "BATCH-INIT-1",
            "name": "Chemical Reagent",
            "profile": "BATCH_TRACKED",
            "initial_batch": {
                "batch_identifier": "BATCH-A",
                "lot_number": "LOT-77",
                "initial_quantity": 25,
                "initial_location_id": str(warehouse.id),
            },
        }
        response = self.client.post("/api/v1/product-models/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        product = ProductModel.objects.get(id=response.data["id"])
        batches = ProductBatch.objects.filter(product_model=product)
        self.assertEqual(batches.count(), 1)
        batch = batches.first()
        self.assertEqual(batch.batch_identifier, "BATCH-A")
        self.assertEqual(float(batch.quantity), 25.0)
        self.assertEqual(batch.location_id, warehouse.id)
        self.assertEqual(batch.data.get("lot_number"), "LOT-77")
        self.assertNotIn("expiry_date", batch.data)

        movements = Movement.objects.filter(product_model=product, to_location=warehouse)
        self.assertEqual(movements.count(), 1)
        self.assertEqual(float(movements.first().quantity), 25.0)
        self.assertEqual(movements.first().reason, "Initial stock")

    def test_create_serialized_with_initial_serials(self):
        """SERIALIZED create accepts initial_serials and emits N PhysicalProducts + 1 Movement."""
        warehouse = Location.objects.create(
            company=self.company, name="Serial Warehouse", type="WAREHOUSE"
        )
        payload = {
            "sku": "SERIAL-INIT-1",
            "name": "Tagged Laptops",
            "profile": "SERIALIZED",
            "initial_serials": ["SN-001", "SN-002", "SN-003"],
            "initial_location_id": str(warehouse.id),
        }
        response = self.client.post("/api/v1/product-models/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        product = ProductModel.objects.get(id=response.data["id"])
        items = PhysicalProduct.objects.filter(product_model=product)
        self.assertEqual(items.count(), 3)
        self.assertEqual(
            sorted(items.values_list("identifier", flat=True)),
            ["SN-001", "SN-002", "SN-003"],
        )
        for it in items:
            self.assertEqual(it.status, "ACTIVE")
            self.assertEqual(it.location_id, warehouse.id)

        movements = Movement.objects.filter(product_model=product, to_location=warehouse)
        self.assertEqual(movements.count(), 1)
        self.assertEqual(float(movements.first().quantity), 3.0)
        self.assertEqual(movements.first().reason, "Initial serials")

    def test_create_serialized_rejects_duplicate_initial_serials(self):
        """Duplicate identifiers in initial_serials → 400 with clear detail."""
        warehouse = Location.objects.create(
            company=self.company, name="Dup Warehouse", type="WAREHOUSE"
        )
        payload = {
            "sku": "SERIAL-DUP-1",
            "name": "Dup Test",
            "profile": "SERIALIZED",
            "initial_serials": ["SN-A", "SN-B", "SN-A"],
            "initial_location_id": str(warehouse.id),
        }
        response = self.client.post("/api/v1/product-models/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("initial_serials", response.data)
        self.assertIn("SN-A", str(response.data["initial_serials"]))
        # Atomic: nothing should be persisted on failure.
        self.assertFalse(ProductModel.objects.filter(sku="SERIAL-DUP-1").exists())
        self.assertEqual(PhysicalProduct.objects.count(), 0)

    def test_create_dimensional_with_initial_measurement(self):
        """DIMENSIONAL create accepts initial_balance + initial_dimensions and emits Movement at computed qty."""
        warehouse = Location.objects.create(
            company=self.company, name="Cut Warehouse", type="WAREHOUSE"
        )
        payload = {
            "sku": "DIM-INIT-1",
            "name": "Fabric Roll",
            "profile": "DIMENSIONAL",
            "engine_config": {
                "dimensions": ["length", "width"],
                "unit": "m",
                "computed_unit": "m²",
                "formula": "length * width",
            },
            "initial_balance": 12,
            "initial_dimensions": {"length": 3, "width": 4},
            "initial_location_id": str(warehouse.id),
        }
        response = self.client.post("/api/v1/product-models/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        product = ProductModel.objects.get(id=response.data["id"])
        movements = Movement.objects.filter(product_model=product, to_location=warehouse)
        self.assertEqual(movements.count(), 1)
        self.assertEqual(float(movements.first().quantity), 12.0)
        self.assertEqual(movements.first().reason, "Initial Stock Onboarding")

    def test_create_dimensional_without_initial_measurement_still_works(self):
        """DIMENSIONAL without initial values creates product with no movement."""
        payload = {
            "sku": "DIM-EMPTY-1",
            "name": "Empty Roll",
            "profile": "DIMENSIONAL",
            "engine_config": {
                "dimensions": ["length", "width"],
                "unit": "m",
                "formula": "length * width",
            },
        }
        response = self.client.post("/api/v1/product-models/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        product = ProductModel.objects.get(id=response.data["id"])
        self.assertEqual(Movement.objects.filter(product_model=product).count(), 0)

    def test_create_perishable_without_initial_batch_still_works(self):
        """Initial batch is optional — a PERISHABLE product can be created with zero stock."""
        payload = {
            "sku": "PERISH-NO-INIT",
            "name": "Empty Perishable",
            "profile": "PERISHABLE",
        }
        response = self.client.post("/api/v1/product-models/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        product = ProductModel.objects.get(id=response.data["id"])
        self.assertEqual(ProductBatch.objects.filter(product_model=product).count(), 0)
        self.assertEqual(Movement.objects.filter(product_model=product).count(), 0)


class PolyInstanceCreateTest(TestCase):
    """Cloning a base ProductModel via the products-poly create endpoint.

    Covers the view → ProductService.clone_poly_instance path: a fresh POLY-
    SKU is generated and profile/default_calculator are copied from the base
    model onto a new company-scoped row.
    """

    def setUp(self):
        self.company = Company.objects.create(name="PolyCo", license_code="POLY01")
        self.user = User.objects.create_user(
            username="polyadmin", password="password", company=self.company
        )
        self.preset = CalculatorTemplate.objects.create(
            company=self.company,
            name="Poly Preset",
            engine_type="tracker",
            engine_config={"status_transitions": {"ACTIVE": ["BROKEN"]}},
        )
        self.base = ProductModel.objects.create(
            company=self.company,
            sku="BASE-001",
            name="Base Model",
            profile="SERIALIZED",
            default_calculator=self.preset,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_create_poly_instance_clones_base_model(self):
        payload = {"name": "Cloned Instance", "product_model": str(self.base.id)}
        response = self.client.post("/api/v1/products-poly/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        new_id = response.data["id"]
        self.assertNotEqual(new_id, str(self.base.id))

        new = ProductModel.objects.get(id=new_id)
        self.assertEqual(new.name, "Cloned Instance")
        self.assertEqual(new.company_id, self.company.id)
        self.assertEqual(new.profile, self.base.profile)
        self.assertEqual(new.default_calculator_id, self.preset.id)
        self.assertTrue(new.sku.startswith("POLY-"))

    def test_create_poly_instance_requires_name_and_base(self):
        response = self.client.post("/api/v1/products-poly/", {"name": "No Base"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_clone_poly_instance_service_generates_unique_skus(self):
        """ProductService.clone_poly_instance copies fields and yields unique POLY- SKUs."""
        a = ProductService.clone_poly_instance(self.base, name="A", company=self.company)
        b = ProductService.clone_poly_instance(self.base, name="B", company=self.company)
        self.assertEqual(a.profile, self.base.profile)
        self.assertEqual(a.default_calculator_id, self.preset.id)
        self.assertTrue(a.sku.startswith("POLY-"))
        self.assertTrue(b.sku.startswith("POLY-"))
        self.assertNotEqual(a.sku, b.sku)
