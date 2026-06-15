"""
DRF permission classes for the dual-tier (manager/developer) model.

The account hierarchy has three effective roles:

* **superadmin** — a Django ``is_superuser``. May provision *developer*
  companies (the only path to a developer account).
* **developer** — a user whose ``company.is_developer`` is true. May provision
  *manager* child companies and the users that belong to them.
* **manager** — a leaf tenant. Has no provisioning rights; write attempts at
  the tenant-management boundary must be denied.

These permissions guard the write boundary where companies and users are
created. To stop the server gates from diverging from the capability flags the
frontend reads, the role-derived gates compute their decision from the SAME
:func:`core.scope.company_capabilities` map that feeds the identity payload —
the UI hiding a button is never the only protection. See
``core.scope.resolve_effective_company`` for the read-side scoping that
complements them.
"""
from rest_framework import permissions

from .scope import company_capabilities


# ── Intra-company role matrix (GOVERNANCE-11 / C2) ──────────────────────────
#
# ``User.role`` is intersected with the company tier in
# :func:`core.scope.company_capabilities`. This table lists, per role, the
# role-gated capabilities (a superset of ``scope.ROLE_GATED_KEYS``). Any key
# absent/False here is withdrawn from the tier grant for that role.
#
# Conservative defaults: a blank / legacy / unknown role normalizes to ADMIN
# (full intra-company powers minus the new in-app user management), so no
# pre-existing user loses access when this ships.

ROLE_OWNER = 'OWNER'
ROLE_ADMIN = 'ADMIN'
ROLE_OPERATOR = 'OPERATOR'
ROLE_VIEWER = 'VIEWER'

#: Canonical role used when a user's role is blank / legacy / unrecognized.
DEFAULT_ROLE = ROLE_ADMIN

# Legacy free-text role strings seen in the wild map onto the enum.
_LEGACY_ROLE_ALIASES = {
    'admin': ROLE_ADMIN,
    'owner': ROLE_OWNER,
    'operator': ROLE_OPERATOR,
    'worker': ROLE_OPERATOR,
    'viewer': ROLE_VIEWER,
}

ROLE_CAPABILITY_MATRIX = {
    # Owner: the whole company including in-app user/license management.
    ROLE_OWNER: {
        'manage_own_inventory': True,
        'delete_inventory': True,
        'manage_thresholds': True,
        'manage_settings': True,
        'manage_users': True,
    },
    # Admin: everything operational, but NOT in-app user/license management.
    ROLE_ADMIN: {
        'manage_own_inventory': True,
        'delete_inventory': True,
        'manage_thresholds': True,
        'manage_settings': True,
        'manage_users': False,
    },
    # Operator: day-to-day floor work (movements, receipts, counts, widget) —
    # but no destructive ops, no thresholds, no settings, no user management.
    ROLE_OPERATOR: {
        'manage_own_inventory': True,
        'delete_inventory': False,
        'manage_thresholds': False,
        'manage_settings': False,
        'manage_users': False,
    },
    # Viewer: read-only. Loses even base inventory writes.
    ROLE_VIEWER: {
        'manage_own_inventory': False,
        'delete_inventory': False,
        'manage_thresholds': False,
        'manage_settings': False,
        'manage_users': False,
    },
}


def normalize_role(role):
    """Map a stored ``User.role`` value onto a canonical enum role.

    Blank / None / unrecognized values resolve to :data:`DEFAULT_ROLE`
    (``ADMIN``) so legacy rows keep full intra-company powers. Known enum
    values pass through; legacy free-text (``"Admin"``, ``"Worker"``…) is
    coerced case-insensitively.
    """
    if not role:
        return DEFAULT_ROLE
    candidate = str(role).strip()
    if candidate in ROLE_CAPABILITY_MATRIX:
        return candidate
    upper = candidate.upper()
    if upper in ROLE_CAPABILITY_MATRIX:
        return upper
    return _LEGACY_ROLE_ALIASES.get(candidate.lower(), DEFAULT_ROLE)


