"""Tests for InventoryProfile mapping and derivation logic."""

from django.test import TestCase
from inventory.profiles import derive_profile, profile_to_legacy, PROFILE_MAP
from inventory.constants import (
    PROFILE_SIMPLE_COUNT,
    PROFILE_PERISHABLE,
    PROFILE_SERIALIZED,
    PROFILE_ASSEMBLED,
)


class ProfileMappingTest(TestCase):
    """Every canonical mapping round-trips."""

    def test_all_profiles_round_trip(self):
        for profile, (tm, et, st) in PROFILE_MAP.items():
            with self.subTest(profile=profile):
                self.assertEqual(derive_profile(tm, et, st), profile)
                self.assertEqual(profile_to_legacy(profile), (tm, et, st))

    def test_seven_profiles_exist(self):
        self.assertEqual(len(PROFILE_MAP), 7)


class ProfileDerivationFuzzyTest(TestCase):
    """Fuzzy derivation handles real-world edge cases."""

    def test_batch_time_based_with_bucket_strategy(self):
        """time_based engine always → PERISHABLE regardless of strategy."""
        self.assertEqual(derive_profile("BATCH", "time_based", "BUCKET"), PROFILE_PERISHABLE)

    def test_bulk_counter_no_strategy(self):
        self.assertEqual(derive_profile("BULK", "counter", None), PROFILE_SIMPLE_COUNT)

    def test_bulk_counter_with_random_strategy(self):
        """Non-ASSEMBLY strategy on counter → SIMPLE_COUNT."""
        self.assertEqual(derive_profile("BULK", "counter", "CONVERTER"), PROFILE_SIMPLE_COUNT)

    def test_bulk_counter_with_assembly(self):
        self.assertEqual(derive_profile("BULK", "counter", "ASSEMBLY"), PROFILE_ASSEMBLED)

    def test_individual_tracker_with_stale_strategy(self):
        """INDIVIDUAL + tracker always → SERIALIZED."""
        self.assertEqual(derive_profile("INDIVIDUAL", "tracker", "BUCKET"), PROFILE_SERIALIZED)

    def test_unknown_combination_returns_none(self):
        """Completely invalid combo → None."""
        self.assertIsNone(derive_profile("INDIVIDUAL", "bucket", "TIME"))

    def test_profile_to_legacy_raises_on_unknown(self):
        with self.assertRaises(KeyError):
            profile_to_legacy("NONEXISTENT")


class ProfileDerivedPropertiesTest(TestCase):
    """Profile is the single source of truth — tracking_mode and engine_type are derived."""

    def setUp(self):
        from inventory.tests.helpers import make_company

        self.company, self.user, self.api_key = make_company("PROF")

    def test_serialized_profile_derives_individual_tracker(self):
        from inventory.models import ProductModel

        pm = ProductModel(
            company=self.company,
            sku="DER-SER",
            name="Serialized",
            profile="SERIALIZED",
        )
        self.assertEqual(pm.tracking_mode, "INDIVIDUAL")
        self.assertEqual(pm.engine_type, "tracker")

    def test_simple_count_profile_derives_bulk_counter(self):
        from inventory.models import ProductModel

        pm = ProductModel(
            company=self.company,
            sku="DER-SC",
            name="Simple Count",
            profile="SIMPLE_COUNT",
        )
        self.assertEqual(pm.tracking_mode, "BULK")
        self.assertEqual(pm.engine_type, "counter")

    def test_batch_tracked_profile_derives_batch_bucket(self):
        from inventory.models import ProductModel

        pm = ProductModel(
            company=self.company,
            sku="DER-BT",
            name="Batch Tracked",
            profile="BATCH_TRACKED",
        )
        self.assertEqual(pm.tracking_mode, "BATCH")
        self.assertEqual(pm.engine_type, "bucket")

    def test_profile_is_sole_source_of_truth(self):
        """Strategy FK removed — profile alone determines behavior."""
        from inventory.models import ProductModel

        pm = ProductModel(
            company=self.company,
            sku="PROF-ONLY",
            name="Profile Only",
            profile="BATCH_TRACKED",
        )
        pm.full_clean()
        self.assertEqual(pm.tracking_mode, "BATCH")
        self.assertEqual(pm.engine_type, "bucket")
