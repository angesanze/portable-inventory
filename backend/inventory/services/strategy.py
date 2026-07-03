from ..models import Location
from .. import constants
from .counterparty import CounterpartyService


class StrategyService:
    @staticmethod
    def seed_default_locations(company):
        """
        Populates a company with default locations.
        """
        Location.objects.get_or_create(
            company=company,
            name="Main Warehouse",
            defaults={
                "type": constants.LOCATION_TYPE_WAREHOUSE,
            },
        )
        # Canonical LOSS location via the shared resolver (single source).
        CounterpartyService.resolve_loss(company)
