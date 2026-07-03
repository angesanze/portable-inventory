import yaml
import os
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from core.models import Company
from inventory.models import ProductModel as Product
from inventory.profiles import PROFILE_MAP


class Command(BaseCommand):
    help = "Imports a Product definition from a YAML file"

    def add_arguments(self, parser):
        parser.add_argument("yaml_file", type=str, help="Path to the YAML configuration file")
        parser.add_argument(
            "--company", type=str, help="Name of the company to assign the product to (optional)"
        )

    def handle(self, *args, **options):
        file_path = options["yaml_file"]
        company_name = options.get("company")

        if not os.path.exists(file_path):
            raise CommandError(f'File "{file_path}" does not exist')

        self.stdout.write(f"Reading {file_path}...")

        with open(file_path, "r") as f:
            try:
                config = yaml.safe_load(f)
            except yaml.YAMLError as exc:
                raise CommandError(f"Error parsing YAML: {exc}")

        # Validation
        if not config.get("sku"):
            raise CommandError("YAML must contain 'sku'")
        if not config.get("name"):
            raise CommandError("YAML must contain 'name'")

        profile = config.get("profile")
        if not profile:
            raise CommandError("YAML must contain 'profile'")
        if profile not in PROFILE_MAP:
            valid = ", ".join(sorted(PROFILE_MAP.keys()))
            raise CommandError(f"Unknown profile '{profile}'. Valid profiles: {valid}")

        # Resolve Company
        if company_name:
            company = Company.objects.filter(name=company_name).first()
            if not company:
                raise CommandError(f"Company '{company_name}' not found")
        else:
            company = Company.objects.first()
            if not company:
                raise CommandError("No companies found in database. Create one first.")
            self.stdout.write(f"Using default company: {company.name}")

        # Create/Update Product
        with transaction.atomic():
            product, created = Product.objects.update_or_create(
                company=company,
                sku=config["sku"],
                defaults={
                    "name": config["name"],
                    "attributes": config.get("attributes", {}),
                    "profile": profile,
                    "engine_config": config.get("engine_config", {}),
                },
            )

            # Initial Stock (only if created)
            initial_stock = config.get("initial_stock")
            if created and initial_stock is not None:
                product.initial_balance = initial_stock
                product.save()
                self.stdout.write(f"Set initial stock to: {initial_stock}")

            action = "Created" if created else "Updated"
            self.stdout.write(
                self.style.SUCCESS(
                    f'Successfully {action} product "{product.name}" (ID: {product.id})'
                )
            )
