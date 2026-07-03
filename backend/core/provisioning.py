"""
Shared tenant-provisioning helpers for the dual-tier (manager/developer) model.

Both self-service onboarding (``inventory.api.public.viewsets.onboarding``) and
developer-driven tenant management (``core.tenant_views``) create a *manager*
company seeded the same way: a default API key plus default locations. This
module is the single source of that creation logic so the two call sites cannot
drift apart.
"""

import secrets

from django.db import transaction

from core.models import Company, ApiKey, User


def provision_manager_company(*, name, parent=None, settings=None):
    """Create a manager-tier :class:`~core.models.Company` and seed it.

    Creates the company (forcing ``account_type='manager'``), generates one
    hidden default :class:`~core.models.ApiKey`, and seeds the default
    locations. Callers are responsible for wrapping this in a transaction and
    for any extra steps (e.g. creating an admin user).

    Args:
        name: Display name for the new company.
        parent: Optional developer :class:`~core.models.Company` that owns the
            new tenant. ``None`` for standalone/root companies.
        settings: Optional settings dict stored on the company.

    Returns:
        Tuple of ``(company, api_key, api_key_value)``. ``api_key_value`` is the
        plaintext key so callers can surface it once at creation time.
    """
    # Lazy import to avoid a core <- inventory import cycle at module load.
    from inventory.services import StrategyService

    company = Company.objects.create(
        name=name,
        account_type=Company.AccountType.MANAGER,
        parent=parent,
        settings=settings or {},
    )

    api_key_value = secrets.token_hex(32)
    api_key = ApiKey.objects.create(
        company=company,
        key=api_key_value,
        label="Default Key",
    )

    StrategyService.seed_default_locations(company)

    return company, api_key, api_key_value


def provision_developer_company(*, name, vat=None, admin_email=None, admin_password=None):
    """Create a developer-tier :class:`~core.models.Company` and seed it.

    Mirrors :func:`provision_manager_company` but forces
    ``account_type='developer'`` with no parent, and seeds one admin user plus
    one hidden default :class:`~core.models.ApiKey`. The whole thing runs in a
    single transaction so a partial company can never be left behind.

    Args:
        name: Display name for the new developer company.
        vat: Optional Partita IVA for the company.
        admin_email: Email/username for the seeded admin user. When omitted no
            admin user is created (caller will add one).
        admin_password: Plaintext password for the seeded admin user. Required
            when ``admin_email`` is given.

    Returns:
        Tuple of ``(company, admin_user, api_key, api_key_value)``.
        ``admin_user`` is ``None`` when no ``admin_email`` was supplied.
        ``api_key_value`` is the plaintext key so callers can surface it once.
    """
    from inventory.services import StrategyService

    with transaction.atomic():
        company = Company.objects.create(
            name=name,
            account_type=Company.AccountType.DEVELOPER,
            parent=None,
            vat=vat,
        )

        api_key_value = secrets.token_hex(32)
        api_key = ApiKey.objects.create(
            company=company,
            key=api_key_value,
            label="Default Key",
        )

        StrategyService.seed_default_locations(company)

        admin_user = None
        if admin_email:
            admin_user = User.objects.create_user(
                username=admin_email,
                email=admin_email,
                password=admin_password,
                is_staff=True,
            )
            admin_user.company = company
            admin_user.role = "Admin"
            admin_user.save()

    return company, admin_user, api_key, api_key_value
