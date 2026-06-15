from django.test import TestCase
from rest_framework.test import APIRequestFactory

from core.models import Company, User
from core.permissions import IsDeveloperOrSuperuser, IsSuperuser


class PermissionTestBase(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.developer_company = Company.objects.create(
            name="Dev Co", account_type=Company.AccountType.DEVELOPER
        )
        self.manager_company = Company.objects.create(
            name="Manager Co", parent=self.developer_company
        )

    def _request(self, user):
        request = self.factory.get('/')
        request.user = user
        return request


class IsDeveloperOrSuperuserTests(PermissionTestBase):
    def setUp(self):
        super().setUp()
        self.permission = IsDeveloperOrSuperuser()

    def test_superuser_granted(self):
        user = User.objects.create_superuser(username='root', password='x')
        self.assertTrue(self.permission.has_permission(self._request(user), None))

    def test_developer_user_granted(self):
        user = User.objects.create_user(
            username='dev', password='x', company=self.developer_company
        )
        self.assertTrue(self.permission.has_permission(self._request(user), None))

    def test_manager_user_denied(self):
        user = User.objects.create_user(
            username='mgr', password='x', company=self.manager_company
        )
        self.assertFalse(self.permission.has_permission(self._request(user), None))

    def test_user_without_company_denied(self):
        user = User.objects.create_user(username='orphan', password='x')
        self.assertFalse(self.permission.has_permission(self._request(user), None))


class IsSuperuserTests(PermissionTestBase):
    def setUp(self):
        super().setUp()
        self.permission = IsSuperuser()

    def test_superuser_granted(self):
        user = User.objects.create_superuser(username='root', password='x')
        self.assertTrue(self.permission.has_permission(self._request(user), None))

    def test_developer_user_denied(self):
        user = User.objects.create_user(
            username='dev', password='x', company=self.developer_company
        )
        self.assertFalse(self.permission.has_permission(self._request(user), None))

    def test_manager_user_denied(self):
        user = User.objects.create_user(
            username='mgr', password='x', company=self.manager_company
        )
        self.assertFalse(self.permission.has_permission(self._request(user), None))
