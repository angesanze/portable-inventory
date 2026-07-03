"""License-expiry enforcement (GOVERNANCE-11 / C1).

A company whose ``license_expires_at`` is in the past keeps full READ access —
the warehouse never disappears — but every WRITE (unsafe HTTP method) is
rejected with ``403`` and a stable ``{"code": "license_expired"}`` body so the
frontend can render a precise banner.

Design constraints honored here:

* Runs AFTER :class:`inventory.middleware.company_scope.CompanyScopeMiddleware`
  so ``request.company`` / ``request.acting_company`` are already resolved.
* Superusers bypass entirely (platform operators must always be able to act).
* Safe methods (GET/HEAD/OPTIONS/TRACE) are never blocked.
* Authentication and onboarding endpoints are never blocked (a user must be
  able to log in to *see* the expiry, and a brand-new company must be able to
  register).
* This is a pure expiry gate. Quota limits (max_users/max_products/…) are NOT
  enforced here — they are checked only at the relevant create points so we
  never count rows on every request.
"""

from django.http import JsonResponse

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "TRACE"})

# Path prefixes that must stay writable even with an expired license: auth
# (token obtain/refresh), self-service onboarding, and the schema. Matched as
# substrings against the request path.
_EXEMPT_PATH_MARKERS = (
    "/token",
    "/onboarding/",
    "/register",
    "/schema",
)


class LicenseEnforcementMiddleware:
    """Block writes for companies past their license expiry (read-only grace)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if self._should_block(request):
            return JsonResponse(
                {
                    "code": "license_expired",
                    "detail": "Your license has expired. The workspace is "
                    "read-only until it is renewed.",
                },
                status=403,
            )
        return self.get_response(request)

    def _should_block(self, request):
        method = request.method.upper()
        if method in SAFE_METHODS:
            return False

        path = request.path or ""
        if any(marker in path for marker in _EXEMPT_PATH_MARKERS):
            return False

        user = self._resolve_user(request)
        if not (user and getattr(user, "is_authenticated", False)):
            return False
        if getattr(user, "is_superuser", False):
            return False

        # The effective company the write would land on. Prefer the resolved
        # acting company (developer acting on a child); fall back to the
        # scoped company, then the user's own company.
        company = (
            getattr(request, "acting_company", None)
            or getattr(request, "company", None)
            or getattr(user, "company", None)
        )
        if company is None:
            return False
        return bool(getattr(company, "is_license_expired", False))

    @staticmethod
    def _resolve_user(request):
        """Return the request user, authenticating the JWT if needed.

        Django middleware runs BEFORE DRF authenticates the request, so
        ``request.user`` is ``AnonymousUser`` for token-authenticated API calls
        at this point. When a session user is already present (Django admin) we
        use it; otherwise we resolve the SimpleJWT bearer token ourselves so the
        license gate sees the real user. Any auth failure is swallowed — DRF
        will surface the proper 401 downstream.
        """
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            return user
        try:
            from rest_framework_simplejwt.authentication import JWTAuthentication

            result = JWTAuthentication().authenticate(request)
        except Exception:
            return None
        if result is None:
            return None
        return result[0]