def role_capabilities(role):
    """Return the role-gated capability map for a (possibly legacy) role value.

    Always keyed by every entry of :data:`ROLE_CAPABILITY_MATRIX`'s ADMIN row.
    """
    return ROLE_CAPABILITY_MATRIX[normalize_role(role)]


class HasCapability(permissions.BasePermission):
    """Grant access when the user's capabilities include ``required_capability``.

    This is the single bridge between the dashboard write gates and the
    identity payload: both read from :func:`core.scope.company_capabilities`,
    so a capability that is ``False`` in the UI is also enforced server-side.

    Subclass and set ``required_capability``, or build one inline with
    :func:`require_capability`.
    """

    required_capability = None
    message = "You do not have permission to perform this action."

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not (user and getattr(user, 'is_authenticated', False)):
            return False
        if not self.required_capability:
            return False
        return bool(company_capabilities(user).get(self.required_capability))


def require_capability(capability, message=None):
    """Build a :class:`HasCapability` permission class bound to ``capability``.

    Lets a viewset gate exactly on the capability key it needs
    (e.g. ``require_capability('manage_tenants')``) while still routing the
    decision through :func:`core.scope.company_capabilities`.
    """
    attrs = {'required_capability': capability}
    if message:
        attrs['message'] = message
    return type(f'HasCapability_{capability}', (HasCapability,), attrs)


class LicenseNotExpired(permissions.BasePermission):
    """Deny unsafe (write) methods when the acting company's license expired.

    The authoritative, DRF-level half of license-expiry enforcement
    (GOVERNANCE-11 / C1). The companion
    :class:`core.license_middleware.LicenseEnforcementMiddleware` covers
    session-authenticated paths (Django admin) and acts as defense-in-depth,
    but DRF authenticates *after* middleware runs, so this permission is what
    actually sees the JWT user on API writes.

    Reads (safe methods) always pass — the warehouse stays visible in a
    read-only grace period. Superusers bypass. Companies without a finite
    expiry are never affected.
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        user = getattr(request, 'user', None)
        if not (user and getattr(user, 'is_authenticated', False)):
            return True  # let authentication layer reject; nothing to gate yet
        if getattr(user, 'is_superuser', False):
            return True

        from core.scope import resolve_effective_company
        try:
            company = resolve_effective_company(request)
        except Exception:
            company = getattr(user, 'company', None)
        if company is None:
            company = getattr(user, 'company', None)
        if company is not None and bool(getattr(company, 'is_license_expired', False)):
            # Raise (not return False) so the structured `code: license_expired`
            # body is emitted through the project error handler.
            from core.license_limits import LicenseExpiredError
            raise LicenseExpiredError()
        return True


class IsSuperuser(permissions.BasePermission):
    """Allow access only to Django superusers (``is_superuser``).

    Used to gate the one operation reserved for platform admins: creating
    *developer* companies. There is deliberately no capability key for that
    operation (no tenant should ever see it), so this gate checks
    ``is_superuser`` directly — the same signal :func:`company_capabilities`
    itself keys on.
    """

    message = "Superuser privileges are required for this operation."

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        return bool(user and user.is_superuser)


class IsDeveloperOrSuperuser(permissions.BasePermission):
    """Allow access to superusers and to authenticated developer-company users.

    The decision is derived from :func:`core.scope.company_capabilities` rather
    than a separate hardcoded ``company.is_developer`` check: developers and
    superusers receive every provisioning capability, while a manager (or a
    user without a developer company) receives none of them. This keeps the
    gate in lock-step with the capability flags the frontend reads.
    """

    message = "Developer or superuser privileges are required for this operation."

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not (user and getattr(user, 'is_authenticated', False)):
            return False
        caps = company_capabilities(user)
        return bool(caps.get('manage_tenants') or caps.get('create_users'))
