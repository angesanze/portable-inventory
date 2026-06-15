from django.db import transaction
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from .audit import record_audit
from .models import ApiKey, AuditLog, Company, User
from .permissions import LicenseNotExpired, require_capability
from .scope import company_capabilities
from .serializers import ApiKeySerializer
from rest_framework.serializers import ModelSerializer
import rest_framework.serializers as serializers
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes

class UserSerializer(ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True)
    account_type = serializers.SerializerMethodField()
    capabilities = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    license = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'company', 'company_name',
            'account_type', 'is_superuser', 'capabilities', 'role', 'license',
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_account_type(self, obj):
        company = getattr(obj, 'company', None)
        return company.account_type if company else None

    @extend_schema_field(OpenApiTypes.STR)
    def get_role(self, obj):
        # Surface the NORMALIZED role so the UI sees a canonical enum value even
        # for legacy/blank rows (which resolve to ADMIN). Same value the backend
        # capability intersection uses.
        from .permissions import normalize_role
        return normalize_role(getattr(obj, 'role', None))

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_capabilities(self, obj):
        # Server-computed flags — the frontend gates UI off these but never
        # decides capabilities itself. Same source as the backend write gates.
        return company_capabilities(obj)

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_license(self, obj):
        """License envelope for the identity payload (GOVERNANCE-11).

        ``{expires_at, expired, limits: {...}, usage: {...}}``. Usage counts are
        cheap single-company aggregates computed once per identity fetch — never
        on every request. ``None`` for a company-less user (e.g. a bare
        superuser).
        """
        company = getattr(obj, 'company', None)
        if company is None:
            return None
        from inventory.models import ProductModel
        return {
            'expires_at': (
                company.license_expires_at.isoformat()
                if company.license_expires_at else None
            ),
            'expired': company.is_license_expired,
            'limits': {
                'max_users': company.max_users,
                'max_products': company.max_products,
                'max_managed_companies': company.max_managed_companies,
            },
            'usage': {
                'users': company.users.count(),
                'products': ProductModel.objects.filter(company=company).count(),
                'managed_companies': (
                    company.children.count() if company.is_developer else 0
                ),
            },
        }


class InviteUserSerializer(serializers.Serializer):
    """Write serializer for the developer/superuser ``invite`` action.

    A developer may only attach the new user to one of its OWN child tenants;
    the ownership check lives in the view (``UserViewSet.invite``). No
    privilege fields (``is_staff``/``is_superuser``) are accepted — invited
    users are always plain tenant members, so this endpoint can never mint a
    developer or superuser.
    """

    username = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True, default='')
    password = serializers.CharField(write_only=True, min_length=8)
    company = serializers.UUIDField()
    role = serializers.CharField(required=False, allow_blank=True, default='')

