"""Tests for profile-based tracking_mode/engine_type derivation."""

from django.test import TestCase
from inventory.models import ProductModel
from inventory.tests.helpers import make_company


class ProfileDerivedFieldsTest(TestCase):
    """Validate that profile correctly derives tracking_mode and engine_type."""

    def setUp(self):
        self.company, self.user, _ = make_company("TrkEng")

    # --- SERIALIZED profile ---

    def test_serialized_derives_individual_tracker(self):
        pm = ProductModel(
            company=self.company, sku="SER-OK", name="Valid Serialized",
            profile="SERIALIZED"
        )
        self.assertEqual(pm.tracking_mode, "INDIVIDUAL")
        self.assertEqual(pm.engine_type, "tracker")

    def test_serialized_full_clean_passes(self):
        pm = ProductModel(
            company=self.company, sku="SER-CLN", name="Serialized Clean",
            profile="SERIALIZED"
        )
        pm.full_clean()  # should not raise

    # --- BATCH_TRACKED profile ---

    def test_batch_tracked_derives_batch_bucket(self):
        pm = ProductModel(
            company=self.company, sku="BAT-OK", name="Valid Batch",
            profile="BATCH_TRACKED",
        )
        self.assertEqual(pm.tracking_mode, "BATCH")
        self.assertEqual(pm.engine_type, "bucket")

    def test_batch_tracked_full_clean_passes(self):
        pm = ProductModel(
            company=self.company, sku="BAT-CLN", name="Batch Clean",
            profile="BATCH_TRACKED",
        )
        pm.full_clean()

    # --- PERISHABLE profile ---

    def test_perishable_derives_batch_time_based(self):
        pm = ProductModel(
            company=self.company, sku="PER-OK", name="Valid Perishable",
            profile="PERISHABLE",
        )
        self.assertEqual(pm.tracking_mode, "BATCH")
        self.assertEqual(pm.engine_type, "time_based")

    # --- SIMPLE_COUNT profile ---

    def test_simple_count_derives_bulk_counter(self):
        pm = ProductModel(
            company=self.company, sku="SC-OK", name="Valid Simple Count",
            profile="SIMPLE_COUNT"
        )
        self.assertEqual(pm.tracking_mode, "BULK")
        self.assertEqual(pm.engine_type, "counter")

    # --- UNIT_CONVERSION profile ---

    def test_unit_conversion_derives_bulk_converter(self):
        pm = ProductModel(
            company=self.company, sku="UC-OK", name="Valid Unit Conversion",
            profile="UNIT_CONVERSION"
        )
        self.assertEqual(pm.tracking_mode, "BULK")
        self.assertEqual(pm.engine_type, "converter")

    # --- DIMENSIONAL profile ---

    def test_dimensional_derives_bulk_dimension(self):
        pm = ProductModel(
            company=self.company, sku="DIM-OK", name="Valid Dimensional",
            profile="DIMENSIONAL"
        )
        self.assertEqual(pm.tracking_mode, "BULK")
        self.assertEqual(pm.engine_type, "dimension")

    # --- Profile is sole source of truth ---

    def test_batch_tracked_without_strategy_valid(self):
        """BATCH_TRACKED profile is self-sufficient — no strategy FK needed."""
        pm = ProductModel(
            company=self.company, sku="NO-STRAT", name="No Strategy",
            profile="BATCH_TRACKED"
        )
        pm.full_clean()  # should not raise

    def test_save_derives_from_profile(self):
        """save() succeeds and properties derive from profile."""
        pm = ProductModel.objects.create(
            company=self.company, sku="SYNC-OK", name="Sync Test",
            profile="SERIALIZED"
        )
        self.assertEqual(pm.tracking_mode, "INDIVIDUAL")
        self.assertEqual(pm.engine_type, "tracker")
