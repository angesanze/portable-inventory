from django.db import models
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from core.models import ApiKey


# Map HTTP methods to required permissions
METHOD_PERMISSION_MAP = {
    'GET': 'read',
    'HEAD': 'read',
    'OPTIONS': 'read',
    'POST': 'write',
    'PUT': 'write',
    'PATCH': 'write',
    'DELETE': 'delete',
}


class ApiKeyAuthMixin:
    """Mixin for API key validation with granular permissions on public widget viewsets."""

    def _validate_api_key(self, request, required_permission=None):
        """
        Validate API key from query params, headers, or body.

        Args:
            request: The HTTP request
            required_permission: Explicit permission to check (overrides method-based mapping)

        Returns:
            ApiKey instance (or user-auth proxy)

        Raises:
            AuthenticationFailed: Missing/invalid/expired key
            PermissionDenied: Key lacks required permission
        """
        api_key_val = request.query_params.get('api_key')

        if not api_key_val:
            api_key_val = request.META.get('HTTP_X_API_KEY')

        if not api_key_val:
            api_key_val = request.META.get('HTTP_API_KEY')

        if not api_key_val:
            try:
                if isinstance(request.data, dict):
                    api_key_val = request.data.get('api_key')
            except Exception:
                pass

        if not api_key_val:
            # Fallback to authenticated user from Dashboard
            if hasattr(request, 'user') and request.user.is_authenticated:
                class ValidatedUserAuth:
                    def __init__(self, user):
                        self.company = getattr(user, 'company', None)
                        self.label = f"User: {user.username}"
                        self.permissions = ApiKey.DEFAULT_PERMISSIONS
                        self.rate_limit_tier = 'premium'

                    def has_permission(self, perm):
                        return True
                return ValidatedUserAuth(request.user)
            raise AuthenticationFailed("Missing api_key parameter.")

        if isinstance(api_key_val, str):
            api_key_val = api_key_val.strip()

        api_key = ApiKey.objects.filter(key=api_key_val, is_active=True).first()
        if not api_key:
            raise AuthenticationFailed("Invalid or inactive api_key.")

        # Check expiration
        if api_key.is_expired:
            raise AuthenticationFailed("API key has expired.")

        # Reject keys belonging to a suspended company
        if api_key.company and not api_key.company.is_active:
            raise AuthenticationFailed("This company is suspended.")

        # Enforce allowed_domains
        if api_key.allowed_domains:
            origin = request.META.get('HTTP_ORIGIN', '') or request.META.get('HTTP_REFERER', '')
            allowed = [d.strip().lower() for d in api_key.allowed_domains.split(',') if d.strip()]
            if allowed:
                from urllib.parse import urlparse
                parsed_host = urlparse(origin).hostname or ''
                if not any(
                    parsed_host == domain or parsed_host.endswith('.' + domain)
                    for domain in allowed
                ):
                    raise PermissionDenied("Request origin not in allowed domains for this API key.")

        # Check permission
        perm = required_permission or METHOD_PERMISSION_MAP.get(request.method, 'read')
        if not api_key.has_permission(perm):
            raise PermissionDenied(f"API key lacks '{perm}' permission.")

        # Track usage (non-blocking update)
        ApiKey.objects.filter(pk=api_key.pk).update(
            last_used_at=timezone.now(),
            usage_count=models.F('usage_count') + 1,
        )

        return api_key
