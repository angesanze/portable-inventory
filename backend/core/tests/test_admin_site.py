"""Smoke test for the branded superadmin AdminSite (CLEANUP-07).

Guards the cockpit's three load-bearing facts: the intelligence index renders
(``index_title`` + at least one anomaly panel marker), a model changelist on the
custom site is reachable, and a non-superuser is bounced. Anything richer
(per-panel counts, prefilters) is covered by the aggregation helpers' own logic
in CLEANUP-08/09; this only proves the site is wired and gated.
"""

import pytest
from django.test import Client, override_settings
from django.urls import reverse

from core.admin_site import varasto_admin_site
from core.models import User

# The deployed config uses whitenoise's *manifest* static storage, which only
# resolves hashed asset names that exist after `collectstatic`. Rendering the
# admin's `{% static %}` tags under tests (no collected manifest) would raise
# "Missing staticfiles manifest entry". Swap in the plain storage for the HTML
# render tests; it serves logical names directly.
_plain_static = override_settings(
    STATICFILES_STORAGE="django.contrib.staticfiles.storage.StaticFilesStorage",
)


@_plain_static
@pytest.mark.django_db
def test_admin_index_renders_ecosystem_cockpit():
    su = User.objects.create_superuser(username="su", password="password123")
    client = Client()
    client.force_login(su)

    resp = client.get("/admin/")

    assert resp.status_code == 200
    body = resp.content.decode()
    assert "Ecosystem Overview" in body  # index_title
    # Every anomaly panel renders a `data-anomaly="<key>"` marker; at least one
    # must be present for the intelligence block to be considered live.
    assert "data-anomaly=" in body


@_plain_static
@pytest.mark.django_db
def test_company_changelist_on_custom_site_is_reachable():
    su = User.objects.create_superuser(username="su", password="password123")
    client = Client()
    client.force_login(su)

    url = reverse(f"{varasto_admin_site.name}:core_company_changelist")
    resp = client.get(url)

    assert resp.status_code == 200


@pytest.mark.django_db
def test_non_superuser_is_denied_admin():
    # is_staff=False → admin login wall redirects rather than serving the index.
    plain = User.objects.create_user(username="plain", password="password123")
    client = Client()
    client.force_login(plain)

    resp = client.get("/admin/")

    assert resp.status_code in (302, 403)
