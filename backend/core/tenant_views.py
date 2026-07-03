"""
Developer/superuser tenant management.

A *developer* company provisions and lists the *manager* tenants it owns; a
superuser sees and provisions across all manager companies. Creation always
forces ``account_type='manager'`` — the only path to a *developer* company is a
superuser via Django admin / a dedicated superuser action, never this endpoint.

The read side is intentionally narrow: a developer sees only its own children
(``Company.objects.filter(parent=request.user.company)``), mirroring the
single-switch scoping in ``core.scope.resolve_effective_company``.
"""

from django.db import transaction
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from core.models import Company
from core.permissions import require_capability
from core.provisioning import provision_manager_company


class TenantSerializer(serializers.ModelSerializer):
    """Read serializer for managed tenant companies."""

    class Meta:
        model = Company
        fields = ["id", "name", "license_code", "account_type", "parent", "settings"]
        read_only_fields = fields


class TenantCreateSerializer(serializers.Serializer):
    """Write serializer for provisioning a new manager tenant.

    ``account_type`` is accepted only so an explicit ``'developer'`` value can
    be rejected loudly; everything else is forced to ``'manager'``. ``parent``
    is honored only for superusers (a developer's children are always parented
    to the developer itself).
    """

    name = serializers.CharField(max_length=255)
    settings = serializers.JSONField(required=False, default=dict)
    parent = serializers.UUIDField(required=False, allow_null=True)
    account_type = serializers.CharField(required=False)

    def validate_account_type(self, value):
        if value and value != Company.AccountType.MANAGER:
            raise ValidationError(
                "Cannot create a developer company here; this endpoint only "
                "provisions manager tenants."
            )
        return value


class TenantManagementViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """List, retrieve and create the manager tenants a developer/superuser owns."""

    # Gate on the same capability the identity payload exposes to the UI.
    permission_classes = [require_capability("manage_tenants")]
    serializer_class = TenantSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return Company.objects.filter(account_type=Company.AccountType.MANAGER).order_by("name")
        return Company.objects.filter(parent=user.company).order_by("name")

    @extend_schema(
        summary="Create a manager tenant",
        request=TenantCreateSerializer,
        responses={201: TenantSerializer},
        tags=["Tenant Management"],
    )
    def create(self, request, *args, **kwargs):
        serializer = TenantCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = request.user

        # Resolve the owning developer company.
        if user.is_superuser:
            parent = None
            parent_id = data.get("parent")
            if parent_id:
                try:
                    parent = Company.objects.get(pk=parent_id)
                except Company.DoesNotExist:
                    raise ValidationError({"parent": "Parent company not found."})
                if not parent.is_developer:
                    raise ValidationError({"parent": "Parent must be a developer company."})
        else:
            # A developer always parents new tenants to itself.
            parent = user.company
            if parent is None or not parent.is_developer:
                raise PermissionDenied("Only developer companies may provision tenants.")

        # License quota (GOVERNANCE-11): a developer may not exceed its
        # max_managed_companies cap. Superusers bypass; null cap = unlimited.
        from core.license_limits import check_managed_companies_limit

        check_managed_companies_limit(parent, user=user)

        with transaction.atomic():
            company, _api_key, _api_key_value = provision_manager_company(
                name=data["name"],
                parent=parent,
                settings=data.get("settings") or {},
            )

        return Response(TenantSerializer(company).data, status=status.HTTP_201_CREATED)
