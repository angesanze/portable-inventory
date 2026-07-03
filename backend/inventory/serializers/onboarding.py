from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError

from core.models import Company
from core.validators import validate_partita_iva

User = get_user_model()

INDUSTRY_CHOICES = [
    ("manufacturing", "Manufacturing"),
    ("retail", "Retail"),
    ("food_beverage", "Food & Beverage"),
    ("electronics", "Electronics"),
    ("logistics", "Logistics"),
    ("healthcare", "Healthcare"),
    ("other", "Other"),
]


class CompanyRegistrationSerializer(serializers.Serializer):
    company_name = serializers.CharField(max_length=255, min_length=2)
    admin_email = serializers.EmailField()
    admin_password = serializers.CharField(min_length=8, write_only=True)
    industry_type = serializers.ChoiceField(choices=INDUSTRY_CHOICES, default="other")
    vat = serializers.CharField(required=True)

    def validate_admin_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value

    def validate_vat(self, value):
        try:
            normalized = validate_partita_iva(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages)
        if Company.objects.filter(vat=normalized).exists():
            raise serializers.ValidationError("A company with this VAT already exists.")
        return normalized
