from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0052_backfill_engine_config_from_preset'),
    ]

    operations = [
        migrations.AlterField(
            model_name='movement',
            name='product_model',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='movements',
                to='inventory.productmodel',
            ),
        ),
    ]
