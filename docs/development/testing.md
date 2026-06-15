# Testing Guide

We use **pytest** for the backend test suite. The suite is comprehensive, covering unit tests, integration tests, and security audits.

## Running Tests

### Via Docker (Recommended)
```bash
docker-compose exec backend pytest inventory/tests/
```

### Local Environment
Assuming you have a virtual environment active:
```bash
# 1. Install dependencies
pip install -r backend/requirements.txt

# 2. Run tests
pytest backend/inventory/tests/
```

## Test Categories

*   **Unit Tests**: `test_stock_methods.py`, `test_strategies.py`. Validate internal logic.
*   **Integration Tests**: `test_ledger.py`. Verify that movements correctly update stock calculations.
*   **Security Tests**: `test_security_audit.py`. Verify isolation between companies and API key masking.
*   **Flow Tests**: `test_bucket_flow.py`. Simulate real-world usage sequences (Receive Batch -> Consume Batch).

## Writing New Tests
All tests should inherit from `django.test.TestCase` or `rest_framework.test.APITestCase`.
Ensure you use `ProductModel` and `StockService` (not legacy logic).
