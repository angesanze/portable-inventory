"""Seed default locations for a company. Profiles live on products, not as standalone entities."""
from django.core.management.base import BaseCommand
from core.models import Company
from inventory.models import Location


class Command(BaseCommand):
    help = "Seed default locations for all companies (profiles are set per-product, not seeded)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--company-id',
            type=str,
            help='Seed only for specific company UUID',
        )

    def handle(self, *args, **options):
        companies = Company.objects.all()
        if options['company_id']:
            companies = companies.filter(id=options['company_id'])

        default_locations = [
            ('Main Warehouse', 'WAREHOUSE'),
            ('Store', 'STORE'),
            ('Loss', 'LOSS'),
            ('External Vendor', 'VIRTUAL'),
        ]

        for company in companies:
            for name, loc_type in default_locations:
                Location.objects.get_or_create(
                    company=company,
                    name=name,
                    defaults={'type': loc_type},
                )
            self.stdout.write(f"  Seeded locations for {company.name}")

        self.stdout.write(self.style.SUCCESS("Done."))
