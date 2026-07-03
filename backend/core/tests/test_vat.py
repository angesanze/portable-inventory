"""Tests for the Italian partita IVA (VAT) validator."""

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from core.validators import validate_partita_iva

# Known-valid Italian VAT (mod-10 checksum == 0).
VALID_VAT = "00743110157"


class ValidatePartitaIvaTests(SimpleTestCase):
    def test_known_valid_passes(self):
        self.assertEqual(validate_partita_iva(VALID_VAT), VALID_VAT)

    def test_wrong_length_fails(self):
        with self.assertRaises(ValidationError):
            validate_partita_iva("1234567890")  # 10 digits

    def test_non_numeric_fails(self):
        with self.assertRaises(ValidationError):
            validate_partita_iva("0074311015A")

    def test_bad_checksum_fails(self):
        with self.assertRaises(ValidationError):
            validate_partita_iva("00743110158")  # last digit broken

    def test_normalization_strips_spaces_and_it_prefix(self):
        self.assertEqual(
            validate_partita_iva("IT 0074 3110 157"),
            VALID_VAT,
        )

    def test_lowercase_it_prefix_normalized(self):
        self.assertEqual(validate_partita_iva("it" + VALID_VAT), VALID_VAT)

    def test_empty_fails(self):
        with self.assertRaises(ValidationError):
            validate_partita_iva("")
