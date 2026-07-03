import pytest
from core.models import Company, ApiKey


@pytest.mark.django_db
def test_apikey_creation():
    """Test that an ApiKey can be created for a Company."""
    company = Company.objects.create(name="Test ApiKey Corp", license_code="TSTAPY")
    key_obj = ApiKey.objects.create(
        company=company, key="test-key-" + "x" * 30, label="Default Key"
    )

    assert ApiKey.objects.filter(company=company).exists()
    assert key_obj.key is not None
    assert len(key_obj.key) > 20
    assert key_obj.label == "Default Key"
