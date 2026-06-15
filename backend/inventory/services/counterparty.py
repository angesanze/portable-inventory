from ..models import Location
from .. import constants


class CounterpartyService:
    """
    Resolves the virtual Location a stock change is booked against.

    A manual giacenza correction must be tracked as an ADJUSTMENT (rettifica),
    not as goods received from an external VENDOR. Each kind maps to its own
    dedicated virtual location so movements read precisely
    (e.g. "Inventory Adjustment → Warehouse" instead of "External Vendor → Warehouse").
    """

    @staticmethod
    def resolve(company, kind: str = constants.COUNTERPARTY_ADJUSTMENT) -> Location:
        spec = constants.COUNTERPARTY_LOCATION_DEFS.get(
            kind, constants.COUNTERPARTY_LOCATION_DEFS[constants.COUNTERPARTY_ADJUSTMENT]
        )

        # Prefer an existing virtual location matching one of the known aliases.
        existing = Location.objects.filter(
            company=company,
            type=constants.LOCATION_TYPE_VIRTUAL,
            name__in=spec['aliases'],
        ).first()
        if existing:
            return existing

        # Otherwise create the dedicated counterparty for this kind. We do NOT
        # fall back to "any virtual location" — that ambiguity is exactly what
        # caused adjustments to be mislabeled as vendor receipts.
        location, _ = Location.objects.get_or_create(
            company=company,
            name=spec['name'],
            defaults={'type': constants.LOCATION_TYPE_VIRTUAL},
        )
        return location

    @staticmethod
    def resolve_loss(company) -> Location:
        """The company's LOSS location (scrap/shrinkage sink), lazily created.

        Single source of truth — previously reimplemented in transfers, rma and
        the location seeder, each hardcoding the ``'Loss'`` name. Prefers any
        existing LOSS-typed location, else creates the canonical one.
        """
        loss = Location.objects.filter(
            company=company, type=constants.LOCATION_TYPE_LOSS,
        ).order_by('name').first()
        if loss is not None:
            return loss
        loss, _ = Location.objects.get_or_create(
            company=company,
            name=constants.DEFAULT_LOSS_LOCATION_NAME,
            defaults={'type': constants.LOCATION_TYPE_LOSS},
        )
        return loss
