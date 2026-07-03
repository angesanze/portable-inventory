from django.core.exceptions import ValidationError
from django.test import TestCase

from core.models import Company


class CompanyTierTests(TestCase):
    def test_defaults_to_manager_with_no_parent(self):
        """A freshly created Company defaults to manager tier with no parent."""
        company = Company.objects.create(name="Default Co")
        self.assertEqual(company.account_type, Company.AccountType.MANAGER)
        self.assertIsNone(company.parent)

    def test_is_developer_and_is_manager_properties(self):
        """is_developer / is_manager reflect account_type."""
        manager = Company.objects.create(name="Manager Co")
        developer = Company.objects.create(
            name="Developer Co", account_type=Company.AccountType.DEVELOPER
        )

        self.assertTrue(manager.is_manager)
        self.assertFalse(manager.is_developer)
        self.assertTrue(developer.is_developer)
        self.assertFalse(developer.is_manager)

    def test_clean_rejects_manager_as_parent(self):
        """A parent that is itself a manager fails validation."""
        manager_parent = Company.objects.create(name="Manager Parent")
        child = Company.objects.create(name="Child Co", parent=manager_parent)

        with self.assertRaises(ValidationError) as ctx:
            child.clean()
        self.assertIn("parent", ctx.exception.message_dict)

    def test_clean_rejects_manager_with_children(self):
        """A manager company that owns children fails validation."""
        developer = Company.objects.create(
            name="Dev Co", account_type=Company.AccountType.DEVELOPER
        )
        manager = Company.objects.create(name="Manager With Kids")
        # Attach a child to the manager, then demote attempt via clean.
        Company.objects.create(name="Some Child", parent=developer)
        manager.children.add(Company.objects.create(name="Owned Child"))

        with self.assertRaises(ValidationError) as ctx:
            manager.clean()
        self.assertIn("account_type", ctx.exception.message_dict)

    def test_clean_allows_developer_parent(self):
        """A child whose parent is a developer passes validation."""
        developer = Company.objects.create(
            name="Valid Dev", account_type=Company.AccountType.DEVELOPER
        )
        child = Company.objects.create(name="Valid Child", parent=developer)
        child.clean()  # should not raise
