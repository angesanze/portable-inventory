import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError



class Company(models.Model):
    class AccountType(models.TextChoices):
        MANAGER = 'manager', 'Manager'
        DEVELOPER = 'developer', 'Developer'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    license_code = models.CharField(max_length=20, unique=True, blank=True)
    vat = models.CharField(
        max_length=13,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Partita IVA — unique business identifier. Null allowed for legacy rows; required at new registration.",
    )
    settings = models.JSONField(default=dict, blank=True)
    account_type = models.CharField(
        max_length=20,
        choices=AccountType.choices,
        default=AccountType.MANAGER,
        db_index=True,
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='children',
        help_text="Developer company that owns this tenant. Null for standalone/root companies.",
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True, db_index=True)
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Superadmin suspend switch. Inactive companies are blocked from login/API.",
    )

    # ── Licensing (GOVERNANCE-11 / C1) ──────────────────────────────────
    # Null everywhere = perpetual + unlimited, preserving the pre-existing
    # "license is just a hex login code" behavior for every legacy row.
    license_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="License expiry. Null = perpetual. Past = writes blocked (read-only grace).",
    )
    max_users = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Cap on active users in this company. Null = unlimited. Checked only at invite time.",
    )
    max_products = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Cap on ProductModels. Null = unlimited. Checked only at product-create time.",
    )
    max_managed_companies = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Cap on child tenants a developer may own. Null = unlimited. Checked at onboarding.",
    )
    license_rotated_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of the last license_code rotation (rotate_license).",
    )

    @property
    def is_license_expired(self):
        """True when a finite expiry exists and is in the past."""
        if not self.license_expires_at:
            return False
        from django.utils import timezone
        return timezone.now() >= self.license_expires_at

    def rotate_license(self):
        """Mint a fresh license_code, invalidating the old one. Returns it.

        The old code can no longer authenticate (login compares against
        ``license_code``). Stamps ``license_rotated_at``.
        """
        from django.utils import timezone
        self.license_code = uuid.uuid4().hex[:6].upper()
        self.license_rotated_at = timezone.now()
        self.save(update_fields=['license_code', 'license_rotated_at'])
        return self.license_code

    @property
    def is_developer(self):
        return self.account_type == self.AccountType.DEVELOPER

    @property
    def is_manager(self):
        return self.account_type == self.AccountType.MANAGER

    @staticmethod
    def normalize_vat(value):
        """Uppercase, strip spaces and an optional leading IT prefix."""
        if not value:
            return value
        normalized = value.upper().replace(' ', '')
        if normalized.startswith('IT'):
            normalized = normalized[2:]
        return normalized

    def clean(self):
        super().clean()
        self.vat = self.normalize_vat(self.vat)
        # Only developers may own children.
        if self.is_manager and self.pk and self.children.exists():
            raise ValidationError(
                {'account_type': "A manager company cannot own child companies."}
            )
        # A parent must itself be a developer.
        if self.parent_id and not self.parent.is_developer:
            raise ValidationError(
                {'parent': "Parent must be a developer company."}
            )

    def save(self, *args, **kwargs):
        if not self.license_code:
            self.license_code = uuid.uuid4().hex[:6].upper()
        self.vat = self.normalize_vat(self.vat)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class User(AbstractUser):
    class Role(models.TextChoices):
        OWNER = 'OWNER', 'Owner'
        ADMIN = 'ADMIN', 'Admin'
        OPERATOR = 'OPERATOR', 'Operator'
        VIEWER = 'VIEWER', 'Viewer'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.SET_NULL, null=True, blank=True, related_name='users')
    # Kept nullable/blank for backward-compat: legacy rows and any user created
    # without an explicit role resolve to ADMIN (full intra-company powers) at
    # the capability boundary — see ``core.permissions.normalize_role``. This
    # guarantees no user loses access on deploy.
    role = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        choices=Role.choices,
        help_text="Intra-company role. Blank/legacy = treated as ADMIN.",
    )

    def __str__(self):
        return self.username

class ApiKey(models.Model):
    class RateLimitTier(models.TextChoices):
        FREE = 'free', 'Free (1,000/hr)'
        STANDARD = 'standard', 'Standard (10,000/hr)'
        PREMIUM = 'premium', 'Premium (100,000/hr)'

    DEFAULT_PERMISSIONS = {
        'read': True,
        'write': True,
        'delete': False,
        'manage_qr': True,
        'scan': True,
    }

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='api_keys')
    key = models.CharField(max_length=64, unique=True, db_index=True)
    label = models.CharField(max_length=100, default="Default Key")
    allowed_domains = models.TextField(blank=True, help_text="Comma-separated list of allowed domains (e.g., example.com). Leave empty for wildcard access.")
    is_active = models.BooleanField(default=True)
    default_location = models.ForeignKey('inventory.Location', on_delete=models.SET_NULL, null=True, blank=True, help_text="If set, the widget will skip location selection and force this location.")
    permissions = models.JSONField(default=dict, blank=True, help_text="Granular permissions: read, write, delete, manage_qr, scan")
    rate_limit_tier = models.CharField(max_length=20, choices=RateLimitTier.choices, default=RateLimitTier.FREE)
    expires_at = models.DateTimeField(null=True, blank=True, help_text="Key expiration date. Null means no expiration.")
    last_used_at = models.DateTimeField(null=True, blank=True)
    usage_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.permissions:
            self.permissions = self.DEFAULT_PERMISSIONS.copy()
        super().save(*args, **kwargs)

    def has_permission(self, perm):
        perms = self.permissions or self.DEFAULT_PERMISSIONS
        return perms.get(perm, False)

    @property
    def is_expired(self):
        if not self.expires_at:
            return False
        from django.utils import timezone
        return timezone.now() >= self.expires_at

    def __str__(self):
        return f"{self.company.name} - {self.label}"


class AuditLog(models.Model):
    class Action(models.TextChoices):
        COMPANY_PROVISIONED = 'COMPANY_PROVISIONED', 'Company provisioned'
        TIER_CHANGED = 'TIER_CHANGED', 'Tier changed'
        COMPANY_SUSPENDED = 'COMPANY_SUSPENDED', 'Company suspended'
        COMPANY_REACTIVATED = 'COMPANY_REACTIVATED', 'Company reactivated'
        USER_INVITED = 'USER_INVITED', 'User invited'
        LOGIN = 'LOGIN', 'Login'
        COMPANY_EXPORTED = 'COMPANY_EXPORTED', 'Company data exported'
        COMPANY_DELETED = 'COMPANY_DELETED', 'Company deleted'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
        help_text="User who performed the action. Null if the actor was deleted.",
    )
    action = models.CharField(max_length=32, choices=Action.choices, db_index=True)
    target_company = models.ForeignKey(
        Company,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
        help_text="Company the action targeted, if any.",
    )
    metadata = models.JSONField(default=dict, blank=True, help_text="Action context, e.g. {from, to} tier.")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.action} by {self.actor_id} at {self.created_at}"
