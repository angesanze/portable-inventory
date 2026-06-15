"""Data migration: map legacy free-text User.role onto the new enum.

Conservative by design — nobody loses access on deploy:

* the FIRST user (by ``date_joined``) of each company becomes ``OWNER``;
* every other user maps ``"Admin"`` (and any other non-blank legacy value)
  to ``ADMIN``; a blank/null role also becomes ``ADMIN`` (full intra-company
  powers minus in-app user management), NEVER ``VIEWER``.

Reverse is a no-op: the enum values are valid free-text, so downgrading the
field back to a plain CharField needs no data change.
"""
from django.db import migrations


OWNER = 'OWNER'
ADMIN = 'ADMIN'
OPERATOR = 'OPERATOR'
VIEWER = 'VIEWER'

_ALIASES = {
    'admin': ADMIN,
    'owner': OWNER,
    'operator': OPERATOR,
    'worker': OPERATOR,
    'viewer': VIEWER,
}
_ENUM = {OWNER, ADMIN, OPERATOR, VIEWER}


def _canonical(role):
    if not role:
        return ADMIN
    candidate = str(role).strip()
    if candidate in _ENUM:
        return candidate
    upper = candidate.upper()
    if upper in _ENUM:
        return upper
    return _ALIASES.get(candidate.lower(), ADMIN)


def forwards(apps, schema_editor):
    User = apps.get_model('core', 'User')
    Company = apps.get_model('core', 'Company')

    # 1. Normalize every existing role onto the enum (default ADMIN).
    for user in User.objects.all().only('id', 'role'):
        canonical = _canonical(user.role)
        if user.role != canonical:
            user.role = canonical
            user.save(update_fields=['role'])

    # 2. Promote the first user of each company to OWNER so every company has
    #    exactly one owner of record. Company-less users (e.g. bare superusers)
    #    are left as-is.
    for company in Company.objects.all().only('id'):
        first = (
            User.objects.filter(company_id=company.id)
            .order_by('date_joined', 'id')
            .first()
        )
        if first is not None and first.role != OWNER:
            first.role = OWNER
            first.save(update_fields=['role'])


def backwards(apps, schema_editor):
    # No-op: enum values remain valid free-text.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0014_governance_license_role'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
