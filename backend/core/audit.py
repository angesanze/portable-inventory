"""Platform audit trail helper.

A thin write-side wrapper around :class:`core.models.AuditLog`. Lifecycle
actions (provisioning, tier changes, suspension, invites, logins) call
:func:`record_audit` to leave a durable, superuser-readable record of *who*
did *what* to *which* company.

Auditing is observational — it must never break the request it observes. Any
failure to write a row is swallowed and logged, so a broken audit path can
never turn a successful provision into a 500.
"""

import logging

from core.models import AuditLog

logger = logging.getLogger(__name__)


def record_audit(actor, action, target_company=None, **metadata):
    """Create an :class:`AuditLog` row, swallowing any error.

    Args:
        actor: the ``User`` who performed the action, or ``None`` (e.g. an
            anonymous login attempt). A non-persisted/anonymous user is stored
            as ``None``.
        action: an :class:`AuditLog.Action` value (or its string).
        target_company: the ``Company`` the action targeted, if any.
        **metadata: arbitrary JSON-serializable context, e.g. ``from``/``to``
            tier on a tier change.

    Returns:
        The created ``AuditLog`` instance, or ``None`` if the write failed.
    """
    try:
        # AnonymousUser (and anything without a primary key) is not a valid FK.
        actor_obj = actor if getattr(actor, "pk", None) else None
        return AuditLog.objects.create(
            actor=actor_obj,
            action=action,
            target_company=target_company,
            metadata=metadata,
        )
    except Exception:
        logger.exception("Failed to record audit log entry for action %s", action)
        return None
