"""
Platform-wide (superuser-only) read API.

Unlike :mod:`core.tenant_views` — which scopes a *developer* to its own
children — this module exposes the **platform view**: every company on the
deployment, regardless of tier or hierarchy, with aggregated telemetry. It is
the data spine for the superadmin console and is gated on
:class:`core.permissions.IsSuperuser` (a Django ``is_superuser``); no tenant,
manager *or* developer, ever reaches it.
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, OuterRef, Subquery
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.filters import OrderingFilter, SearchFilter
from django_filters import rest_framework as df_filters
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes

from core.audit import record_audit
from core.models import AuditLog, Company
from core.permissions import IsSuperuser
from core.provisioning import provision_developer_company
from inventory.models.ledger import Movement


class PlatformCompanySerializer(serializers.ModelSerializer):
    """Read serializer for the platform company list.

    Exposes the model fields, the queryset annotations (per-company counts and
    last activity), the parent's display name, and — for developer companies —
    a lightweight summary of the manager tenants they own. Read-only: this is a
    reporting surface, never a write path.
    """

    parent_name = serializers.CharField(source="parent.name", read_only=True, allow_null=True)
    users_count = serializers.IntegerField(read_only=True)
    api_keys_count = serializers.IntegerField(read_only=True)
    children_count = serializers.IntegerField(read_only=True)
    last_activity = serializers.DateTimeField(read_only=True)
    children_summary = serializers.SerializerMethodField()

    class Meta:
        model = Company
        fields = [
            "id",
            "name",
            "account_type",
            "license_code",
            "vat",
            "is_active",
            "created_at",
            "parent",
            "parent_name",
            "users_count",
            "api_keys_count",
            "children_count",
            "last_activity",
            "children_summary",
        ]
        read_only_fields = fields

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_children_summary(self, obj):
        """List the manager tenants a developer owns; ``None`` otherwise.

        Returns ``None`` for managers (they own no children) so the field is
        unambiguously empty rather than ``[]`` for the common case.
        """
        if not obj.is_developer:
            return None
        return [
            {"id": str(child.id), "name": child.name, "is_active": child.is_active}
            for child in obj.children.all().order_by("name")
        ]


class PlatformCompanyDetailSerializer(PlatformCompanySerializer):
    """Read serializer for a single company's drill-down (SUPERADMIN-07).

    Extends the list row with the embedded collections the console's detail
    drawer renders: the company's users, its API keys (with the usage telemetry
    — ``usage_count`` / ``last_used_at`` / ``rate_limit_tier``), and the most
    recent platform audit entries that targeted it. Read-only, like its parent.
    """

    users = serializers.SerializerMethodField()
    api_keys = serializers.SerializerMethodField()
    recent_activity = serializers.SerializerMethodField()

    class Meta(PlatformCompanySerializer.Meta):
        fields = PlatformCompanySerializer.Meta.fields + [
            "users",
            "api_keys",
            "recent_activity",
        ]
        read_only_fields = fields

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_users(self, obj):
        return [
            {
                "id": str(user.id),
                "username": user.username,
                "email": user.email,
                "role": user.role,
                "is_active": user.is_active,
            }
            for user in obj.users.all().order_by("username")
        ]

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_api_keys(self, obj):
        return [
            {
                "id": str(key.id),
                "label": key.label,
                "is_active": key.is_active,
                "rate_limit_tier": key.rate_limit_tier,
                "usage_count": key.usage_count,
                "last_used_at": key.last_used_at,
                "created_at": key.created_at,
            }
            for key in obj.api_keys.all().order_by("-created_at")
        ]

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_recent_activity(self, obj):
        recent = obj.audit_logs.select_related("actor").order_by("-created_at")[:20]
        return [
            {
                "id": str(entry.id),
                "action": entry.action,
                "actor_username": entry.actor.username if entry.actor else None,
                "metadata": entry.metadata,
                "created_at": entry.created_at,
            }
            for entry in recent
        ]


class ProvisionDeveloperSerializer(serializers.Serializer):
    """Write serializer for provisioning a new developer company.

    Mirrors the helper signature in :func:`core.provisioning.
    provision_developer_company`. ``admin_password`` is required only when an
    ``admin_email`` is supplied (the helper seeds an admin user in that case).
    """

    name = serializers.CharField(max_length=255)
    vat = serializers.CharField(max_length=13, required=False, allow_null=True, allow_blank=True)
    admin_email = serializers.EmailField(required=False, allow_null=True, allow_blank=True)
    admin_password = serializers.CharField(required=False, allow_blank=True, write_only=True)

    def validate(self, attrs):
        if attrs.get("admin_email") and not attrs.get("admin_password"):
            raise serializers.ValidationError(
                {"admin_password": "A password is required when seeding an admin user."}
            )
        return attrs


class SetTierSerializer(serializers.Serializer):
    """Write serializer for promoting/demoting a company's tier."""

    account_type = serializers.ChoiceField(choices=Company.AccountType.choices)


