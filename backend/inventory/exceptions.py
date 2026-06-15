from rest_framework.exceptions import APIException
from rest_framework import status


class InventoryError(APIException):
    """Base exception for all inventory-related errors."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'An inventory error occurred.'
    default_code = 'inventory_error'

    def __init__(self, detail=None, code=None, details=None):
        super().__init__(detail=detail, code=code)
        self.extra_details = details


class InsufficientStockError(InventoryError):
    """Raised when stock is insufficient for requested operation."""
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Insufficient stock for this operation.'
    default_code = 'insufficient_stock'

    def __init__(self, detail=None, current_stock=None, requested=None, location=None):
        details = {}
        if current_stock is not None:
            details['current_stock'] = str(current_stock)
        if requested is not None:
            details['requested'] = str(requested)
        if location:
            details['location'] = location
        super().__init__(detail=detail, details=details or None)


class InvalidEngineConfigError(InventoryError):
    """Raised when engine configuration is invalid."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'Invalid engine configuration.'
    default_code = 'invalid_engine_config'

    def __init__(self, detail=None, validation_errors=None):
        details = {'validation_errors': validation_errors} if validation_errors else None
        super().__init__(detail=detail, details=details)


class ItemNotFoundError(InventoryError):
    """Raised when a requested item does not exist."""
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = 'Item not found.'
    default_code = 'item_not_found'


class CompanyIsolationError(InventoryError):
    """Raised when a company isolation boundary is violated."""
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = 'Access denied.'
    default_code = 'company_isolation_error'

    def __init__(self):
        # Generic message — never leak company info
        super().__init__(detail='Access denied.')


class QRCodeStateError(InventoryError):
    """Raised when a QR code state transition is invalid."""
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Invalid QR code state transition.'
    default_code = 'qr_code_state_error'

    def __init__(self, detail=None, current_state=None, allowed_transitions=None):
        details = {}
        if current_state:
            details['current_state'] = current_state
        if allowed_transitions:
            details['allowed_transitions'] = allowed_transitions
        super().__init__(detail=detail, details=details or None)


class BulkDeleteError(InventoryError):
    """Raised when a bulk-delete request cannot be honored.

    Used when payload validation fails or when a resource is referenced by
    rows the caller has not opted in to wipe (e.g. Location with PROTECT
    Movements, CalculatorTemplate currently assigned).
    """
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Bulk delete failed.'
    default_code = 'bulk_delete_error'

    def __init__(self, detail=None, details=None):
        super().__init__(detail=detail, details=details)


class RateLimitExceededError(InventoryError):
    """Raised when rate limit is exceeded."""
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_detail = 'Rate limit exceeded. Please try again later.'
    default_code = 'rate_limit_exceeded'

    def __init__(self, detail=None, retry_after=None):
        details = {'retry_after': retry_after} if retry_after else None
        super().__init__(detail=detail, details=details)
        self.retry_after = retry_after
