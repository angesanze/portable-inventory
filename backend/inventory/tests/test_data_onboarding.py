"""DATA-ONBOARDING-09 — barcode + CSV/Excel import tests."""
import io
import json

import pytest
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from core.models import Company, User, ApiKey
from inventory.models import ProductModel, PhysicalProduct, ProductBatch, Location, Supplier
from inventory.services import importer, StockService
from inventory.services.onboarding import onboard_initial_stock
from inventory.validators import validate_gtin


# --------------------------------------------------------------------------
# validate_gtin — table-driven check-digit tests
# --------------------------------------------------------------------------
@pytest.mark.parametrize("code,expected", [
    # EAN-13 (valid real-world examples)
    ("4006381333931", True),
    ("5012345678900", True),
    ("0012345678905", True),   # 13-digit form of a UPC
    # EAN-8
    ("96385074", True),
    ("73513537", True),
    # UPC-A (12 digits)
    ("036000291452", True),
    ("012345678905", True),
    # GTIN-14
    ("00012345678905", True),
    # Wrong check digit
    ("4006381333932", False),
    ("96385075", False),
    ("036000291453", False),
    # Wrong length
    ("12345", False),
    ("123456789012345", False),
    # Non-numeric / empty
    ("ABCDEFGH", False),
    ("", False),
    ("400638133393X", False),
])
def test_validate_gtin_table(code, expected):
    assert validate_gtin(code) is expected


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _make_company(suffix="A"):
    company = Company.objects.create(name=f"Co{suffix}", license_code=f"LIC{suffix}")
    user = User.objects.create_user(
        username=f"user_{suffix}", password="pw", company=company, role="Admin",
    )
    api_key = ApiKey.objects.create(company=company, key=f"key-{suffix}-12345", label="K")
    for name, loc_type in [
        ("Main Warehouse", "WAREHOUSE"),
        ("External Vendor", "VIRTUAL"),
    ]:
        Location.objects.get_or_create(company=company, name=name, defaults={"type": loc_type})
    return company, user, api_key


def _csv_bytes(header, rows):
    out = io.StringIO()
    out.write(header + "\n")
    for r in rows:
        out.write(r + "\n")
    data = out.getvalue().encode("utf-8")
    f = io.BytesIO(data)
    f.name = "import.csv"
    return f


HEADER = ("sku,name,profile,barcode,engine_config,initial_stock,location,"
          "supplier,unit_cost,batch_identifier,expiry_date,serials")


# --------------------------------------------------------------------------
# parse — CSV and XLSX
# --------------------------------------------------------------------------
class ParseTest(TestCase):
    def test_parse_csv(self):
        f = _csv_bytes(HEADER, ["SKU1,Widget,SIMPLE_COUNT,,,5,Main Warehouse,,,,,"])
        rows = importer.parse(f)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["sku"], "SKU1")
        self.assertEqual(rows[0]["name"], "Widget")
        self.assertEqual(rows[0]["initial_stock"], "5")
        self.assertEqual(rows[0]["_row"], 1)

    def test_parse_csv_skips_blank_lines(self):
        f = _csv_bytes(HEADER, ["SKU1,Widget,SIMPLE_COUNT,,,,,,,,,", "", ",,,,,,,,,,,"])
        rows = importer.parse(f)
        self.assertEqual(len(rows), 1)

    def test_parse_missing_header_raises(self):
        f = io.BytesIO(b"foo,bar\n1,2\n")
        f.name = "x.csv"
        with self.assertRaises(importer.ImportError_):
            importer.parse(f)

    def test_parse_xlsx(self):
        openpyxl = pytest.importorskip("openpyxl")
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(HEADER.split(","))
        ws.append(["SKU-X", "Excel Widget", "SIMPLE_COUNT", "", "", "10",
                   "Main Warehouse", "", "", "", "", ""])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        buf.name = "import.xlsx"
        rows = importer.parse(buf)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["sku"], "SKU-X")
        self.assertEqual(rows[0]["initial_stock"], "10")


