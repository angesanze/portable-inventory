"""Reusable field validators for the core app."""

from django.core.exceptions import ValidationError


def normalize_partita_iva(value):
    """Uppercase, strip spaces and an optional leading IT prefix."""
    if not value:
        return value
    normalized = value.upper().replace(" ", "")
    if normalized.startswith("IT"):
        normalized = normalized[2:]
    return normalized


def validate_partita_iva(value):
    """Validate an Italian partita IVA (VAT).

    Normalizes the value, then requires exactly 11 numeric digits and a valid
    mod-10 checksum. Odd-position digits (1st, 3rd, ...) are summed as-is;
    even-position digits (2nd, 4th, ...) are doubled, reducing any result
    greater than 9 by 9. The total must be divisible by 10.

    Raises ``django.core.exceptions.ValidationError`` on failure.
    """
    normalized = normalize_partita_iva(value)
    if not normalized or len(normalized) != 11:
        raise ValidationError("Partita IVA must be exactly 11 digits.")
    if not normalized.isdigit():
        raise ValidationError("Partita IVA must contain only digits.")

    total = 0
    for index, char in enumerate(normalized):
        digit = int(char)
        if index % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit

    if total % 10 != 0:
        raise ValidationError("Partita IVA checksum is invalid.")

    return normalized
