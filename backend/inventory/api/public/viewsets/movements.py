from rest_framework import viewsets, permissions, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from decimal import Decimal
from drf_spectacular.utils import extend_schema, OpenApiResponse
from inventory.models import ProductModel, Location
from inventory.services import LedgerService
from inventory.exceptions import InventoryError
from ..auth import ApiKeyAuthMixin
from ..throttling import WidgetAPIThrottle, WidgetAPIBurstThrottle


class _MoveRequestSerializer(serializers.Serializer):
    api_key = serializers.CharField(required=False)
    product_id = serializers.UUIDField(help_text="Product model UUID")
    location_id = serializers.UUIDField(help_text="Target location UUID")
    direction = serializers.ChoiceField(choices=["Inbound", "Outbound"])
    quantity = serializers.DecimalField(max_digits=12, decimal_places=4)
    reason = serializers.CharField(required=False)
    counterparty = serializers.ChoiceField(
        choices=["ADJUSTMENT", "VENDOR"],
        required=False,
        help_text="Virtual counterparty the change is booked against. Defaults to ADJUSTMENT (manual rettifica). Use VENDOR for genuine supplier receipts.",
    )


class _TransferRequestSerializer(serializers.Serializer):
    api_key = serializers.CharField(required=False)
    product_id = serializers.UUIDField(help_text="Product model UUID")
    from_location_id = serializers.UUIDField(help_text="Source location UUID")
    to_location_id = serializers.UUIDField(help_text="Destination location UUID")
    quantity = serializers.DecimalField(max_digits=12, decimal_places=4)
    reason = serializers.CharField(required=False, default="Widget Transfer")


class MovementWidgetViewSet(ApiKeyAuthMixin, viewsets.ViewSet):
    """
    Viewset for handling stock movements in the widget.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [WidgetAPIThrottle, WidgetAPIBurstThrottle]

    @extend_schema(
        summary="Stock adjustment",
        description="Handle inbound/outbound stock adjustment. Delegates to InventoryOrchestrator.",
        tags=["Widget"],
        request=_MoveRequestSerializer,
        responses={
            200: OpenApiResponse(description="Movement result"),
            400: OpenApiResponse(description="Validation error"),
            409: OpenApiResponse(description="Insufficient stock"),
        },
    )
    @action(detail=False, methods=["post"])
    def move(self, request):
        """
        Handle stock adjustment (Inbound/Outbound).
        Delegates to InventoryOrchestrator.
        """
        api_key = self._validate_api_key(request)

        product_id = request.data.get("product_id")
        location_id = request.data.get("location_id")

        if not product_id or not location_id:
            raise ValidationError("Both product_id and location_id are required.")

        product_model = get_object_or_404(ProductModel, id=product_id, company=api_key.company)
        location = get_object_or_404(Location, id=location_id, company=api_key.company)

        from inventory.orchestrators import InventoryOrchestrator

        result = InventoryOrchestrator.handle_widget_movement(
            company=api_key.company,
            product_model=product_model,
            location=location,
            data=request.data,
        )

        return Response(result)

    @extend_schema(
        summary="Stock transfer",
        description="Transfer stock between two physical locations.",
        tags=["Widget"],
        request=_TransferRequestSerializer,
        responses={
            200: OpenApiResponse(description="Transfer success"),
            400: OpenApiResponse(description="Validation error"),
            409: OpenApiResponse(description="Insufficient stock"),
        },
    )
    @action(detail=False, methods=["post"])
    def transfer(self, request):
        """
        Handle stock transfer between two physical locations.
        """
        api_key = self._validate_api_key(request)

        product_id = request.data.get("product_id")
        from_id = request.data.get("from_location_id")
        to_id = request.data.get("to_location_id")
        quantity = Decimal(str(request.data.get("quantity", 0)))
        reason = request.data.get("reason", "Widget Transfer")

        product_model = get_object_or_404(ProductModel, id=product_id, company=api_key.company)
        from_loc = get_object_or_404(Location, id=from_id, company=api_key.company)
        to_loc = get_object_or_404(Location, id=to_id, company=api_key.company)

        try:
            LedgerService.transfer_stock(
                product_model=product_model,
                from_location=from_loc,
                to_location=to_loc,
                quantity=quantity,
                user=None,
                reason=reason,
            )
            return Response({"status": "success"})
        except InventoryError:
            raise
        except DjangoValidationError as e:
            raise InventoryError(detail=e.message_dict if hasattr(e, "message_dict") else str(e))
        except Exception as e:
            raise InventoryError(detail=str(e))
