from rest_framework import serializers
from ..models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    """Serializer for Customer (cliente) registry."""

    class Meta:
        model = Customer
        fields = [
            'id', 'name', 'vat_number', 'email', 'phone', 'address',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_name(self, value):
        request = self.context.get('request')
        if not request or not getattr(request.user, 'company', None):
            return value
        qs = Customer.objects.filter(company=request.user.company, name=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A customer with this name already exists.")
        return value
