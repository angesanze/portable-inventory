from django.core.management.base import BaseCommand
from inventory.models import ProductModel
from inventory.monitors import RuleEvaluator
from inventory.services.notifications import NotificationService

class Command(BaseCommand):
    help = 'Evaluates monitoring rules for all products and generates events'

    def handle(self, *args, **options):
        # Piggyback: flush due notification retries at the start of every
        # monitor run (no dedicated scheduler, see NOTIFICATIONS-02).
        retried = NotificationService.retry_pending()
        if retried:
            self.stdout.write(f'Retried {retried} pending notification deliveries')

        products = ProductModel.objects.all()
        count = 0
        for product in products:
            RuleEvaluator.evaluate_product(product)
            count += 1

        self.stdout.write(self.style.SUCCESS(f'Successfully checked rules for {count} products'))
