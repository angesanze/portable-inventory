from django.test import RequestFactory, TestCase
from rest_framework.exceptions import PermissionDenied

from core.models import Company, User
from core.scope import ACTING_COMPANY_HEADER, resolve_effective_company


class ResolveEffectiveCompanyTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.developer = Company.objects.create(
            name="Dev Co", account_type=Company.AccountType.DEVELOPER
        )
        self.child = Company.objects.create(name="Child Co", parent=self.developer)
        self.other_developer = Company.objects.create(
            name="Other Dev", account_type=Company.AccountType.DEVELOPER
        )
        self.foreign_child = Company.objects.create(
            name="Foreign Child", parent=self.other_developer
        )
        self.manager = Company.objects.create(name="Manager Co")

    def _request(self, user, acting=None):
        request = self.factory.get("/")
        request.user = user
        if acting is not None:
            request.META[ACTING_COMPANY_HEADER] = str(acting)
        return request

    def test_manager_ignores_acting_header(self):
        """A manager always gets its own company even with the header set."""
        user = User.objects.create_user(username="mgr", company=self.manager)
        request = self._request(user, acting=self.child.id)

        with self.assertRaises(PermissionDenied):
            resolve_effective_company(request)

    def test_manager_without_header_gets_own_company(self):
        user = User.objects.create_user(username="mgr2", company=self.manager)
        request = self._request(user)

        self.assertEqual(resolve_effective_company(request), self.manager)

    def test_developer_acting_as_own_child(self):
        """Developer with header pointing at its own child gets the child."""
        user = User.objects.create_user(username="dev", company=self.developer)
        request = self._request(user, acting=self.child.id)

        self.assertEqual(resolve_effective_company(request), self.child)

    def test_developer_acting_as_non_child_denied(self):
        """Developer with header pointing at a NON-child raises PermissionDenied."""
        user = User.objects.create_user(username="dev2", company=self.developer)
        request = self._request(user, acting=self.foreign_child.id)

        with self.assertRaises(PermissionDenied):
            resolve_effective_company(request)

    def test_developer_without_header_gets_own_company(self):
        user = User.objects.create_user(username="dev3", company=self.developer)
        request = self._request(user)

        self.assertEqual(resolve_effective_company(request), self.developer)

    def test_superuser_with_header_gets_any_company(self):
        user = User.objects.create_superuser(username="root", password="x")
        request = self._request(user, acting=self.foreign_child.id)

        self.assertEqual(resolve_effective_company(request), self.foreign_child)

    def test_no_authenticated_user_returns_none(self):
        from django.contrib.auth.models import AnonymousUser

        request = self._request(AnonymousUser())
        self.assertIsNone(resolve_effective_company(request))
