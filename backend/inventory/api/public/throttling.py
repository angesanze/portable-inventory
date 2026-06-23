"""
Custom throttling classes for public widget API.

Provides rate limiting per API key, with tier-based rates.
"""
from rest_framework.throttling import SimpleRateThrottle
from core.models import ApiKey

TIER_RATES = {
    'free': '1000/hour',
    'standard': '10000/hour',
    'premium': '100000/hour',
}

TIER_BURST_RATES = {
    'free': '100/minute',
    'standard': '1000/minute',
    'premium': '5000/minute',
}


class WidgetAPIThrottle(SimpleRateThrottle):
    """Rate limiting for widget API based on API key and its tier."""
    scope = 'widget_api'

    def get_cache_key(self, request, view):
        api_key = request.query_params.get('api_key') or (
            request.data.get('api_key') if isinstance(request.data, dict) else None
        )
        if not api_key:
            return None
        return f'throttle_widget_{api_key}'

    def get_rate(self):
        # Rate resolved dynamically per-request in allow_request
        return TIER_RATES.get('free')

    def allow_request(self, request, view):
        api_key_val = request.query_params.get('api_key') or (
            request.data.get('api_key') if isinstance(request.data, dict) else None
        )
        if api_key_val:
            key_obj = ApiKey.find_active(api_key_val)
            if key_obj:
                self.rate = TIER_RATES.get(key_obj.rate_limit_tier, TIER_RATES['free'])
                self.num_requests, self.duration = self.parse_rate(self.rate)
        return super().allow_request(request, view)


class WidgetAPIBurstThrottle(SimpleRateThrottle):
    """Burst rate limiting for widget API, tier-aware."""
    scope = 'widget_api_burst'

    def get_cache_key(self, request, view):
        api_key = request.query_params.get('api_key') or (
            request.data.get('api_key') if isinstance(request.data, dict) else None
        )
        if not api_key:
            return None
        return f'throttle_widget_burst_{api_key}'

    def get_rate(self):
        return TIER_BURST_RATES.get('free')

    def allow_request(self, request, view):
        api_key_val = request.query_params.get('api_key') or (
            request.data.get('api_key') if isinstance(request.data, dict) else None
        )
        if api_key_val:
            key_obj = ApiKey.find_active(api_key_val)
            if key_obj:
                self.rate = TIER_BURST_RATES.get(key_obj.rate_limit_tier, TIER_BURST_RATES['free'])
                self.num_requests, self.duration = self.parse_rate(self.rate)
        return super().allow_request(request, view)
