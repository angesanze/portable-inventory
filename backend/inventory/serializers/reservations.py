from rest_framework import serializers

from ..models import Reservation, ProductModel, Location, ProductBatch, PhysicalProduct


class ReservationSerializer(serializers.ModelSerializer):
    product_id = serializers.UUIDField(write_only=True)
    location_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    batch_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    physical_product_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    product_sku = serializers.CharField(source="product_model.sku", read_only=True)
    product_name = serializers.CharField(source="product_model.name", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True, default=None)
    batch_identifier = serializers.CharField(
        source="batch.batch_identifier", read_only=True, default=None
    )
    physical_identifier = serializers.CharField(
        source="physical_product.identifier", read_only=True, default=None
    )

    class Meta:
        model = Reservation
        fields = [
            "id",
            "quantity",
            "status",
            "reference",
            "expires_at",
            "created_at",
            "updated_at",
            "product_id",
            "location_id",
            "batch_id",
            "physical_product_id",
            "product_sku",
            "product_name",
            "location_name",
            "batch_identifier",
            "physical_identifier",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at"]

    def validate(self, attrs):
        request = self.context.get("request")
        company = self.context.get("company")
        if company is None and request is not None:
            from core.scope import resolve_effective_company

            company = resolve_effective_company(request)
        if company is None:
            raise serializers.ValidationError("A company context is required.")

        product_id = attrs.pop("product_id", None)
        if product_id:
            try:
                attrs["_product_model"] = ProductModel.objects.get(id=product_id, company=company)
            except ProductModel.DoesNotExist:
                raise serializers.ValidationError({"product_id": "Product not found."})
        elif not self.instance:
            raise serializers.ValidationError({"product_id": "Required."})

        loc_id = attrs.pop("location_id", None)
        if loc_id:
            try:
                attrs["_location"] = Location.objects.get(id=loc_id, company=company)
            except Location.DoesNotExist:
                raise serializers.ValidationError({"location_id": "Location not found."})

        batch_id = attrs.pop("batch_id", None)
        if batch_id:
            try:
                attrs["_batch"] = ProductBatch.objects.get(
                    id=batch_id, product_model__company=company
                )
            except ProductBatch.DoesNotExist:
                raise serializers.ValidationError({"batch_id": "Batch not found."})

        pp_id = attrs.pop("physical_product_id", None)
        if pp_id:
            try:
                attrs["_physical_product"] = PhysicalProduct.objects.get(
                    id=pp_id, product_model__company=company
                )
            except PhysicalProduct.DoesNotExist:
                raise serializers.ValidationError(
                    {"physical_product_id": "Physical product not found."}
                )

        return attrs

    def create(self, validated_data):
        from ..services.reservations import ReservationService

        request = self.context["request"]
        return ReservationService.reserve(
            product_model=validated_data["_product_model"],
            quantity=validated_data["quantity"],
            user=request.user if request.user.is_authenticated else None,
            location=validated_data.get("_location"),
            batch=validated_data.get("_batch"),
            physical_product=validated_data.get("_physical_product"),
            reference=validated_data.get("reference", ""),
            expires_at=validated_data.get("expires_at"),
        )
