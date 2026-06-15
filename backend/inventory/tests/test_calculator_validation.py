import pytest
import uuid
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Company, User


@pytest.fixture
def auth_client(db):
    company = Company.objects.create(name="CalcValCo", license_code=f"CV{uuid.uuid4().hex[:4].upper()}")
    user = User.objects.create_user(username="calcadmin", password="password", company=company)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


VALIDATE_URL = "/api/v1/calculators/validate/"


@pytest.mark.django_db
class TestCalculatorValidationEndpoint:
    def test_missing_engine_type(self, auth_client):
        resp = auth_client.post(VALIDATE_URL, {"engine_config": {}}, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data["valid"] is False
        assert "engine_type is required" in resp.data["errors"]

    def test_unknown_engine_type(self, auth_client):
        resp = auth_client.post(
            VALIDATE_URL,
            {"engine_type": "unicorn", "engine_config": {}},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["valid"] is False
        assert any("Unknown engine type" in e for e in resp.data["errors"])

    def test_counter_valid(self, auth_client):
        resp = auth_client.post(
            VALIDATE_URL,
            {"engine_type": "counter", "engine_config": {"step": 5, "allow_negative": True}},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["valid"] is True
        assert resp.data["errors"] == []
        assert resp.data["preview"] is not None
        assert resp.data["preview"]["sample_output"] == "5"

    def test_counter_bad_type(self, auth_client):
        resp = auth_client.post(
            VALIDATE_URL,
            {"engine_type": "counter", "engine_config": {"step": "not_a_number"}},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["valid"] is False
        assert any("step" in e for e in resp.data["errors"])

    def test_converter_valid(self, auth_client):
        resp = auth_client.post(
            VALIDATE_URL,
            {"engine_type": "converter", "engine_config": {"stock_unit": "lbs", "precision": 2}},
            format="json",
        )
        assert resp.data["valid"] is True
        assert "lbs" in resp.data["preview"]["sample_output"]

    def test_bucket_valid(self, auth_client):
        resp = auth_client.post(
            VALIDATE_URL,
            {"engine_type": "bucket", "engine_config": {"allocation_strategy": "FIFO", "primary_key": "lot_id"}},
            format="json",
        )
        assert resp.data["valid"] is True
        assert resp.data["preview"] is not None

    def test_bucket_bad_strategy(self, auth_client):
        resp = auth_client.post(
            VALIDATE_URL,
            {"engine_type": "bucket", "engine_config": {"allocation_strategy": "RANDOM"}},
            format="json",
        )
        assert resp.data["valid"] is False
        assert any("allocation_strategy" in e for e in resp.data["errors"])

    def test_tracker_valid(self, auth_client):
        resp = auth_client.post(
            VALIDATE_URL,
            {
                "engine_type": "tracker",
                "engine_config": {
                    "status_transitions": {"ACTIVE": ["IN_USE", "DISPOSED"], "IN_USE": ["RETURNED"]},
                },
            },
            format="json",
        )
        assert resp.data["valid"] is True
        assert "ACTIVE" in resp.data["preview"]["sample_output"]

    def test_dimension_valid_formula(self, auth_client):
        resp = auth_client.post(
            VALIDATE_URL,
            {
                "engine_type": "dimension",
                "engine_config": {
                    "dimensions": ["length", "width"],
                    "unit": "m",
                    "formula": "length * width",
                    "computed_unit": "m\u00b2",
                },
            },
            format="json",
        )
        assert resp.data["valid"] is True
        # 10 * 10 = 100
        assert "100" in resp.data["preview"]["sample_output"]

    def test_dimension_bad_formula(self, auth_client):
        resp = auth_client.post(
            VALIDATE_URL,
            {
                "engine_type": "dimension",
                "engine_config": {
                    "dimensions": ["length", "width"],
                    "unit": "m",
                    "formula": "length * unknown_var",
                },
            },
            format="json",
        )
        assert resp.data["valid"] is False
        assert any("Formula error" in e for e in resp.data["errors"])

    def test_dimension_missing_required(self, auth_client):
        resp = auth_client.post(
            VALIDATE_URL,
            {"engine_type": "dimension", "engine_config": {"dimensions": ["x"]}},
            format="json",
        )
        assert resp.data["valid"] is False
        assert any("unit" in e or "formula" in e for e in resp.data["errors"])

    def test_dimension_injection_attempt(self, auth_client):
        resp = auth_client.post(
            VALIDATE_URL,
            {
                "engine_type": "dimension",
                "engine_config": {
                    "dimensions": ["x"],
                    "unit": "m",
                    "formula": "__import__('os').system('rm -rf /')",
                },
            },
            format="json",
        )
        assert resp.data["valid"] is False

    def test_time_based_valid(self, auth_client):
        resp = auth_client.post(
            VALIDATE_URL,
            {
                "engine_type": "time_based",
                "engine_config": {"time_unit": "days", "expiry_tracking": True},
            },
            format="json",
        )
        assert resp.data["valid"] is True
        assert "50 units" in resp.data["preview"]["sample_output"]

    def test_time_based_bad_unit(self, auth_client):
        resp = auth_client.post(
            VALIDATE_URL,
            {"engine_type": "time_based", "engine_config": {"time_unit": "weeks"}},
            format="json",
        )
        assert resp.data["valid"] is False
        assert any("time_unit" in e for e in resp.data["errors"])

    def test_empty_config_valid_for_counter(self, auth_client):
        resp = auth_client.post(
            VALIDATE_URL,
            {"engine_type": "counter", "engine_config": {}},
            format="json",
        )
        assert resp.data["valid"] is True

    def test_unauthenticated_rejected(self, db):
        client = APIClient()
        resp = client.post(
            VALIDATE_URL,
            {"engine_type": "counter", "engine_config": {}},
            format="json",
        )
        assert resp.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    def test_preview_has_sample_input_and_output(self, auth_client):
        resp = auth_client.post(
            VALIDATE_URL,
            {
                "engine_type": "dimension",
                "engine_config": {
                    "dimensions": ["l", "w", "h"],
                    "unit": "cm",
                    "formula": "l * w * h",
                    "computed_unit": "cm\u00b3",
                },
            },
            format="json",
        )
        assert resp.data["valid"] is True
        preview = resp.data["preview"]
        assert "sample_input" in preview
        assert "sample_output" in preview
        # 10 * 10 * 10 = 1000
        assert "1000" in preview["sample_output"]
        assert preview["sample_input"]["l"] == 10.0
