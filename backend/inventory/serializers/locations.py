from rest_framework import serializers
from ..models import Location

class LocationSerializer(serializers.ModelSerializer):
    """Serializer for Location model."""
    parent = serializers.UUIDField(read_only=True)
    parent_id = serializers.UUIDField(required=False, write_only=True, allow_null=True)

    class Meta:
        model = Location
        fields = ['id', 'name', 'type', 'is_sellable', 'parent', 'parent_id']
        read_only_fields = ['is_sellable']

    def validate_parent_id(self, value):
        if value is None:
            return value
        request = self.context.get('request')
        if not request or not request.user or not request.user.company:
            raise serializers.ValidationError("Authentication required.")
        if not Location.objects.filter(id=value, company=request.user.company).exists():
            raise serializers.ValidationError("Parent location not found.")
        return value

    def validate_name(self, value):
        user = self.context['request'].user
        if not user or not user.company:
            return value # Should be handled by permissions

        qs = Location.objects.filter(company=user.company, name=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if qs.exists():
             raise serializers.ValidationError("A location with this name already exists.")
        return value

    def update(self, instance, validated_data):
        parent_id = validated_data.pop('parent_id', ...)
        if parent_id is not ...:
            if parent_id is None:
                instance.parent = None
            else:
                instance.parent_id = parent_id
        return super().update(instance, validated_data)
