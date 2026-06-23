"""Regression for C1: the widget throttle must resolve the credential from the
``X-Api-Key`` header too.

Before the fix ``_extract_credential`` read only ``?api_key=`` / the request
body, so any request that carried the key in the ``X-Api-Key`` header produced a
``None`` cache key — and DRF skips throttling entirely when ``get_cache_key``
returns ``None``. Header auth is the SEC-04 recommended path, so header-auth
widget traffic was completely UNthrottled. These tests pin that a header-auth
request now yields a non-None cache key (i.e. is actually rate-limited).
"""
import pytest
from django.core.cache import cache
from rest_framework.test import APIRequestFactory
from rest_framework.views import APIView

from inventory.api.public.throttling import WidgetAPIThrottle, WidgetAPIBurstThrottle
from inventory.tests.helpers import make_company


def _drf_request(django_request):
    """Wrap a bare Django request in a DRF Request (throttles receive these)."""
    view = APIView()
    return view.initialize_request(django_request)


@pytest.mark.django_db
def test_header_auth_request_is_throttled():
    """A widget request whose key is in the X-Api-Key header gets a non-None
    cache key — so it is actually rate-limited (not silently skipped)."""
    cache.clear()
    _, _, api_key = make_company("THROTTLE_HDR")

    factory = APIRequestFactory()
    request = _drf_request(
        factory.get("/api/v1/widget/x/", HTTP_X_API_KEY=api_key.key)
    )
    view = APIView()

    throttle = WidgetAPIThrottle()
    # allow_request resolves the key (header included) and pins _throttle_ident
    # to the ApiKey id; get_cache_key must then produce a real bucket key.
    allowed = throttle.allow_request(request, view)
    assert allowed is True
    key = throttle.get_cache_key(request, view)
    assert key is not None, "header-auth widget request must be throttled"
    assert str(api_key.id) in key


@pytest.mark.django_db
def test_header_auth_cache_key_without_resolution():
    """Even with no prior allow_request (so _throttle_ident is unset), the cache
    key falls back to the raw header credential — never None for a header
    request."""
    cache.clear()
    _, _, api_key = make_company("THROTTLE_HDR2")

    factory = APIRequestFactory()
    request = _drf_request(
        factory.get("/api/v1/widget/x/", HTTP_X_API_KEY=api_key.key)
    )

    throttle = WidgetAPIBurstThrottle()
    key = throttle.get_cache_key(request, APIView())
    assert key is not None


@pytest.mark.django_db
def test_no_credential_is_not_throttled():
    """Control: a request carrying no credential at all still returns None (DRF
    skips it) — the fix only adds the header source, it doesn't throttle
    anonymous-credential-less traffic on this bucket."""
    cache.clear()
    factory = APIRequestFactory()
    request = _drf_request(factory.get("/api/v1/widget/x/"))
    throttle = WidgetAPIThrottle()
    assert throttle.get_cache_key(request, APIView()) is None
