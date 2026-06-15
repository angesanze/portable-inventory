"""
Base ViewSet classes to eliminate repetitive patterns.

This module provides reusable base classes for common ViewSet patterns,
eliminating code duplication across inventory admin API ViewSets.
"""
import uuid

from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import PermissionDenied

from core.permissions import LicenseNotExpired, require_capability
from core.scope import resolve_effective_company


# Bulk-delete contract knobs. Same for every resource.
BULK_DELETE_MAX_IDS = 500


def parse_bulk_delete_ids(raw_ids):
    """Validate the `ids` payload for a bulk-delete endpoint.

    Returns a list of uuid.UUID. Raises BulkDeleteError on malformed input
    (missing, wrong type, too many entries, non-UUID strings).
    """
    from ..exceptions import BulkDeleteError

    if raw_ids is None:
        raise BulkDeleteError("`ids` is required.")
    if not isinstance(raw_ids, list):
        raise BulkDeleteError("`ids` must be a list.")
    if not raw_ids:
        raise BulkDeleteError("`ids` must contain at least one entry.")
    if len(raw_ids) > BULK_DELETE_MAX_IDS:
        raise BulkDeleteError(
            f"`ids` exceeds maximum of {BULK_DELETE_MAX_IDS} entries.",
        )
    parsed = []
    for raw in raw_ids:
        try:
            parsed.append(uuid.UUID(str(raw)))
        except (ValueError, AttributeError, TypeError):
            raise BulkDeleteError(f"Invalid UUID in `ids`: {raw!r}")
    return parsed


def bulk_delete_response(deleted, preserved_movements=0, http_status=status.HTTP_200_OK):
    """Standard response shape every bulk-delete endpoint emits."""
    from rest_framework.response import Response

    return Response(
        {"deleted": deleted, "preserved_movements": preserved_movements},
        status=http_status,
    )

# Sentinel marking "effective company not yet resolved on this request".
_UNRESOLVED = object()


class CompanyScopedMixin:
    """
    Shared company-scoping logic for read-write and read-only viewsets.

    Scopes querysets and (for the writable variant) created records to the
    *effective* company returned by :func:`core.scope.resolve_effective_company`,
    rather than ``user.company`` directly. This supports dual-tier (developer)
    scoping: a developer acting on a child tenant via the ``X-Acting-Company``
    header has its queries scoped to that child.

    Behavior matrix:

    * manager                                   -> own company only
    * developer + valid ``X-Acting-Company``    -> that child company only
    * developer without the header              -> own company
    * developer + header pointing at non-child  -> ``PermissionDenied`` (403)
    * superuser + header                        -> any company named by header
    * superuser without header                  -> all rows (no company filter)

    Attributes:
        company_field (str): Name of the company FK field. Override if different
                           from 'company' (e.g. 'product_model__company').
    """

    company_field = 'company'  # Override in subclass if needed

    def get_effective_company(self):
        """
        Resolve (and cache on the request) the effective company for scoping.

        Returns the ``Company`` to scope to, or ``None`` when there is no
        authenticated company context (e.g. a superuser without a company and
        without an acting-company header). Re-raises ``PermissionDenied`` when
        the acting-company header names a company the requester may not act as
        — this is how the 403 deferred by ``CompanyScopeMiddleware`` surfaces.
        """
        cached = getattr(self.request, '_effective_company', _UNRESOLVED)
        if cached is not _UNRESOLVED:
            return cached
        company = resolve_effective_company(self.request)
        self.request._effective_company = company
        return company

    def get_queryset(self):
        """
        Filter queryset to the request's effective company.

        Returns:
            QuerySet: Filtered by the effective company, all rows for a
            company-less superuser, or empty for an unauthenticated/
            company-less non-superuser.
        """
        user = self.request.user
        company = self.get_effective_company()

        if company is None:
            if getattr(user, 'is_authenticated', False) and user.is_superuser:
                return self.queryset
            return self.queryset.none()

        filter_kwargs = {self.company_field: company}
        return self.queryset.filter(**filter_kwargs)


# Actions that mutate inventory and therefore require write capability.
_WRITE_ACTIONS = frozenset({'create', 'update', 'partial_update'})
# Actions that destroy inventory and therefore require delete capability.
_DELETE_ACTIONS = frozenset({'destroy', 'bulk_delete'})


class RoleGatedWriteMixin:
    """Per-action role gating for company-scoped, writable viewsets (C2).

    Layers the intra-company role capabilities on top of whatever the viewset
    already declares in ``permission_classes`` (default: ``IsAuthenticated``):

    * write actions (create/update/partial_update) -> ``manage_own_inventory``
      (an OPERATOR keeps these; a VIEWER is read-only and loses them);
    * delete actions (destroy/bulk-delete) -> ``delete_inventory``
      (only OWNER/ADMIN; an OPERATOR or VIEWER is denied).

    Conservative by construction: ``manage_own_inventory`` and
    ``delete_inventory`` are BOTH true for the default (blank/legacy = ADMIN)
    role, so existing callers keep full access — only OPERATOR/VIEWER are
    constrained. Read actions inherit the base permissions unchanged.
    """

    def get_permissions(self):
        extra = None
        if self.action in _DELETE_ACTIONS:
            extra = require_capability('delete_inventory')
        elif self.action in _WRITE_ACTIONS:
            extra = require_capability('manage_own_inventory')
        base = super().get_permissions()
        if extra is None:
            return base
        # Write/delete actions also enforce license expiry at the DRF layer
        # (the middleware can't see the JWT-authenticated user).
        return base + [extra(), LicenseNotExpired()]


class CompanyScopedViewSet(RoleGatedWriteMixin, CompanyScopedMixin, viewsets.ModelViewSet):
    """
    Base ViewSet for company-scoped resources.

    Automatically filters queryset by the request's effective company
    and sets the company field on creation.

    This eliminates the repetitive pattern found in 8+ ViewSets:

        def get_queryset(self):
            if user.is_authenticated and user.company:
                return Model.objects.filter(company=user.company)
            return Model.objects.none()

        def perform_create(self, serializer):
            if user.is_authenticated and user.company:
                serializer.save(company=user.company)

    Usage:
        class ProductModelViewSet(CompanyScopedViewSet):
            queryset = ProductModel.objects.all()
            serializer_class = ProductModelSerializer
            # get_queryset and perform_create are automatic!
    """

    def perform_create(self, serializer):
        """
        Set the effective company field automatically on creation.

        A developer acting-as a child tenant writes records to that child.

        Args:
            serializer: The validated serializer

        Raises:
            PermissionDenied: If user not authenticated or has no company
                              context (and is not a superuser).
            ValidationError: If model validation fails during save.
        """
        user = self.request.user
        company = self.get_effective_company()

        if company is None and not (
            getattr(user, 'is_authenticated', False) and user.is_superuser
        ):
            raise PermissionDenied(
                "User must be authenticated and belong to a company."
            )

        from django.core.exceptions import ValidationError as DjangoValidationError
        from rest_framework.exceptions import ValidationError as DRFValidationError

        try:
            if company is not None:
                serializer.save(company=company)
            else:
                serializer.save()
        except DjangoValidationError as e:
            raise DRFValidationError(
                e.message_dict if hasattr(e, 'message_dict') else str(e)
            )


class ReadOnlyCompanyScopedViewSet(CompanyScopedMixin, viewsets.ReadOnlyModelViewSet):
    """
    Read-only variant of CompanyScopedViewSet.

    Use for resources that should not be created/updated/deleted via API
    but still need company scoping (e.g. EventLog).
    """
