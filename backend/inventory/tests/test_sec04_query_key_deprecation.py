"""SEC-04: a raw API key in the ?api_key= query string is deprecated.

Raw keys leak via browser history / Referer / proxy logs. The dashboard and QR
flows already hand out revocable *signed widget tokens* (which contain ':') for
use in URLs; a raw key in the query is still accepted (backward compat with
legacy embeds) but must emit a deprecation warning so it can be migrated.
"""
import logging

import pytest
from rest_framework.test import APIClient

from inventory.tests.helpers import make_company_full

AUTH_LOGGER = "inventory.api.public.auth"
WARN_FRAGMENT = "Deprecated raw API key"


@pytest.mark.django_db
def test_raw_key_in_query_still_works_but_warns(caplog):
    """A raw key via ?api_key= authenticates (no break) AND logs a deprecation."""
    _, _, api_key = make_company_full("A")
    client = APIClient()
    with caplog.at_level(logging.WARNING, logger=AUTH_LOGGER):
        res = client.get(f"/api/v1/widget/locations/?api_key={api_key.key}")
    assert res.status_code == 200, res.content
    assert any(WARN_FRAGMENT in r.message for r in caplog.records), (
        "raw key in query must emit the SEC-04 deprecation warning"
    )


@pytest.mark.django_db
def test_widget_token_in_query_does_not_warn(caplog):
    """The safe credential — a signed widget token — must NOT trip the warning."""
    _, _, api_key = make_company_full("B")
    token = api_key.make_widget_token()
    assert ":" in token  # sanity: signed tokens carry ':'; raw keys don't
    client = APIClient()
    with caplog.at_level(logging.WARNING, logger=AUTH_LOGGER):
        res = client.get(f"/api/v1/widget/locations/?api_key={token}")
    assert res.status_code == 200, res.content
    assert not any(WARN_FRAGMENT in r.message for r in caplog.records)


@pytest.mark.django_db
def test_header_key_does_not_warn(caplog):
    """A raw key via the X-Api-Key header is the recommended path — no warning."""
    _, _, api_key = make_company_full("C")
    client = APIClient()
    with caplog.at_level(logging.WARNING, logger=AUTH_LOGGER):
        res = client.get("/api/v1/widget/locations/", HTTP_X_API_KEY=api_key.key)
    assert res.status_code == 200, res.content
    assert not any(WARN_FRAGMENT in r.message for r in caplog.records)
