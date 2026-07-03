import logging
import traceback
import uuid

from django.conf import settings
from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.exceptions import Throttled, ValidationError as DRFValidationError

from ..exceptions import InventoryError, RateLimitExceededError

logger = logging.getLogger("inventory.errors")


def inventory_exception_handler(exc, context):
    """
    Custom DRF exception handler that:
    - Formats InventoryError subclasses into consistent JSON
    - Logs unexpected 500 errors with full traceback
    - Strips stack traces from production responses
    - Returns request_id for support correlation
    """
    request_id = str(uuid.uuid4())[:8]

    # Let DRF handle standard exceptions first
    response = drf_exception_handler(exc, context)

    if response is not None:
        # Format InventoryError subclasses consistently
        if isinstance(exc, InventoryError):
            error_data = {
                "error": str(exc.detail),
                "code": exc.default_code,
                "request_id": request_id,
            }
            if exc.extra_details:
                error_data["details"] = exc.extra_details
            response.data = error_data

            # Add retry-after header for rate limit errors
            if isinstance(exc, RateLimitExceededError) and exc.retry_after:
                response["Retry-After"] = str(exc.retry_after)

        elif isinstance(exc, Throttled):
            response.data = {
                "error": "Rate limit exceeded. Please try again later.",
                "code": "rate_limit_exceeded",
                "request_id": request_id,
                "details": {"retry_after": exc.wait},
            }
            if exc.wait:
                response["Retry-After"] = str(int(exc.wait))

        elif isinstance(exc, DRFValidationError):
            # Preserve DRF ValidationError structure (field-level errors)
            # so existing code that checks response.data['field_name'] still works
            pass

        else:
            # Other DRF exceptions — wrap in consistent format
            detail = (
                response.data.get("detail", str(response.data))
                if isinstance(response.data, dict)
                else str(response.data)
            )
            response.data = {
                "error": detail,
                "code": getattr(exc, "default_code", "error"),
                "request_id": request_id,
            }

        return response

    # Unhandled exception — 500
    logger.error(
        "Unhandled exception [request_id=%s] %s: %s\n%s",
        request_id,
        type(exc).__name__,
        str(exc),
        traceback.format_exc(),
    )

    from rest_framework.response import Response
    from rest_framework import status

    error_data = {
        "error": "Internal server error.",
        "code": "internal_error",
        "request_id": request_id,
    }

    # Include traceback in debug mode only
    if getattr(settings, "DEBUG", False):
        error_data["debug_message"] = str(exc)

    return Response(error_data, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
