from rest_framework import serializers

from ..models import CountLine, CountSession


class CountLineSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source='product_model.sku', read_only=True)
    product_name = serializers.CharField(source='product_model.name', read_only=True)
    product_profile = serializers.CharField(source='product_model.profile', read_only=True)
    batch_identifier = serializers.CharField(source='batch.batch_identifier', read_only=True, default=None)
    identifier = serializers.CharField(source='physical_product.identifier', read_only=True, default=None)
    variance = serializers.DecimalField(max_digits=19, decimal_places=4, read_only=True)

    class Meta:
        model = CountLine
        fields = [
            'id', 'product_model', 'product_sku', 'product_name', 'product_profile',
            'batch', 'batch_identifier', 'physical_product', 'identifier',
            'expected_qty', 'counted_qty', 'variance', 'counted_at',
        ]
        read_only_fields = fields


class CountSessionSerializer(serializers.ModelSerializer):
    """Read view of a count session. Creation goes through the ``location_id``
    write field (StocktakeService.open_session snapshots the contents)."""
    location_id = serializers.UUIDField(write_only=True)
    location = serializers.PrimaryKeyRelatedField(read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)
    applied_by_username = serializers.CharField(source='applied_by.username', read_only=True, default=None)
    line_count = serializers.IntegerField(source='lines.count', read_only=True)

    class Meta:
        model = CountSession
        fields = [
            'id', 'location_id', 'location', 'location_name', 'status',
            'snapshot_at', 'notes', 'line_count',
            'created_by_username', 'created_at', 'updated_at',
            'applied_by_username', 'applied_at',
        ]
        read_only_fields = [
            'id', 'location', 'status', 'snapshot_at', 'line_count',
            'created_by_username', 'created_at', 'updated_at',
            'applied_by_username', 'applied_at',
        ]


class CountSessionDetailSerializer(CountSessionSerializer):
    lines = CountLineSerializer(many=True, read_only=True)

    class Meta(CountSessionSerializer.Meta):
        fields = CountSessionSerializer.Meta.fields + ['lines']
