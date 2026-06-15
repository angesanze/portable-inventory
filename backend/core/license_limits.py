"""Quota-limit checks for licensing (GOVERNANCE-11 / C1).

These are called ONLY at the relevant create points (invite a user, create a
product, onboard a child company) — never on every request. A null limit means
unlimited. Superusers bypass every quota.

Each helper raises :class:`LimitReached` (a DRF ``PermissionDenied`` subclass)
carrying a structured payload: ``{"code": "limit_reached", "limit_type": ...,
"limit": N}`` so the frontend can show an exact message.
"""
from rest_framework import status

from inventory.exceptions import InventoryError


class LicenseExpiredError(InventoryError):
    """Raised on a write when the acting company's license has expired.

    Renders as ``{"error": ..., "code": "license_expired"}`` with HTTP 403 via
    the project error handler — matching the middleware's JSON body so the
    frontend can branch on a single ``code`` regardless of which layer fired.
    """

    status_code = status.HTTP_403_FORBIDDEN
    default_code = 'license_expired'

    def __init__(self):
        super().__init__(
            detail='Your license has expired. The workspace is read-only '
                   'until it is renewed.',
            code='license_expired',
        )


class LimitReached(InventoryError):
    """Raised when a license quota would be exceeded by a create operation.

    Routes through the project's consistent error envelope
    (``inventory.middleware.error_handler``): the response is
    ``{"error": ..., "code": "limit_reached", "details": {"limit_type", "limit"}}``
    with HTTP 403.
    """

    status_code = status.HTTP_403_FORBIDDEN
    default_code = 'limit_reached'

    def __init__(self, limit_type, limit):
        super().__init__(
            detail=f"License limit reached for {limit_type} (max {limit}).",
            code='limit_reached',
            details={'limit_type': limit_type, 'limit': limit},
        )


def _bypass(user):
    return bool(user is not None and getattr(user, 'is_superuser', False))


def check_user_limit(company, user=None):
    """Reject when adding a user would exceed ``company.max_users``."""
    if company is None or _bypass(user):
        return
    limit = getattr(company, 'max_users', None)
    if limit is None:
        return
    current = company.users.count()
    if current >= limit:
        raise LimitReached('max_users', limit)


def check_product_limit(company, user=None):
    """Reject when adding a product would exceed ``company.max_products``."""
    if company is None or _bypass(user):
        return
    limit = getattr(company, 'max_products', None)
    if limit is None:
        return
    from inventory.models import ProductModel
    current = ProductModel.objects.filter(company=company).count()
    if current >= limit:
        raise LimitReached('max_products', limit)


def check_managed_companies_limit(parent, user=None):
    """Reject when adding a child would exceed ``parent.max_managed_companies``."""
    if parent is None or _bypass(user):
        return
    limit = getattr(parent, 'max_managed_companies', None)
    if limit is None:
        return
    current = parent.children.count()
    if current >= limit:
        raise LimitReached('max_managed_companies', limit)