# --------------------------------------------------------------------------
# validate_rows + commit
# --------------------------------------------------------------------------
class ImportFlowTest(TestCase):
    def setUp(self):
        self.company, self.user, self.api_key = _make_company("A")
        self.warehouse = Location.objects.get(company=self.company, name="Main Warehouse")

    def test_validate_create_update_error(self):
        ProductModel.objects.create(
            company=self.company, sku="EXIST", name="Existing", profile="SIMPLE_COUNT",
        )
        f = _csv_bytes(HEADER, [
            "NEW1,New Product,SIMPLE_COUNT,,,,,,,,,",        # CREATE
            "EXIST,Renamed,SIMPLE_COUNT,,,,,,,,,",            # UPDATE
            ",NoSku,SIMPLE_COUNT,,,,,,,,,",                   # ERROR (no sku)
            "BAD,Bad Profile,NOPE,,,,,,,,,",                  # ERROR (profile)
        ])
        rows = importer.parse(f)
        results = importer.validate_rows(self.company, rows)
        by_row = {r["row"]: r for r in results}
        self.assertEqual(by_row[1]["action"], "CREATE")
        self.assertEqual(by_row[2]["action"], "UPDATE")
        self.assertEqual(by_row[3]["action"], "ERROR")
        self.assertEqual(by_row[4]["action"], "ERROR")

    def test_validate_rejects_initial_stock_on_update(self):
        ProductModel.objects.create(
            company=self.company, sku="UPD", name="U", profile="SIMPLE_COUNT",
        )
        f = _csv_bytes(HEADER, ["UPD,U,SIMPLE_COUNT,,,99,Main Warehouse,,,,,"])
        rows = importer.parse(f)
        results = importer.validate_rows(self.company, rows)
        self.assertEqual(results[0]["action"], "ERROR")
        self.assertTrue(any("initial_stock" in e for e in results[0]["errors"]))

    def test_validate_bad_barcode(self):
        f = _csv_bytes(HEADER, ["SKU1,W,SIMPLE_COUNT,4006381333932,,,,,,,,"])
        rows = importer.parse(f)
        results = importer.validate_rows(self.company, rows)
        self.assertEqual(results[0]["action"], "ERROR")
        self.assertTrue(any("barcode" in e.lower() for e in results[0]["errors"]))

    def test_validate_bad_engine_config_json(self):
        f = _csv_bytes(HEADER, ["SKU1,W,SIMPLE_COUNT,,{not json,,,,,,,"])
        rows = importer.parse(f)
        results = importer.validate_rows(self.company, rows)
        self.assertEqual(results[0]["action"], "ERROR")

    def test_dry_run_does_not_write(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        f = _csv_bytes(HEADER, ["DRY1,Dry,SIMPLE_COUNT,,,5,Main Warehouse,,,,,"])
        resp = client.post(
            "/api/v1/import/products/?dry_run=true",
            {"file": f}, format="multipart",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["dry_run"])
        self.assertEqual(resp.data["counts"]["create"], 1)
        self.assertFalse(ProductModel.objects.filter(sku="DRY1").exists())

    def test_commit_creates_product_and_stock(self):
        f = _csv_bytes(HEADER, [
            "BULK1,Bulk Product,SIMPLE_COUNT,4006381333931,,7,Main Warehouse,Acme,2.50,,,",
        ])
        rows = importer.parse(f)
        report = importer.commit(self.company, rows, self.user)
        self.assertEqual(report["created"], 1)
        self.assertEqual(report["errors"], 0)
        product = ProductModel.objects.get(company=self.company, sku="BULK1")
        self.assertEqual(product.barcode, "4006381333931")
        stock = StockService.get_stock_for_model(product)
        self.assertEqual(float(stock["total"]), 7.0)
        # Supplier auto-created and attributed.
        self.assertTrue(Supplier.objects.filter(company=self.company, name="Acme").exists())

    def test_commit_creates_batch_stock(self):
        f = _csv_bytes(HEADER, [
            "BAT1,Batch Product,BATCH_TRACKED,,,12,Main Warehouse,,,LOT-A,2030-01-01,",
        ])
        rows = importer.parse(f)
        report = importer.commit(self.company, rows, self.user)
        self.assertEqual(report["created"], 1)
        product = ProductModel.objects.get(company=self.company, sku="BAT1")
        batch = ProductBatch.objects.filter(product_model=product, batch_identifier="LOT-A").first()
        self.assertIsNotNone(batch)
        self.assertEqual(float(batch.quantity), 12.0)

    def test_commit_creates_serials(self):
        f = _csv_bytes(HEADER, [
            "SER1,Serial Product,SERIALIZED,,,,Main Warehouse,,,,,S1;S2;S3",
        ])
        rows = importer.parse(f)
        report = importer.commit(self.company, rows, self.user)
        self.assertEqual(report["created"], 1)
        product = ProductModel.objects.get(company=self.company, sku="SER1")
        idents = set(
            PhysicalProduct.objects.filter(product_model=product).values_list("identifier", flat=True)
        )
        self.assertEqual(idents, {"S1", "S2", "S3"})

    def test_broken_row_isolated(self):
        # Row 1 valid, row 2 has bad profile (validation error), row 3 valid.
        f = _csv_bytes(HEADER, [
            "OK1,Ok,SIMPLE_COUNT,,,,,,,,,",
            "BAD,Bad,NOTAPROFILE,,,,,,,,,",
            "OK2,Ok2,SIMPLE_COUNT,,,,,,,,,",
        ])
        rows = importer.parse(f)
        report = importer.commit(self.company, rows, self.user)
        self.assertEqual(report["created"], 2)
        self.assertEqual(report["errors"], 1)
        self.assertTrue(ProductModel.objects.filter(company=self.company, sku="OK1").exists())
        self.assertTrue(ProductModel.objects.filter(company=self.company, sku="OK2").exists())
        self.assertFalse(ProductModel.objects.filter(company=self.company, sku="BAD").exists())

    def test_idempotent_reimport(self):
        f = _csv_bytes(HEADER, ["IDEM1,Idem,SIMPLE_COUNT,,,3,Main Warehouse,,,,,"])
        rows = importer.parse(f)
        r1 = importer.commit(self.company, rows, self.user)
        self.assertEqual(r1["created"], 1)

        # Re-import the SAME file: initial_stock now rejected on UPDATE, so make
        # a clean update file without initial_stock to assert 0 create / N update.
        f2 = _csv_bytes(HEADER, ["IDEM1,Idem Renamed,SIMPLE_COUNT,,,,,,,,,"])
        rows2 = importer.parse(f2)
        r2 = importer.commit(self.company, rows2, self.user)
        self.assertEqual(r2["created"], 0)
        self.assertEqual(r2["updated"], 1)
        product = ProductModel.objects.get(company=self.company, sku="IDEM1")
        self.assertEqual(product.name, "Idem Renamed")
        # Stock unchanged (no double-booking).
        self.assertEqual(float(StockService.get_stock_for_model(product)["total"]), 3.0)

    def test_cross_company_isolation(self):
        company_b, user_b, _ = _make_company("B")
        ProductModel.objects.create(
            company=company_b, sku="SHARED", name="B's product", profile="SIMPLE_COUNT",
        )
        # Company A imports SKU 'SHARED' — should CREATE (not collide with B).
        f = _csv_bytes(HEADER, ["SHARED,A's product,SIMPLE_COUNT,,,,,,,,,"])
        rows = importer.parse(f)
        results = importer.validate_rows(self.company, rows)
        self.assertEqual(results[0]["action"], "CREATE")
        report = importer.commit(self.company, rows, self.user)
        self.assertEqual(report["created"], 1)
        self.assertEqual(ProductModel.objects.filter(sku="SHARED").count(), 2)


# --------------------------------------------------------------------------
# resolve_barcode endpoint
# --------------------------------------------------------------------------
class ResolveBarcodeTest(TestCase):
    def setUp(self):
        self.company, self.user, self.api_key = _make_company("A")
        self.client = APIClient()
        self.product = ProductModel.objects.create(
            company=self.company, sku="P-BC", name="Barcoded",
            profile="SIMPLE_COUNT", barcode="4006381333931",
        )

    def test_resolve_by_barcode(self):
        url = f"/api/v1/widget/resolve_barcode/?api_key={self.api_key.key}&code=4006381333931"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["id"], str(self.product.id))
        self.assertEqual(resp.data["sku"], "P-BC")

    def test_resolve_by_qr_fallback(self):
        from inventory.models import DynamicQRCode
        qr = DynamicQRCode.objects.create(
            company=self.company, code="QRCODE99", product_model=self.product,
            status="CONFIGURED",
        )
        url = f"/api/v1/widget/resolve_barcode/?api_key={self.api_key.key}&code={qr.code}"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["id"], str(self.product.id))

    def test_resolve_not_found(self):
        url = f"/api/v1/widget/resolve_barcode/?api_key={self.api_key.key}&code=0000000000000"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 404)

    def test_resolve_cross_company_barcode_isolated(self):
        company_b, _, api_key_b = _make_company("B")
        # B's key cannot resolve A's barcode.
        url = f"/api/v1/widget/resolve_barcode/?api_key={api_key_b.key}&code=4006381333931"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 404)


