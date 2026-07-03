"""
Migration: Move License.code → Company.license_code, then remove License model.

Steps:
1. Add license_code field to Company (nullable initially for data migration)
2. Copy License.code into Company.license_code for all existing rows
3. Make license_code unique+non-nullable, remove license FK from Company
4. Delete License model
"""

from django.db import migrations, models
import uuid


def copy_license_code_to_company(apps, schema_editor):
    Company = apps.get_model("core", "Company")
    for company in Company.objects.select_related("license").all():
        if company.license and company.license.code:
            company.license_code = company.license.code
        else:
            company.license_code = uuid.uuid4().hex[:6].upper()
        company.save(update_fields=["license_code"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0007_apikey_permissions_and_tracking"),
    ]

    operations = [
        # Step 1: Add license_code as nullable (so existing rows don't break)
        migrations.AddField(
            model_name="company",
            name="license_code",
            field=models.CharField(blank=True, max_length=20, default=""),
        ),
        # Step 2: Copy data from License.code → Company.license_code
        migrations.RunPython(copy_license_code_to_company, noop),
        # Step 3: Remove the FK to License
        migrations.RemoveField(
            model_name="company",
            name="license",
        ),
        # Step 4: Make license_code unique (now that it has data)
        migrations.AlterField(
            model_name="company",
            name="license_code",
            field=models.CharField(blank=True, max_length=20, unique=True),
        ),
        # Step 5: Delete the License model
        migrations.DeleteModel(
            name="License",
        ),
    ]
