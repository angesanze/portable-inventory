"""
Write-gate tests for user creation via ``UserViewSet.invite``.

Managers are leaf tenants and have no user-create path: any invite attempt must
return 403. Developers may create users only inside their OWN child companies;
superusers may create users anywhere. The endpoint never accepts privilege
fields, so it cannot mint a developer or superuser.
"""
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Company

User = get_user_model()


class InviteUserGateTests(APITestCase):
    def setUp(self):
        self.url = reverse('user-invite')

        self.developer_company = Company.objects.create(
            name="Dev Co", account_type=Company.AccountType.DEVELOPER
        )
        self.child_company = Company.objects.create(
            name="Child Co", parent=self.developer_company
        )
        # A manager company owned by a DIFFERENT developer (not a child of ours).
        self.other_developer = Company.objects.create(
            name="Other Dev", account_type=Company.AccountType.DEVELOPER
        )
        self.foreign_company = Company.objects.create(
            name="Foreign Co", parent=self.other_developer
        )

        self.manager_user = User.objects.create_user(
            username='mgr', password='password123', company=self.child_company
        )
        self.developer_user = User.objects.create_user(
            username='dev', password='password123', company=self.developer_company
        )
        self.superuser = User.objects.create_superuser(
            username='root', password='password123'
        )

    def _payload(self, company, **overrides):
        data = {
            'username': 'invitee',
            'email': 'invitee@example.com',
            'password': 'sup3rsecret',
            'company': str(company.id),
        }
        data.update(overrides)
        return data

    def test_manager_cannot_invite(self):
        """A manager (leaf tenant) is denied with 403 and creates no user."""
        self.client.force_authenticate(user=self.manager_user)
        before = User.objects.count()
        response = self.client.post(
            self.url, self._payload(self.child_company), format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(User.objects.count(), before)

    def test_developer_invites_into_own_child(self):
        """A developer may create a user in its own child company."""
        self.client.force_authenticate(user=self.developer_user)
        response = self.client.post(
            self.url,
            self._payload(self.child_company, username='child_user'),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = User.objects.get(username='child_user')
        self.assertEqual(created.company_id, self.child_company.id)
        self.assertFalse(created.is_superuser)
        self.assertFalse(created.is_staff)

    def test_developer_cannot_invite_into_foreign_company(self):
        """A developer cannot attach a user to a company that is not its child."""
        self.client.force_authenticate(user=self.developer_user)
        before = User.objects.count()
        response = self.client.post(
            self.url,
            self._payload(self.foreign_company, username='foreign_user'),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(User.objects.count(), before)

    def test_superuser_invites_anywhere(self):
        """A superuser may create a user in any company."""
        self.client.force_authenticate(user=self.superuser)
        response = self.client.post(
            self.url,
            self._payload(self.foreign_company, username='su_user'),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = User.objects.get(username='su_user')
        self.assertEqual(created.company_id, self.foreign_company.id)

    def test_anonymous_cannot_invite(self):
        """An unauthenticated request is rejected (401/403)."""
        response = self.client.post(
            self.url, self._payload(self.child_company), format='json'
        )
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