# --------------------------------------------------------------------------
# Barcode uniqueness constraint / validation
# --------------------------------------------------------------------------
class BarcodeFieldTest(TestCase):
    def setUp(self):
        self.company, self.user, _ = _make_company("A")

    def test_blank_barcode_allowed_multiple(self):
        ProductModel.objects.create(company=self.company, sku="A1", name="A", profile="SIMPLE_COUNT")
        ProductModel.objects.create(company=self.company, sku="A2", name="B", profile="SIMPLE_COUNT")
        # Two blank barcodes coexist (conditional unique constraint).
        self.assertEqual(ProductModel.objects.filter(company=self.company, barcode="").count(), 2)

    def test_duplicate_barcode_rejected(self):
        from django.db import IntegrityError, transaction
        ProductModel.objects.create(
            company=self.company, sku="A1", name="A", profile="SIMPLE_COUNT",
            barcode="4006381333931",
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                # Bypass full_clean's uniqueness check to hit the DB constraint.
                p = ProductModel(
                    company=self.company, sku="A2", name="B", profile="SIMPLE_COUNT",
                    barcode="4006381333931",
                )
                super(ProductModel, p).save()

    def test_invalid_barcode_rejected_on_clean(self):
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            ProductModel.objects.create(
                company=self.company, sku="A1", name="A", profile="SIMPLE_COUNT",
                barcode="1234567890123",  # bad check digit
            )
