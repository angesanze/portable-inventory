"""
Effective-company resolution for hierarchical (dual-tier) scoping.

A *developer* company may own *child* tenant companies (see
``core.models.Company.parent`` / ``is_developer``). A developer authenticates
with its own company but can act on a child's data by sending the
``X-Acting-Company`` header carrying the child company UUID.

``resolve_effective_company`` computes which company a request should be
scoped to. Precedence:

1. No authenticated company context        -> ``None``.
2. No ``X-Acting-Company`` header           -> the user's own company.
3. Header present, user is a superuser      -> any company named by the header.
4. Header present, user's company is a
   developer AND the target's parent is that
   developer                                -> the target (child) company.
5. Header present but the above ownership
   check fails (or the user is a plain
   manager pointing at someone else)        -> ``PermissionDenied``.

Managers and developers without the header are never affected — they always
get their own ``user.company``, preserving the existing single-company
isolation. This is a single-switch model: there is deliberately no
"union of all children" queryset; warehouse data stays strictly per-tenant.
"""

from rest_framework.exceptions import PermissionDenied

from core.models import Company

ACTING_COMPANY_HEADER = "HTTP_X_ACTING_COMPANY"

# Ordered set of capability keys exposed on the identity payload. The frontend
# gates UI off these flags, but they are NEVER the only protection — the same
# function feeds the server-side write gates (see DUAL-TIER-04 permissions).
#
# The first block are TIER capabilities (manager/developer/superuser): the
# provisioning + widget surface. They are decided purely by the company tier and
# are NOT constrained by the intra-company role — a developer's invite/tenant
# flow is a platform operation that predates roles.
#
# The second block (GOVERNANCE-11 / C2) are INTRA-COMPANY capabilities gated by
# ``User.role``. ``manage_own_inventory`` straddles both: it is granted by the
# tier (every tenant has it) but withdrawn from a VIEWER by the role layer.
TIER_CAPABILITY_KEYS = (
    "manage_api_keys",
    "view_widget_generator",
    "view_widget_preview",
    "create_users",
    "manage_tenants",
    "manage_own_inventory",
)

# Intra-company, role-gated capability keys. New in GOVERNANCE-11. Default
# conservative: legacy/blank roles resolve to ADMIN and receive ALL of these
# except ``manage_users`` (see ``core.permissions.role_capabilities``), so no
# pre-existing endpoint behavior changes on deploy.
ROLE_CAPABILITY_KEYS = (
    "delete_inventory",  # destroy / bulk-delete on inventory resources
    "manage_thresholds",  # restock threshold edits
    "manage_settings",  # company settings PATCH
    "manage_users",  # in-app intra-company user management (OWNER only)
)

CAPABILITY_KEYS = TIER_CAPABILITY_KEYS + ROLE_CAPABILITY_KEYS

# Keys that the role layer is allowed to withdraw from the tier grant. Tier-only
# keys (create_users, manage_tenants, manage_api_keys, widget flags) are never
# touched by the role intersection, so the dual-tier provisioning model is
# untouched by GOVERNANCE-11.
ROLE_GATED_KEYS = frozenset(ROLE_CAPABILITY_KEYS) | {"manage_own_inventory"}


def _tier_capabilities(user):
    """Tier-only capability map (manager/developer/superuser), pre-role.

    Mirrors the historic behavior so the dual-tier model is preserved exactly.
    Role-gated keys start ``True`` here (they are subtracted by the role layer);
    the manager/developer asymmetry only concerns the tier keys.
    """
    is_superuser = bool(getattr(user, "is_superuser", False))
    company = getattr(user, "company", None)
    is_developer = bool(company and getattr(company, "is_developer", False))

    caps = {key: False for key in CAPABILITY_KEYS}

    if is_superuser:
        return {key: True for key in CAPABILITY_KEYS}

    if is_developer:
        for key in CAPABILITY_KEYS:
            caps[key] = key != "view_widget_preview"
        return caps

    # Manager (leaf tenant) or a user without a developer company: own
    # inventory + read-only widget preview, plus the role-gated inventory keys
    # (subtracted below by the role layer for OPERATOR/VIEWER).
    caps["manage_own_inventory"] = True
    caps["view_widget_preview"] = True
    for key in ROLE_CAPABILITY_KEYS:
        caps[key] = True
    return caps


def company_capabilities(user):
    """Effective capability flags for ``user``: tier ∩ role.

    Single source of truth shared by the identity endpoint and the backend
    write gates so the UI flags can never diverge from real enforcement.

    Composition (GOVERNANCE-11):

    * the TIER layer (:func:`_tier_capabilities`) decides provisioning + widget
      flags exactly as before;
    * the ROLE layer (:func:`core.permissions.role_capabilities`) can only
      *withdraw* the role-gated keys (inventory delete/thresholds/settings/users
      + ``manage_own_inventory``). A blank/legacy role resolves to ADMIN, which
      keeps every role-gated key except ``manage_users`` — so existing users
      keep their powers on deploy.
    * **superuser** still gets every capability ``True`` (bypasses the role
      intersection entirely).

    Returns a dict keyed by every member of :data:`CAPABILITY_KEYS`.
    """
    tier = _tier_capabilities(user)

    if bool(getattr(user, "is_superuser", False)):
        return tier

    # Local import avoids a cycle (permissions imports scope).
    from core.permissions import role_capabilities

    role = role_capabilities(getattr(user, "role", None))

    effective = dict(tier)
    for key in ROLE_GATED_KEYS:
        if not role.get(key, False):
            effective[key] = False
    return effective


def resolve_effective_company(request):
    """Return the ``Company`` a request should be scoped to.

    See the module docstring for the full precedence rules. Returns ``None``
    when there is no authenticated company context. Raises
    :class:`rest_framework.exceptions.PermissionDenied` when the acting-company
    header names a company the requester is not allowed to act as.
    """
    user = getattr(request, "user", None)
    if not (user and getattr(user, "is_authenticated", False)):
        return None

    own_company = getattr(user, "company", None)
    acting_id = request.META.get(ACTING_COMPANY_HEADER)

    # No header: managers and developers alike scope to their own company.
    if not acting_id:
        if own_company is None and getattr(user, "is_superuser", False):
            # Superuser without a company and without a header keeps the
            # existing "no specific company" behavior.
            return None
        return own_company

    acting_id = acting_id.strip()
    if not acting_id:
        return own_company

    # A superuser may act as ANY company.
    if getattr(user, "is_superuser", False):
        try:
            return Company.objects.get(pk=acting_id)
        except (Company.DoesNotExist, ValueError, TypeError):
            raise PermissionDenied("Acting company is not a tenant of this developer.")

    # Otherwise only developers may act-as, and only on their own children.
    if own_company is None or not own_company.is_developer:
        raise PermissionDenied("Acting company is not a tenant of this developer.")

    try:
        target = Company.objects.get(pk=acting_id)
    except (Company.DoesNotExist, ValueError, TypeError):
        raise PermissionDenied("Acting company is not a tenant of this developer.")

    if target.parent_id != own_company.id:
        raise PermissionDenied("Acting company is not a tenant of this developer.")

    return target
