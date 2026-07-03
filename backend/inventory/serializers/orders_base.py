"""Shared base for company-scoped order serializers.

Purchase / sales / transfer / return order serializers all resolve their
effective company the same way (context ``company`` injected by
``CompanyScopedViewSet.perform_create``, falling back to
``resolve_effective_company`` on the request). This mixin holds that single
copy so the four serializers can't drift.
"""


class CompanyScopedOrderSerializerMixin:
    """Provides ``_resolve_company`` for order serializers."""

    def _resolve_company(self):
        company = self.context.get("company")
        if company is None:
            request = self.context.get("request")
            if request is not None:
                from core.scope import resolve_effective_company

                company = resolve_effective_company(request)
        return company
