from rest_framework import serializers
from ..models import Supplier


class SupplierSerializer(serializers.ModelSerializer):
    """Serializer for Supplier (fornitore) registry."""

    class Meta:
        model = Supplier
        fields = ['id', 'name', 'vat_number', 'email', 'phone', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_name(self, value):
        request = self.context.get('request')
        if not request or not getattr(request.user, 'company', None):
            return value
        qs = Supplier.objects.filter(company=request.user.company, name=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A supplier with this name already exists.")
        return value
