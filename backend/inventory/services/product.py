"""Product service — business logic for ProductModel lifecycle operations.

Keeps non-trivial product construction logic out of the view layer so it can be
reused and unit-tested independently of the HTTP request cycle.
"""

import uuid

from ..models import ProductModel


class ProductService:
    """Business logic for ProductModel creation/cloning."""

    @staticmethod
    def clone_poly_instance(base_model: ProductModel, *, name: str, company) -> ProductModel:
        """Create a new ProductModel instance from a base ("poly") model.

        Mirrors the inline logic previously in ``ProductsPolyViewSet.create``:
        generates a fresh ``POLY-`` SKU and copies the base model's ``profile``
        and ``default_calculator`` onto a new row scoped to ``company``. The
        caller is responsible for company-scoping ``base_model`` (it must belong
        to ``company``) and for any licence-quota checks.
        """
        sku = f"POLY-{uuid.uuid4().hex[:8].upper()}"
        return ProductModel.objects.create(
            company=company,
            name=name,
            sku=sku,
            profile=base_model.profile,
            default_calculator=base_model.default_calculator,
        )