class ApiKeyViewSet(viewsets.ModelViewSet):
    """Key management surface — gated to tiers that may manage API keys.

    Managers never manage keys: their single ``Default Key`` is auto-created at
    provisioning and stays hidden (``manage_api_keys=false`` in
    :func:`core.scope.company_capabilities`). This gate is the server-side
    enforcement of that flag, so the UI hiding the screen is never the only
    protection. Developers/superusers keep full list/create/rotate/delete.
    """
    serializer_class = ApiKeySerializer
    permission_classes = [permissions.IsAuthenticated, require_capability('manage_api_keys')]

    def get_queryset(self):
        # Only show API keys belonging to the user's company
        user = self.request.user
        if user.company:
            return ApiKey.objects.filter(company=user.company).order_by('-created_at')
        return ApiKey.objects.none()

    def perform_create(self, serializer):
        # Validation is handled in Serializer.create() but we double check or pass context
        serializer.save()

    @action(
        detail=False,
        methods=['get'],
        url_path='default',
        permission_classes=[permissions.IsAuthenticated],
    )
    def default(self, request):
        """Read-only "my default key" — usable by ANY authenticated tier.

        The per-action ``permission_classes`` deliberately drops the
        viewset-level ``manage_api_keys`` gate so a manager (who cannot
        list/create/rotate/delete) can still obtain its single key for QR
        generation. Always scoped to ``request.user.company`` — never returns
        another company's key. Auto-creates the key if the company is keyless
        so a manager is never left without one.
        """
        import secrets
        company = request.user.company
        if not company:
            return Response(
                {'detail': 'No company associated.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        # Oldest key wins for legacy safety (multiple keys may exist for
        # developer companies); managers only ever have one.
        api_key = ApiKey.objects.filter(company=company).order_by('created_at').first()
        if api_key is None:
            api_key = ApiKey.objects.create(
                company=company,
                key=secrets.token_hex(32),
                label='Default Key',
            )
        return Response({
            'id': str(api_key.id),
            'key': api_key.key,
            'label': api_key.label,
            'default_location': str(api_key.default_location_id) if api_key.default_location_id else None,
        })

    @action(detail=True, methods=['post'])
    def rotate(self, request, pk=None):
        """Generate new key value while preserving all config. Old key invalidated."""
        import secrets
        api_key = self.get_object()
        api_key.key = secrets.token_hex(32)
        api_key.save(update_fields=['key'])
        return Response({
            'id': str(api_key.id),
            'key': api_key.key,
            'label': api_key.label,
        })

ALLOWED_SETTINGS_KEYS = {'timezone', 'currency', 'industry_type'}


class CompanySettingsView(APIView):
    """GET/PATCH company.settings for the authenticated user's company.

    Reads are open to any authenticated tenant member; writes (PATCH) require
    the ``manage_settings`` role capability (GOVERNANCE-11) — OWNER/ADMIN only,
    an OPERATOR/VIEWER is denied.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.request.method == 'PATCH':
            return [
                permissions.IsAuthenticated(),
                require_capability('manage_settings')(),
                LicenseNotExpired(),
            ]
        return [permissions.IsAuthenticated()]

    def get(self, request):
        company = request.user.company
        if not company:
            return Response({'detail': 'No company associated.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(company.settings)

    def patch(self, request):
        company = request.user.company
        if not company:
            return Response({'detail': 'No company associated.'}, status=status.HTTP_404_NOT_FOUND)
        unknown = set(request.data.keys()) - ALLOWED_SETTINGS_KEYS
        if unknown:
            return Response(
                {'detail': f'Unknown settings keys: {", ".join(sorted(unknown))}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        company.settings.update(request.data)
        company.save(update_fields=['settings'])
        return Response(company.settings)


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = User.objects.all()

    def get_queryset(self):
        return User.objects.filter(id=self.request.user.id)

    @action(detail=False, methods=['get'])
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    @action(
        detail=False,
        methods=['post'],
        permission_classes=[require_capability('create_users'), LicenseNotExpired],
    )
    def invite(self, request):
        """Create a user inside a managed tenant (developer/superuser only).

        Managers are denied by the ``create_users`` capability gate (403). A
        developer may
        only attach the new user to one of its OWN child companies — the target
        company's ``parent_id`` must equal the developer's own company id, else
        ``PermissionDenied``. A superuser may attach to any company. Privilege
        fields are never accepted, so this path can never create a developer or
        superuser.
        """
        serializer = InviteUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = request.user

        try:
            target_company = Company.objects.get(pk=data['company'])
        except Company.DoesNotExist:
            raise ValidationError({'company': 'Company not found.'})

        if not user.is_superuser:
            # A developer may only invite users into its own child tenants.
            if target_company.parent_id != user.company_id:
                raise PermissionDenied(
                    "You may only create users in your own child companies."
                )

        # License quota: reject the invite if the target company is at its
        # max_users cap. Superusers bypass. Null cap = unlimited.
        from .license_limits import check_user_limit
        check_user_limit(target_company, user=user)

        with transaction.atomic():
            new_user = User.objects.create_user(
                username=data['username'],
                email=data.get('email', ''),
                password=data['password'],
            )
            new_user.company = target_company
            new_user.role = data.get('role', '')
            new_user.save(update_fields=['company', 'role'])

        record_audit(
            user,
            AuditLog.Action.USER_INVITED,
            target_company=target_company,
            username=new_user.username,
        )
        return Response(
            UserSerializer(new_user).data, status=status.HTTP_201_CREATED
        )
