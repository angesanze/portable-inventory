from decimal import Decimal
from django.core.exceptions import ValidationError
from .services import StockService
from .exceptions import InsufficientStockError


def validate_gtin(code: str) -> bool:
    """Validate a GTIN barcode (EAN-8, EAN-13, UPC-A, GTIN-14) by check digit.

    Pure function — no DB access. Returns True when the code is a syntactically
    valid GTIN of an accepted length (8, 12, 13 or 14 digits) AND its trailing
    check digit matches the modulo-10 (GS1) algorithm. Returns False otherwise.

    The GS1 check-digit algorithm: starting from the rightmost data digit
    (i.e. the digit immediately left of the check digit) and moving left,
    multiply digits alternately by 3 and 1, sum, then the check digit is
    (10 - (sum mod 10)) mod 10.

    An empty string is considered "not a barcode" and returns False; callers
    that allow a blank barcode should short-circuit on emptiness themselves.
    """
    if not isinstance(code, str):
        return False
    code = code.strip()
    if not code.isdigit():
        return False
    if len(code) not in (8, 12, 13, 14):
        return False

    digits = [int(ch) for ch in code]
    check = digits[-1]
    body = digits[:-1]

    # Walk the body right-to-left; rightmost body digit gets weight 3.
    total = 0
    for i, digit in enumerate(reversed(body)):
        weight = 3 if i % 2 == 0 else 1
        total += digit * weight

    expected = (10 - (total % 10)) % 10
    return expected == check


class StockMovementValidator:
    @staticmethod
    def validate_bulk_transfer(product, from_location, quantity, reservation=None):
        """
        Validates bulk transfer rules against AVAILABLE stock
        (physical − active reservations). A transfer fulfilling a
        reservation gets that reservation's quantity back.
        """
        # Virtual locations (Suppliers/Loss) have infinite stock
        if from_location.type == "VIRTUAL":
            return

        from .services.reservations import ReservationService

        physical = StockService.get_stock_for_location(product, from_location)
        reserved = ReservationService.active_reserved_qty(product, from_location)
        available = physical - reserved
        if (
            reservation is not None
            and reservation.status == "ACTIVE"
            and reservation.product_model_id == product.pk
        ):
            available += reservation.quantity

        if available < quantity:
            raise InsufficientStockError(
                detail=f"Insufficient available stock at {from_location.name} (reserved: {reserved}).",
                current_stock=available,
                requested=quantity,
                location=from_location.name,
            )

    @staticmethod
    def validate_bucket_transfer(
        from_location,
        to_location,
        batch_id,
        batch_data,
        product=None,
        quantity=None,
        reservation=None,
    ):
        if from_location.type != "VIRTUAL":
            if not batch_id:
                raise ValidationError("Batch ID is required for consuming Bucket products.")

            # Protect reserved stock at the product/location level. A sales
            # reservation on a BATCH product is booked batchless (no batch FK), so
            # BatchBehavior's per-batch reserved check can't see it and the
            # withdrawal would consume promised stock (COR-13). Mirror the BULK
            # rule: available = total batch stock − active reservations, with the
            # fulfilling reservation added back so a ship can spend its own hold.
            # Only engages when reservations exist — plain over-withdrawal is left
            # to BatchBehavior's per-batch check (which names the specific lot).
            if product is not None and quantity is not None:
                from .services.reservations import ReservationService

                reserved = ReservationService.active_reserved_qty(product, from_location)
                if reserved > 0:
                    physical = StockService.get_stock_for_location(product, from_location)
                    available = physical - reserved
                    if (
                        reservation is not None
                        and reservation.status == "ACTIVE"
                        and reservation.product_model_id == product.pk
                    ):
                        available += reservation.quantity
                    if available < quantity:
                        raise InsufficientStockError(
                            detail=f"Insufficient available stock at {from_location.name} (reserved: {reserved}).",
                            current_stock=available,
                            requested=quantity,
                            location=from_location.name,
                        )

        if to_location.type != "VIRTUAL":
            # Inbound from VIRTUAL (external/supplier) with no batch info is
            # allowed — BatchBehavior.execute synthesizes an identifier so a
            # brand-new BATCH/PERISHABLE product can receive its first stock
            # without the user pre-creating a batch (PRESET-LOGIC-07).
            if from_location.type == "VIRTUAL":
                return
            if not batch_id and not batch_data:
                raise ValidationError("Missing batch_data or batch_id for incoming Bucket product.")

    @staticmethod
    def validate_individual_transfer(physical_product, from_location, quantity):
        if not physical_product:
            raise ValidationError(
                "Serialized (Individual) movements require a specific Physical Product."
            )

        if quantity != Decimal("1"):
            raise ValidationError(f"Serialized items must be moved one at a time. Got {quantity}")

        if from_location.type != "VIRTUAL":
            if physical_product.location != from_location:
                current = physical_product.location.name if physical_product.location else "Unknown"
                raise ValidationError(
                    f"Asset '{physical_product.identifier}' is not at '{from_location.name}' (Currently at: '{current}')."
                )
