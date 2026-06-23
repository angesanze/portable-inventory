"""SEC-03: hash API keys at rest.

Adds ``key_hash`` (the SHA-256 looked up at auth time) and a non-secret
``key_prefix`` for display, backfills them from the existing plaintext, then
drops the plaintext from the ``key`` column. The migration is irreversible in
the sense that plaintext keys cannot be recovered afterwards — existing keys
keep working (clients still send the same plaintext, which we re-hash and
match), but they can no longer be displayed; rotate to reveal a new value.
"""
import hashlib

from django.db import migrations, models


def hash_existing_keys(apps, schema_editor):
    ApiKey = apps.get_model('core', 'ApiKey')
    seen = set()
    for api_key in ApiKey.objects.all().iterator():
        raw = (api_key.key or '').strip()
        if not raw:
            continue
        digest = hashlib.sha256(raw.encode()).hexdigest()
        api_key.key_prefix = raw[:12]
        api_key.key = ''
        if digest in seen:
            # Two keys shared the same plaintext: keep the first, leave this
            # one's key_hash NULL so the upcoming unique constraint holds. The
            # duplicate is then unusable (no hash to match) and must be rotated.
            api_key.key_hash = None
            api_key.save(update_fields=['key_prefix', 'key'])
            continue
        seen.add(digest)
        api_key.key_hash = digest
        api_key.save(update_fields=['key_hash', 'key_prefix', 'key'])


def noop_reverse(apps, schema_editor):
    # Plaintext is gone for good; nothing to restore.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0015_governance_role_data'),
    ]

    operations = [
        migrations.AddField(
            model_name='apikey',
            name='key_hash',
            field=models.CharField(
                blank=True, max_length=64, null=True,
                help_text='SHA-256 of the API key. Lookups match on this; the plaintext is shown once at creation.',
            ),
        ),
        migrations.AddField(
            model_name='apikey',
            name='key_prefix',
            field=models.CharField(
                blank=True, default='', max_length=16,
                help_text='Non-secret leading characters of the key, for display only.',
            ),
        ),
        migrations.AlterField(
            model_name='apikey',
            name='key',
            field=models.CharField(
                blank=True, default='', max_length=64,
                help_text='Transient: a plaintext set here is hashed into key_hash on save and not stored.',
            ),
        ),
        migrations.RunPython(hash_existing_keys, noop_reverse),
        migrations.AlterField(
            model_name='apikey',
            name='key_hash',
            field=models.CharField(
                blank=True, max_length=64, null=True, unique=True,
                help_text='SHA-256 of the API key. Lookups match on this; the plaintext is shown once at creation.',
            ),
        ),
    ]
