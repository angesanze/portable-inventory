from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import ApiKey

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    license_code = serializers.CharField(required=True, allow_blank=True)

    def validate(self, attrs):
        data = super().validate(attrs)

        license_code = attrs.get('license_code')
        user = self.user

        if not user.company:
            raise serializers.ValidationError("User is not associated with any company/license.")

        if not user.company.is_active:
            raise serializers.ValidationError("This company is suspended.")

        if user.is_superuser and not user.company:
            return data

        if str(user.company.license_code) != str(license_code):
            raise serializers.ValidationError("Invalid credentials.")

        return data

class ApiKeySerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True)

    class Meta:
        model = ApiKey
        fields = [
            'id', 'key', 'label', 'allowed_domains', 'default_location',
            'is_active', 'permissions', 'rate_limit_tier', 'expires_at',
            'last_used_at', 'usage_count', 'created_at', 'company_name',
        ]
        read_only_fields = ['id', 'key', 'created_at', 'last_used_at', 'usage_count']

    def validate_permissions(self, value):
        valid_keys = set(ApiKey.DEFAULT_PERMISSIONS.keys())
        if not isinstance(value, dict):
            raise serializers.ValidationError("Permissions must be a JSON object.")
        unknown = set(value.keys()) - valid_keys
        if unknown:
            raise serializers.ValidationError(f"Unknown permission keys: {unknown}")
        for k, v in value.items():
            if not isinstance(v, bool):
                raise serializers.ValidationError(f"Permission '{k}' must be a boolean.")
        return value

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        # Ensure permissions always shows full set with defaults for missing keys
        perms = instance.permissions or {}
        representation['permissions'] = {**ApiKey.DEFAULT_PERMISSIONS, **perms}
        return representation

    def create(self, validated_data):
        user = self.context['request'].user
        if not user.company:
            raise serializers.ValidationError("User must have a company to create API keys.")

        import secrets
        key_value = secrets.token_hex(32)

        instance = ApiKey.objects.create(
            company=user.company,
            key=key_value,
            **validated_data
        )
        instance._full_key = key_value
        return instance
