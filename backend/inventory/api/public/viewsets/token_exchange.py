"""Short-lived QR token → API key exchange.

QR redirects must not embed the long-lived API key in the URL (browser
history, server logs, Referer leakage). /go/<code>/ now emits a signed,
expiring token; the widget exchanges it here once and keeps the key in
memory/sessionStorage.
"""
from django.core import signing
from django.utils import timezone
from rest_framework import serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from drf_spectacular.utils import extend_schema, OpenApiResponse

from core.models import ApiKey

QR_TOKEN_SALT = 'qr-widget-token'
QR_TOKEN_MAX_AGE = 600  # seconds — long enough for a scan+load, short enough to defang leaked URLs


def make_qr_token(api_key: ApiKey) -> str:
    return signing.dumps(str(api_key.key), salt=QR_TOKEN_SALT)


class _TokenExchangeRequestSerializer(serializers.Serializer):
    token = serializers.CharField(help_text="Short-lived signed token from the /go/<code>/ QR redirect (also accepted as ?token= query param).")


class _TokenExchangeResponseSerializer(serializers.Serializer):
    api_key = serializers.CharField(help_text="The resolved company API key. Keep in memory/sessionStorage; never put it back in the URL.")


class WidgetTokenExchangeView(APIView):
    """Exchange a short-lived QR token for the company API key.

    The /go/<code>/ redirect emits a signed, expiring token instead of the
    long-lived API key, so the key never lands in browser history or server
    logs. The widget POSTs the token here once and keeps the key client-side.
    """

    authentication_classes = []
    permission_classes = []
    throttle_classes = [AnonRateThrottle]
    serializer_class = _TokenExchangeRequestSerializer

    @extend_schema(
        summary="Exchange QR token for API key",
        description=(
            "Exchange the short-lived signed token from a QR redirect for the "
            "company API key. Tokens expire after 10 minutes and are single-use "
            "by design (the key is then kept client-side, never re-sent in a URL)."
        ),
        tags=["Widget"],
        request=_TokenExchangeRequestSerializer,
        responses={
            200: _TokenExchangeResponseSerializer,
            400: OpenApiResponse(description="Missing or invalid token."),
            410: OpenApiResponse(description="Token expired, or API key revoked/expired."),
        },
    )
    def post(self, request):
        token = request.data.get('token') or request.query_params.get('token')
        if not token:
            return Response({"detail": "token is required"}, status=400)

        try:
            key = signing.loads(token, salt=QR_TOKEN_SALT, max_age=QR_TOKEN_MAX_AGE)
        except signing.SignatureExpired:
            return Response({"detail": "Token expired. Scan the QR code again."}, status=410)
        except signing.BadSignature:
            return Response({"detail": "Invalid token."}, status=400)

        api_key = ApiKey.objects.filter(key=key, is_active=True).first()
        if api_key is None:
            return Response({"detail": "API key revoked or missing."}, status=410)
        if api_key.expires_at and api_key.expires_at <= timezone.now():
            return Response({"detail": "API key expired."}, status=410)

        return Response({"api_key": api_key.key})
