from rest_framework import viewsets, permissions, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse
from inventory.models import DynamicQRCode, ProductModel, PhysicalProduct, Location
from inventory.exceptions import QRCodeStateError
from ..auth import ApiKeyAuthMixin
from ..throttling import WidgetAPIThrottle, WidgetAPIBurstThrottle


class _QRInfoResponseSerializer(serializers.Serializer):
    code = serializers.CharField()
    status = serializers.ChoiceField(choices=["VIRGIN", "CONFIGURED", "LOCKED"])
    target = serializers.CharField(allow_null=True)
    target_type = serializers.ChoiceField(choices=["PRODUCT", "ITEM", "WORK_ORDER"], allow_null=True)
    target_id = serializers.UUIDField(allow_null=True)
    location_id = serializers.UUIDField(allow_null=True)


class _ConfigureQRRequestSerializer(serializers.Serializer):
    api_key = serializers.CharField(required=False)
    code = serializers.CharField(help_text="QR code string (also accepted as 'qr_code')")
    target_type = serializers.ChoiceField(choices=["PRODUCT", "ITEM", "WORK_ORDER"], required=False, help_text="Target type for Authority Dashboard flow")
    target_id = serializers.UUIDField(required=False, help_text="Target UUID")
    location_id = serializers.UUIDField(required=False, help_text="Location UUID")
    product_model_id = serializers.UUIDField(required=False, help_text="Legacy Widget: product model UUID")
    physical_identifier = serializers.CharField(required=False, help_text="Legacy Widget: physical item identifier")


class _QRStatusResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    new_status = serializers.CharField()


class QRCodeWidgetViewSet(ApiKeyAuthMixin, viewsets.ViewSet):
    """
    Viewset for managing Dynamic QR Codes in the widget.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [WidgetAPIThrottle, WidgetAPIBurstThrottle]

    @extend_schema(
        summary="Get QR code info",
        description="Get information about a specific QR code including its status, target type, and target ID.",
        tags=["QR Codes"],
        parameters=[
            OpenApiParameter(name="api_key", type=str, location="query", description="API key for authentication"),
            OpenApiParameter(name="code", type=str, location="query", required=True, description="QR code string"),
        ],
        responses={200: _QRInfoResponseSerializer, 404: OpenApiResponse(description="QR code not found")},
    )
    @action(detail=False, methods=['get'])
    def qr_info(self, request):
        """Get information about a specific QR code."""
        api_key = self._validate_api_key(request)
        code = request.query_params.get('code')
        
        qr = get_object_or_404(DynamicQRCode, code=code, company=api_key.company)
        
        return Response({
            "code": qr.code,
            "status": qr.status,
            "target": qr.get_target_display(),
            "target_type": "PRODUCT" if qr.product_model else "ITEM" if qr.physical_product else "WORK_ORDER" if qr.work_order else None,
            "target_id": str(qr.product_model.id) if qr.product_model else str(qr.physical_product.id) if qr.physical_product else str(qr.work_order.id) if qr.work_order else None,
            "location_id": str(qr.location.id) if qr.location else None
        })

    @extend_schema(
        summary="Configure QR code",
        description="Configure a VIRGIN QR code by assigning it to a product, item, or work order. Transitions status from VIRGIN to CONFIGURED.",
        tags=["QR Codes"],
        request=_ConfigureQRRequestSerializer,
        responses={200: _QRStatusResponseSerializer, 404: OpenApiResponse(description="QR code or target not found"), 409: OpenApiResponse(description="QR code not in VIRGIN state")},
    )
    @action(detail=False, methods=['post'])
    def configure_qr(self, request):
        """Configure a virgin QR code."""
        api_key = self._validate_api_key(request)
        code = request.data.get('code') or request.data.get('qr_code')
        target_type = request.data.get('target_type') # 'PRODUCT' or 'ITEM'
        target_id = request.data.get('target_id')
        location_id = request.data.get('location_id')
        
        product_model_id = request.data.get('product_model_id')
        physical_identifier = request.data.get('physical_identifier')
        
        qr = get_object_or_404(DynamicQRCode, code=code, company=api_key.company)
        
        if qr.status != 'VIRGIN':
            raise QRCodeStateError(
                detail="QR Code is already configured.",
                current_state=qr.status,
                allowed_transitions=['VIRGIN'],
            )

        # Support target_type architecture (Authority Dashboard)
        if target_type == 'PRODUCT':
            qr.product_model = get_object_or_404(ProductModel, id=target_id, company=api_key.company)
            qr.physical_product = None
            qr.work_order = None
        elif target_type == 'ITEM':
            qr.physical_product = get_object_or_404(PhysicalProduct, id=target_id, product_model__company=api_key.company)
            qr.product_model = None
            qr.work_order = None
        elif target_type == 'WORK_ORDER':
            from inventory.models import WorkOrder
            qr.work_order = get_object_or_404(WorkOrder, id=target_id, company=api_key.company)
            qr.product_model = None
            qr.physical_product = None
        # Support legacy Widget parameters (Widget UI)
        elif product_model_id:
            pm = get_object_or_404(ProductModel, id=product_model_id, company=api_key.company)
            if physical_identifier:
                pp, _ = PhysicalProduct.objects.get_or_create(
                    identifier=physical_identifier, 
                    product_model=pm,
                    defaults={'status': 'ACTIVE', 'location': get_object_or_404(Location, id=location_id, company=api_key.company) if location_id else None}
                )
                qr.physical_product = pp
                qr.product_model = None
                qr.work_order = None
            else:
                qr.product_model = pm
                qr.physical_product = None
                qr.work_order = None
            
        if location_id:
            qr.location = get_object_or_404(Location, id=location_id, company=api_key.company)
            
        qr.status = 'CONFIGURED'
        qr.save()
        
        return Response({"status": "success", "new_status": qr.status})

    @extend_schema(
        summary="Lock QR code",
        description="Lock a CONFIGURED QR code, preventing further changes. Transitions status from CONFIGURED to LOCKED.",
        tags=["QR Codes"],
        responses={200: _QRStatusResponseSerializer, 404: OpenApiResponse(description="QR code not found"), 409: OpenApiResponse(description="QR code not in CONFIGURED state")},
    )
    @action(detail=False, methods=['post'])
    def lock_qr(self, request):
        """Lock a configured QR code."""
        api_key = self._validate_api_key(request)
        code = request.data.get('code')
        
        qr = get_object_or_404(DynamicQRCode, code=code, company=api_key.company)
        
        if qr.status != 'CONFIGURED':
            raise QRCodeStateError(
                detail="Only CONFIGURED codes can be locked.",
                current_state=qr.status,
                allowed_transitions=['CONFIGURED'],
            )
            
        qr.status = 'LOCKED'
        qr.save()
        
        return Response({"status": "success", "new_status": qr.status})
