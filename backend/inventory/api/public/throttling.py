"""
Custom throttling classes for the public widget API.

Rate limiting per API key, with tier-based rates.
"""

from rest_framework.throttling import SimpleRateThrottle
from core.models import ApiKey

TIER_RATES = {
    "free": "1000/hour",
    "standard": "10000/hour",
    "premium": "100000/hour",
}

TIER_BURST_RATES = {
    "free": "100/minute",
    "standard": "1000/minute",
    "premium": "5000/minute",
}


def _extract_credential(request):
    """Resolve the widget credential from the SAME sources as
    ``ApiKeyAuthMixin._validate_api_key`` — header INCLUDED.

    The previous implementation read only ``?api_key=`` / body, so any request
    that carried the key in the ``X-Api-Key`` header sailed through completely
    unthrottled (``get_cache_key`` returned ``None`` → DRF skips throttling).
    SEC-04 made the header the recommended path, so this was the common case.
    """
    return (
        request.query_params.get("api_key")
        or request.META.get("HTTP_X_API_KEY")
        or request.META.get("HTTP_API_KEY")
        or (request.data.get("api_key") if isinstance(request.data, dict) else None)
    )


class _TierThrottle(SimpleRateThrottle):
    """Shared tier-aware widget throttle.

    Buckets per resolved ``ApiKey`` id so a raw key and its signed widget token
    (which resolve to the same key) share one limit; an invalid/absent-from-DB
    credential still buckets on the raw credential string.
    """

    tier_rates = TIER_RATES

    def get_cache_key(self, request, view):
        ident = getattr(self, "_throttle_ident", None) or _extract_credential(request)
        if not ident:
            return None
        return self.cache_format % {"scope": self.scope, "ident": ident}

    def get_rate(self):
        # Concrete rate is resolved per-request in allow_request; this is the
        # safe default used at init and for unresolved credentials.
        return self.tier_rates["free"]

    def allow_request(self, request, view):
        cred = _extract_credential(request)
        if cred:
            key_obj = ApiKey.find_active(cred)
            if key_obj:
                self._throttle_ident = str(key_obj.id)
                self.rate = self.tier_rates.get(key_obj.rate_limit_tier, self.tier_rates["free"])
                self.num_requests, self.duration = self.parse_rate(self.rate)
            else:
                # Unknown/invalid key — still throttle it (on the raw string) so
                # bad-credential floods are bounded too.
                self._throttle_ident = cred
        return super().allow_request(request, view)


class WidgetAPIThrottle(_TierThrottle):
    """Sustained rate limiting for the widget API, by API key tier."""

    scope = "widget_api"
    tier_rates = TIER_RATES


class WidgetAPIBurstThrottle(_TierThrottle):
    """Burst rate limiting for the widget API, by API key tier."""

    scope = "widget_api_burst"
    tier_rates = TIER_BURST_RATES
