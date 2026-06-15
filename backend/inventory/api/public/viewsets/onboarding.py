from django.db import transaction
from rest_framework import status, serializers as drf_serializers
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema, OpenApiResponse

from core.models import User
from core.provisioning import provision_manager_company
from inventory.serializers.onboarding import CompanyRegistrationSerializer


class _RegistrationResponseSerializer(drf_serializers.Serializer):
    class _TokensSerializer(drf_serializers.Serializer):
        access = drf_serializers.CharField()
        refresh = drf_serializers.CharField()

    class _CompanySerializer(drf_serializers.Serializer):
        id = drf_serializers.UUIDField()
        name = drf_serializers.CharField()
        license_code = drf_serializers.CharField()
        vat = drf_serializers.CharField()
        industry_type = drf_serializers.CharField()

    class _UserSerializer(drf_serializers.Serializer):
        id = drf_serializers.UUIDField()
        email = drf_serializers.EmailField()
        username = drf_serializers.CharField()
        role = drf_serializers.CharField()

    class _ApiKeySerializer(drf_serializers.Serializer):
        id = drf_serializers.UUIDField()
        key = drf_serializers.CharField()
        label = drf_serializers.CharField()

    tokens = _TokensSerializer()
    company = _CompanySerializer()
    user = _UserSerializer()
    api_key = _ApiKeySerializer()


class OnboardingViewSet(GenericViewSet):
    """Self-service company registration endpoint."""
    permission_classes = [AllowAny]
    throttle_scope = 'login'

    @extend_schema(
        summary="Register new company",
        description="Self-service company registration. Creates company, admin user, default API key, and seeds default strategies and locations. Returns JWT tokens for immediate authentication.",
        tags=["Onboarding"],
        request=CompanyRegistrationSerializer,
        responses={201: _RegistrationResponseSerializer, 400: OpenApiResponse(description="Validation error (duplicate email, weak password, etc.)"), 429: OpenApiResponse(description="Rate limit exceeded")},
    )
    @action(detail=False, methods=['post'], url_path='register')
    def register(self, request):
        serializer = CompanyRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            # Self-service registration always creates a leaf manager company,
            # seeded with a default API key + locations (shared with tenant mgmt).
            company, api_key, api_key_value = provision_manager_company(
                name=data['company_name'],
                settings={'industry_type': data['industry_type']},
            )
            company.vat = data['vat']
            company.save(update_fields=['vat'])

            # Create admin user (email as username for self-service)
            user = User.objects.create_user(
                username=data['admin_email'],
                email=data['admin_email'],
                password=data['admin_password'],
                is_staff=True,
            )
            user.company = company
            # First user of a self-service company is its OWNER (GOVERNANCE-11):
            # full intra-company powers including in-app user/license management.
            user.role = User.Role.OWNER
            user.save()

        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)

        return Response({
            'tokens': {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            },
            'company': {
                'id': str(company.id),
                'name': company.name,
                'license_code': company.license_code,
                'vat': company.vat,
                'industry_type': data['industry_type'],
            },
            'user': {
                'id': str(user.id),
                'email': user.email,
                'username': user.username,
                'role': user.role,
            },
            'api_key': {
                'id': str(api_key.id),
                'key': api_key_value,
                'label': api_key.label,
            },
        }, status=status.HTTP_201_CREATED)
