"""
Tests for E2E seed endpoint debug-mode guard.

Verifies that the /api/v1/seed-e2e/ endpoint:
- Works in DEBUG mode (POST seeds data, GET returns helper message)
- Returns 403 in non-DEBUG mode (view-level guard)
- URL is not routable when DEBUG is False (url-level guard)

The endpoint has two layers of protection:
1. URL-level: path is only appended to urlpatterns when settings.DEBUG is True
2. View-level: SeedE2EView.post() returns 403 if settings.DEBUG is False

Note: Django's test framework sets DEBUG=False before URLs are imported, so
the seed-e2e URL is never registered in test runs. View-level tests use
RequestFactory to bypass URL routing and test the view directly.
"""

import json
from unittest.mock import patch

from django.test import TestCase, override_settings, RequestFactory
from rest_framework.test import APIClient


def _parse_json(response):
    """Parse JSON from Django's JsonResponse (no .json() on raw responses)."""
    return json.loads(response.content)


class SeedE2EDebugTrueTest(TestCase):
    """Test seed endpoint view behavior when DEBUG=True.

    Uses RequestFactory to call the view directly, bypassing URL routing
    (since Django test framework sets DEBUG=False before URL loading).
    Mocks call_command to avoid running the full seed (tested elsewhere).
    """

    def setUp(self):
        self.factory = RequestFactory()

    @override_settings(DEBUG=True)
    def test_post_seeds_data_successfully(self):
        """POST should run seed command and return 200."""
        from inventory.e2e_views import SeedE2EView

        request = self.factory.post("/api/v1/seed-e2e/")
        with patch("inventory.e2e_views.call_command") as mock_cmd:
            response = SeedE2EView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        data = _parse_json(response)
        self.assertTrue(data["success"])
        self.assertEqual(data["message"], "E2E seed completed")
        self.assertIn("output", data)
        mock_cmd.assert_called_once_with("seed_e2e", stdout=mock_cmd.call_args[1]["stdout"])

    @override_settings(DEBUG=True)
    def test_get_returns_helper_message(self):
        """GET should return usage hint."""
        from inventory.e2e_views import SeedE2EView

        request = self.factory.get("/api/v1/seed-e2e/")
        response = SeedE2EView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        data = _parse_json(response)
        self.assertEqual(data["message"], "Use POST to seed E2E data")

    @override_settings(DEBUG=True)
    def test_post_returns_seed_output(self):
        """POST response includes output from seed command."""
        from inventory.e2e_views import SeedE2EView

        def fake_seed(cmd, stdout=None):
            if stdout:
                stdout.write("Seeding complete.")

        request = self.factory.post("/api/v1/seed-e2e/")
        with patch("inventory.e2e_views.call_command", side_effect=fake_seed):
            response = SeedE2EView.as_view()(request)
        data = _parse_json(response)
        self.assertEqual(data["output"], "Seeding complete.")

    @override_settings(DEBUG=True)
    def test_post_handles_seed_failure(self):
        """POST returns 500 if seed command raises an exception."""
        from inventory.e2e_views import SeedE2EView

        request = self.factory.post("/api/v1/seed-e2e/")
        with patch(
            "inventory.e2e_views.call_command",
            side_effect=Exception("seed exploded"),
        ):
            response = SeedE2EView.as_view()(request)
        self.assertEqual(response.status_code, 500)
        data = _parse_json(response)
        self.assertFalse(data["success"])
        self.assertIn("seed exploded", data["error"])


class SeedE2EViewLevelGuardTest(TestCase):
    """Test the view-level DEBUG guard (returns 403 when DEBUG=False).

    This is the second line of defense inside SeedE2EView.post().
    Even if the URL were somehow routable, the view itself blocks
    non-DEBUG requests.
    """

    def setUp(self):
        self.factory = RequestFactory()

    @override_settings(DEBUG=False)
    def test_post_returns_403_when_debug_false(self):
        """POST should return 403 with error message when DEBUG=False."""
        from inventory.e2e_views import SeedE2EView

        request = self.factory.post("/api/v1/seed-e2e/")
        response = SeedE2EView.as_view()(request)
        self.assertEqual(response.status_code, 403)
        data = _parse_json(response)
        self.assertEqual(data["error"], "Not available in production")

    @override_settings(DEBUG=False)
    def test_get_has_no_debug_guard(self):
        """GET has no DEBUG guard — returns helper message regardless.

        This is acceptable because GET returns only a static hint
        message with no sensitive data or side effects.
        """
        from inventory.e2e_views import SeedE2EView

        request = self.factory.get("/api/v1/seed-e2e/")
        response = SeedE2EView.as_view()(request)
        self.assertEqual(response.status_code, 200)


class SeedE2EURLRegistrationTest(TestCase):
    """Test the URL-level guard (route not registered in production).

    Django's test framework sets DEBUG=False before importing urls,
    so seed-e2e is never registered during test runs. This test
    confirms that behavior — requests to the path return 404.
    """

    def setUp(self):
        self.client = APIClient()

    def test_endpoint_not_routable_in_test_env(self):
        """Path returns 404 because URL was not registered (DEBUG=False at import)."""
        response = self.client.post("/api/v1/seed-e2e/")
        self.assertEqual(response.status_code, 404)

    def test_url_conditional_on_debug_setting(self):
        """Verify urls.py only registers seed-e2e inside a DEBUG guard."""
        import inspect
        from inventory import urls as inv_urls

        source = inspect.getsource(inv_urls)
        self.assertIn("if settings.DEBUG:", source)
        self.assertIn("seed-e2e", source)
