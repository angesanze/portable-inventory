import logging

from rest_framework.exceptions import PermissionDenied

from core.models import ApiKey
from core.scope import resolve_effective_company

logger = logging.getLogger('inventory.security')


class CompanyScopeMiddleware:
    """
    Middleware that attaches `request.company` for all authenticated requests.

    Sources (in priority order):
    1. API key header/param — uses api_key.company
    2. Authenticated user — uses user.company

    Also provides a helper `request.is_company_scoped` to indicate whether
    company context was successfully resolved.

    For authenticated-user requests (NOT API-key/public-widget requests) it
    additionally sets `request.acting_company`, the *effective* company a
    developer may be acting on via the `X-Acting-Company` header. See
    `core.scope.resolve_effective_company`. A `PermissionDenied` raised while
    resolving the acting company is NOT surfaced here (that would 500 the
    middleware); instead it is stored on `request.acting_company_error` and
    `request.acting_company` is left as the user's own company. The viewset
    layer re-resolves and surfaces the error as a proper 403.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.company = None
        request.is_company_scoped = False
        request.acting_company = None
        request.acting_company_error = None

        from_api_key = False

        # 1. Try API key (header or query param)
        api_key_val = (
            request.META.get('HTTP_X_API_KEY')
            or request.META.get('HTTP_API_KEY')
            or request.GET.get('api_key')
        )
        if api_key_val:
            try:
                api_key = ApiKey.objects.select_related('company').get(
                    key=api_key_val.strip(), is_active=True
                )
                request.company = api_key.company
                request.is_company_scoped = True
                from_api_key = True
            except ApiKey.DoesNotExist:
                pass

        # 2. Fall back to authenticated user
        if not request.company:
            user = getattr(request, 'user', None)
            if user and getattr(user, 'is_authenticated', False):
                company = getattr(user, 'company', None)
                if company:
                    request.company = company
                    request.is_company_scoped = True

        # 3. Effective (acting) company — only for authenticated-user requests.
        #    Public widget / API-key requests never act-as. A PermissionDenied
        #    here is stored, not raised, so the middleware never 500s; the
        #    viewset re-resolves and surfaces it as a 403.
        if not from_api_key:
            try:
                request.acting_company = resolve_effective_company(request)
            except PermissionDenied as exc:
                request.acting_company_error = exc
                request.acting_company = request.company

        response = self.get_response(request)
        return response
