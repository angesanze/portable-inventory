from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.throttling import ScopedRateThrottle
from django.shortcuts import get_object_or_404
from django.http import HttpResponseRedirect, HttpResponse
from django.views import View
from django.core.cache import cache
from django.conf import settings

import logging

logger = logging.getLogger("inventory.qr")


def _widget_url(path: str) -> str:
    """Resolve a relative widget path to an absolute frontend URL.

    Scanned QR codes hit /go/<code>/ via the frontend (Vite proxies /go/* to
    backend). A bare relative redirect would force the browser to stay on
    whatever origin made the request — if the QR contains the backend host,
    the redirect lands on the backend (which has no /widget route) → 404.
    Prefix with FRONTEND_BASE_URL so the redirect always lands on the SPA.
    """
    base = (
        getattr(settings, "FRONTEND_BASE_URL", "") or getattr(settings, "PUBLIC_BASE_URL", "") or ""
    )
    if not base:
        return path
    if path.startswith("http://") or path.startswith("https://"):
        return path
    return f"{base}{path if path.startswith('/') else '/' + path}"


from .models import DynamicQRCode, Location
from .serializers.movements import DynamicQRCodeSerializer
from .exceptions import QRCodeStateError
from core.models import ApiKey
from django.db import transaction


class DynamicQRCodeViewSet(viewsets.ModelViewSet):
    """
    CRUD + custom actions for Dynamic QR Codes.
    """

    serializer_class = DynamicQRCodeSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "qr_api"

    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and user.company:
            return DynamicQRCode.objects.filter(company=user.company)
        return DynamicQRCode.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        if user.is_authenticated and user.company:
            # Determine status based on configuration
            data = serializer.validated_data
            is_configured = bool(
                data.get("product_model")
                or data.get("physical_product")
                or data.get("batch")
                or data.get("custom_url")
            )
            status_val = "CONFIGURED" if is_configured else "VIRGIN"
            serializer.save(company=user.company, status=status_val)

    def perform_update(self, serializer):
        instance = self.get_object()

        # Prevent updates to locked QR codes
        if instance.status == "LOCKED":
            raise QRCodeStateError(
                detail="This QR code is locked and cannot be modified.",
                current_state="LOCKED",
                allowed_transitions=[],
            )

        # Update status based on configuration
        data = serializer.validated_data
        is_configured = bool(
            data.get("product_model", instance.product_model)
            or data.get("physical_product", instance.physical_product)
            or data.get("batch", instance.batch)
            or data.get("custom_url", instance.custom_url)
        )
        new_status = "CONFIGURED" if is_configured else "VIRGIN"
        serializer.save(status=new_status)

    @action(detail=False, methods=["post"])
    def generate_batch(self, request):
        """
        Generate multiple virgin QR codes at once.
        POST /api/v1/qr_codes/generate_batch/
        Body: {"count": 10, "api_key": "uuid-here", "label_prefix": "Batch-A", "location_id": "uuid"}
        """
        return self._generate_batch_logic(request)

    def _generate_batch_logic(self, request):
        user = request.user
        if not (user.is_authenticated and user.company):
            raise PermissionDenied("Authentication required.")

        company = user.company

        # Validate API Key
        api_key_id = request.data.get("api_key")
        if not api_key_id:
            raise ValidationError({"api_key": "API Key is required"})

        try:
            api_key = ApiKey.objects.get(id=api_key_id, company=company)
        except ApiKey.DoesNotExist:
            raise ValidationError({"api_key": "Invalid API Key or doesn't belong to your company"})

        # Validate Location (Optional)
        location_id = request.data.get("location_id")
        location = None
        if location_id:
            location = get_object_or_404(Location, id=location_id, company=company)

        count = int(request.data.get("count", 1))
        if count < 1 or count > 100:
            raise ValidationError({"count": "Count must be between 1 and 100"})

        label_prefix = request.data.get("label_prefix", "")

        created = []
        with transaction.atomic():
            for i in range(count):
                # Generate unique label if prefix provided
                label = f"{label_prefix}{i + 1}" if label_prefix else ""
                qr = DynamicQRCode.objects.create(
                    company=company,
                    api_key=api_key,
                    location=location,
                    label=label,
                    status="VIRGIN",
                )
                created.append(qr)

        serializer = self.get_serializer(created, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def lock(self, request, pk=None):
        """
        Lock a QR code to prevent further modifications.
        POST /api/v1/qr_codes/{id}/lock/
        """
        qr = self.get_object()

        if not qr.is_configured():
            raise QRCodeStateError(
                detail="Cannot lock an unconfigured (virgin) QR code. Please assign a target first.",
                current_state=qr.status,
                allowed_transitions=["CONFIGURED"],
            )

        qr.status = "LOCKED"
        qr.save()

        serializer = self.get_serializer(qr)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def unlock(self, request, pk=None):
        """
        Unlock a QR code to allow modifications.
        POST /api/v1/qr_codes/{id}/unlock/
        """
        qr = self.get_object()

        if qr.status != "LOCKED":
            raise QRCodeStateError(
                detail="QR code is not locked.",
                current_state=qr.status,
                allowed_transitions=["LOCKED"],
            )

        # Revert to CONFIGURED (since it must have been configured to be locked)
        qr.status = "CONFIGURED"
        qr.save()

        serializer = self.get_serializer(qr)
        return Response(serializer.data)


class QRRedirectView(View):
    """
    Public view that handles QR code redirects.
    GET /go/{code}/
    """

    def get(self, request, code):
        # Manual Rate Limiting (Simple IP-based)
        client_ip = request.META.get("REMOTE_ADDR")
        cache_key = f"qr_redirect_throttle_{client_ip}"
        request_count = cache.get(cache_key, 0)

        if request_count >= 20:  # Match settings.py qr_redirect rate
            return HttpResponse("Too Many Requests", status=429)

        cache.set(cache_key, request_count + 1, 60)  # 1 minute window

        qr = get_object_or_404(DynamicQRCode, code=code)

        # Use the API key stored in the QR code
        if not qr.api_key:
            return HttpResponseRedirect(_widget_url("/widget?error=no_api_key"))

        api_key = qr.api_key

        # Determine redirect target
        if qr.custom_url:
            return HttpResponseRedirect(qr.custom_url)

        base_widget_url = "/widget"
        # Never put the raw API key in the redirect URL — it would persist in
        # browser history, server logs and Referer headers. Emit a short-lived
        # signed token the widget exchanges via /widget/exchange_token/.
        from .api.public.viewsets.token_exchange import make_qr_token

        params = [f"token={make_qr_token(api_key)}"]

        if qr.physical_product:
            # Redirect to widget with product and identifier locked
            params.append(f"product_id={qr.physical_product.product_model.id}")
            params.append(f"identifier={qr.physical_product.identifier}")
        elif qr.work_order:
            # Redirect to widget with WorkOrder context (WorkOrders are listed as products)
            params.append(f"product_id={qr.work_order.id}")
            # params.append(f'work_order_id={qr.work_order.id}') # Redundant if product_id is the WO
        elif qr.batch:
            # Redirect to widget with batch selected
            if qr.batch.work_order:
                params.append(f"product_id={qr.batch.work_order.id}")
            else:
                params.append(f"product_id={qr.batch.product_model.id}")
                params.append(f"batch_id={qr.batch.id}")

            if qr.batch.location and not qr.location:
                params.append(f"location_id={qr.batch.location.id}")
        elif qr.product_model:
            # Redirect to widget with just product selected
            params.append(f"product_id={qr.product_model.id}")
        elif qr.status == "VIRGIN":
            params.append(f"qr_code={code}")
            params.append("configure_mode=true")
        else:
            # Fallback if somehow configured but targets are missing
            return HttpResponseRedirect(_widget_url("/widget?error=invalid_qr_target"))

        # Add location context if available
        if qr.location:
            params.append(f"location_id={qr.location.id}")

        return HttpResponseRedirect(_widget_url(f"{base_widget_url}?{'&'.join(params)}"))
