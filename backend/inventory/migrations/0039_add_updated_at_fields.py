import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0038_rename_inventorystrategy_type_to_strategy_type'),
    ]

    operations = [
        # ProductModel: add updated_at
        migrations.AddField(
            model_name='productmodel',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
        # ProductBatch: add updated_at
        migrations.AddField(
            model_name='productbatch',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
        # PhysicalProduct: add created_at and updated_at
        migrations.AddField(
            model_name='physicalproduct',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='physicalproduct',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
    ]
