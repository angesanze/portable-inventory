from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import ApiKey


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    license_code = serializers.CharField(required=True, allow_blank=True)

    def validate(self, attrs):
        data = super().validate(attrs)

        license_code = attrs.get("license_code")
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
    company_name = serializers.CharField(source="company.name", read_only=True)

    class Meta:
        model = ApiKey
        fields = [
            "id",
            "key",
            "key_prefix",
            "label",
            "allowed_domains",
            "default_location",
            "is_active",
            "permissions",
            "rate_limit_tier",
            "expires_at",
            "last_used_at",
            "usage_count",
            "created_at",
            "company_name",
        ]
        # SEC-05: rate_limit_tier and is_active are platform-controlled. Leaving
        # them writable let a tenant self-upgrade its throttle tier or
        # re-enable a key the platform had disabled (mass-assignment). They are
        # managed via Django admin / platform endpoints, never self-service.
        read_only_fields = [
            "id",
            "key",
            "key_prefix",
            "created_at",
            "last_used_at",
            "usage_count",
            "rate_limit_tier",
            "is_active",
        ]

    def validate_default_location(self, value):
        """SEC-05: a key's default_location must belong to the caller's company,
        else a tenant could point its widget at another tenant's location (IDOR)."""
        if value is None:
            return value
        request = self.context.get("request")
        user = getattr(request, "user", None)
        company = getattr(user, "company", None)
        if company is None:
            raise serializers.ValidationError("Authentication required.")
        if value.company_id != company.id:
            raise serializers.ValidationError("Location not found.")
        return value

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
        representation["permissions"] = {**ApiKey.DEFAULT_PERMISSIONS, **perms}
        # SEC-03: the plaintext key is not stored. Reveal it once right after
        # creation (``_full_key``); otherwise hand back a signed, revocable
        # widget credential (used by the QR/embed/preview flows) — never a
        # stored secret. ``key_prefix`` remains for human-readable display.
        full = getattr(instance, "_full_key", None)
        representation["key"] = full if full else instance.make_widget_token()
        return representation

    def create(self, validated_data):
        user = self.context["request"].user
        if not user.company:
            raise serializers.ValidationError("User must have a company to create API keys.")

        instance = ApiKey.objects.create(
            company=user.company, key=ApiKey.generate_raw_key(), **validated_data
        )
        return instance