class PlatformCompanyViewSet(viewsets.ReadOnlyModelViewSet):
    """List/retrieve every company on the platform, with aggregated telemetry.

    Superuser-only. The queryset is intentionally *unscoped* — this is the
    platform view, not a tenant view — and annotated with per-company counts and
    the timestamp of the company's most recent inventory movement.
    """

    permission_classes = [IsAuthenticated, IsSuperuser]
    serializer_class = PlatformCompanySerializer

    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["account_type", "is_active"]
    search_fields = ["name", "vat", "license_code"]
    ordering_fields = ["created_at", "name", "last_activity"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        # The drill-down (retrieve) embeds users/api_keys/recent_activity; the
        # list and write actions keep the lean row serializer.
        if self.action == "retrieve":
            return PlatformCompanyDetailSerializer
        return PlatformCompanySerializer

    def get_queryset(self):
        # A movement is tied to a company through its product_model; the most
        # recent occurred_at across that company's movements is its last activity.
        last_activity = (
            Movement.objects.filter(product_model__company=OuterRef("pk"))
            .order_by("-occurred_at")
            .values("occurred_at")[:1]
        )
        # The drill-down embeds the company's users/keys/audit trail, so prefetch
        # them for retrieve to keep the response a fixed handful of queries.
        prefetch = ["children"]
        if self.action == "retrieve":
            prefetch += ["users", "api_keys", "audit_logs__actor"]
        return (
            Company.objects.select_related("parent")
            .prefetch_related(*prefetch)
            .annotate(
                users_count=Count("users", distinct=True),
                api_keys_count=Count("api_keys", distinct=True),
                children_count=Count("children", distinct=True),
                last_activity=Subquery(last_activity),
            )
            .order_by("-created_at")
        )

    @action(detail=False, methods=["post"], url_path="provision-developer")
    def provision_developer(self, request):
        """Provision a new developer company and return its credentials.

        The only REST path to a developer-tier account; Django admin was
        previously the sole option. Returns the created company plus the
        one-time admin password echo (when seeded) and the plaintext default
        API key — both surfaced once here and never readable again.
        """
        serializer = ProvisionDeveloperSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        company, admin_user, _api_key, api_key_value = provision_developer_company(
            name=data["name"],
            vat=data.get("vat") or None,
            admin_email=data.get("admin_email") or None,
            admin_password=data.get("admin_password") or None,
        )

        body = self.get_serializer(self._annotated(company.pk)).data
        body["license_code"] = company.license_code
        body["api_key"] = api_key_value
        body["admin"] = (
            {"id": str(admin_user.id), "email": admin_user.email} if admin_user else None
        )
        record_audit(
            request.user,
            AuditLog.Action.COMPANY_PROVISIONED,
            target_company=company,
            name=company.name,
        )
        return Response(body, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="set-tier")
    def set_tier(self, request, pk=None):
        """Promote/demote a company between manager and developer tiers.

        Runs ``Company.full_clean()`` so the model invariants hold — notably,
        a developer that still owns children cannot be demoted to manager.
        """
        company = self.get_object()
        serializer = SetTierSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        old_tier = company.account_type
        new_tier = serializer.validated_data["account_type"]
        company.account_type = new_tier
        # When demoting to manager, a manager may not own children; severing
        # the parent link first would silently orphan tenants, so refuse loudly.
        try:
            company.full_clean()
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict)
        company.save()

        record_audit(
            request.user,
            AuditLog.Action.TIER_CHANGED,
            target_company=company,
            **{"from": old_tier, "to": new_tier},
        )
        return Response(self.get_serializer(self._annotated(company.pk)).data)

    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        """Suspend a company (blocks its users from login/API)."""
        company = self.get_object()
        response = self._set_active(company, False)
        record_audit(request.user, AuditLog.Action.COMPANY_SUSPENDED, target_company=company)
        return response

    @action(detail=True, methods=["post"])
    def reactivate(self, request, pk=None):
        """Lift a company's suspension."""
        company = self.get_object()
        response = self._set_active(company, True)
        record_audit(request.user, AuditLog.Action.COMPANY_REACTIVATED, target_company=company)
        return response

    def _set_active(self, company, is_active):
        company.is_active = is_active
        company.save(update_fields=["is_active"])
        return Response(self.get_serializer(self._annotated(company.pk)).data)

    def _annotated(self, pk):
        """Re-fetch a company through the annotated queryset.

        The write actions mutate plain ``Company`` rows, but the serializer
        expects the per-company count/last-activity annotations; round-tripping
        through ``get_queryset()`` restores them for the response.
        """
        return self.get_queryset().get(pk=pk)


class AuditLogSerializer(serializers.ModelSerializer):
    """Read serializer for a platform audit entry.

    Flattens the actor and target FKs to human-readable names so the console
    can render a row without a second lookup. Read-only: audit rows are written
    only through :func:`core.audit.record_audit`, never the API.
    """

    actor_username = serializers.CharField(source="actor.username", read_only=True, allow_null=True)
    target_company_name = serializers.CharField(
        source="target_company.name", read_only=True, allow_null=True
    )

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "action",
            "actor",
            "actor_username",
            "target_company",
            "target_company_name",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class AuditLogFilter(df_filters.FilterSet):
    """Exact-match filters plus a ``?since=`` lower bound on ``created_at``."""

    since = df_filters.IsoDateTimeFilter(field_name="created_at", lookup_expr="gte")

    class Meta:
        model = AuditLog
        fields = ["action", "target_company", "actor"]


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """List/retrieve the platform audit trail, newest-first.

    Superuser-only. Filterable by ``?action=``, ``?target_company=``,
    ``?actor=`` and a ``?since=`` ISO-8601 lower bound on ``created_at``.
    """

    permission_classes = [IsAuthenticated, IsSuperuser]
    serializer_class = AuditLogSerializer

    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_class = AuditLogFilter
    ordering_fields = ["created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return AuditLog.objects.select_related("actor", "target_company").order_by("-created_at")
