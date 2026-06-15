from django.db import transaction
from rest_framework import permissions, status
from rest_framework.decorators import action, api_view, permission_classes as perm_classes
from rest_framework.response import Response
from ..models import CalculatorTemplate, ProductModel
from ..serializers import CalculatorTemplateSerializer
from ..api.base import CompanyScopedViewSet, bulk_delete_response, parse_bulk_delete_ids
from ..exceptions import BulkDeleteError
from ..engines import EngineFactory, SafeFormulaParser

class CalculatorTemplateViewSet(CompanyScopedViewSet):
    """ViewSet for pre-defined calculator configurations (Engine Type + Config)."""
    serializer_class = CalculatorTemplateSerializer
    queryset = CalculatorTemplate.objects.all()
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['post'], url_path='bulk-delete')
    def bulk_delete(self, request):
        """Bulk-delete CalculatorTemplates. Body: {ids, force?}.

        ProductModel.default_calculator is SET_NULL — deletion is safe at
        the DB level. But blowing away a template that products currently
        reference is silently disruptive, so reject unless `force=true`.
        """
        try:
            ids = parse_bulk_delete_ids(request.data.get('ids'))
        except BulkDeleteError as exc:
            return Response({"detail": str(exc.detail)}, status=exc.status_code)

        force = bool(request.data.get('force', False))
        company = self.get_effective_company()
        qs = CalculatorTemplate.objects.filter(id__in=ids)
        if company is not None:
            qs = qs.filter(company=company)
        scoped_ids = list(qs.values_list('id', flat=True))
        if not scoped_ids:
            return bulk_delete_response(deleted=0, preserved_movements=0)

        assigned_count = ProductModel.objects.filter(
            default_calculator_id__in=scoped_ids,
        ).count()
        if assigned_count and not force:
            return Response(
                {
                    "detail": (
                        f"{assigned_count} product(s) currently use these "
                        f"templates as default_calculator. Re-submit with "
                        f"force=true to detach and delete."
                    ),
                    "assigned_count": assigned_count,
                },
                status=status.HTTP_409_CONFLICT,
            )

        with transaction.atomic():
            CalculatorTemplate.objects.filter(id__in=scoped_ids).delete()

        return bulk_delete_response(deleted=len(scoped_ids), preserved_movements=0)


def _generate_sample_data(engine_type, engine_config):
    """Generate sample input/output for a given engine config."""
    if engine_type == "counter":
        sample_input = {"quantity": engine_config.get("step", 1), "operation": "add"}
        sample_output = str(engine_config.get("step", 1))
        return sample_input, sample_output

    if engine_type == "converter":
        sample_input = {"quantity": 10, "operation": "subtract"}
        sample_output = f"-10.00 {engine_config.get('stock_unit', '')}".strip()
        return sample_input, sample_output

    if engine_type == "bucket":
        pk = engine_config.get("primary_key", "id")
        sample_input = {"quantity": 5, "operation": "add", "bucket_data": {pk: "SAMPLE-001"}}
        sample_output = "5 (across 1 buckets)"
        return sample_input, sample_output

    if engine_type == "tracker":
        transitions = engine_config.get("status_transitions", {})
        first_from = next(iter(transitions), "ACTIVE")
        first_to_list = transitions.get(first_from, ["IN_USE"])
        first_to = first_to_list[0] if first_to_list else "IN_USE"
        sample_input = {"physical_product_id": "<item-uuid>", "new_status": first_to}
        sample_output = f"Transition: {first_from} → {first_to}"
        return sample_input, sample_output

    if engine_type == "dimension":
        dims = engine_config.get("dimensions", [])
        formula = engine_config.get("formula", "")
        computed_unit = engine_config.get("computed_unit", engine_config.get("unit", ""))
        sample_input = {d: 10.0 for d in dims}
        try:
            parser = SafeFormulaParser(variables=sample_input)
            result = parser.parse(formula)
            sample_output = f"{result:.4g} {computed_unit}".strip()
        except (ValueError, ZeroDivisionError) as e:
            sample_output = f"Error: {e}"
        return sample_input, sample_output

    if engine_type == "time_based":
        sample_input = {"quantity": 50, "operation": "add"}
        if engine_config.get("expiry_tracking", True):
            sample_input["expiry_date"] = "2026-12-31"
        sample_output = "50 units"
        return sample_input, sample_output

    return {}, ""


@api_view(["POST"])
@perm_classes([permissions.IsAuthenticated])
def validate_calculator_config(request):
    """
    Validate engine_type + engine_config and return preview with sample data.

    POST body: { "engine_type": "...", "engine_config": {...} }
    Returns:   { "valid": bool, "errors": [...], "preview": { "sample_input": ..., "sample_output": ... } }
    """
    engine_type = request.data.get("engine_type")
    engine_config = request.data.get("engine_config", {})

    if not engine_type:
        return Response(
            {"valid": False, "errors": ["engine_type is required"]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    errors = EngineFactory.validate_config(engine_type, engine_config)

    # Extra validation for dimension formulas
    if engine_type == "dimension" and not errors:
        formula = engine_config.get("formula", "")
        dims = engine_config.get("dimensions", [])
        if formula and dims:
            try:
                test_vars = {d: 1.0 for d in dims}
                SafeFormulaParser(variables=test_vars).parse(formula)
            except ValueError as e:
                errors.append(f"Formula error: {e}")
            except ZeroDivisionError:
                errors.append("Formula warning: division by zero with unit values")

    preview = None
    if not errors:
        sample_input, sample_output = _generate_sample_data(engine_type, engine_config)
        preview = {"sample_input": sample_input, "sample_output": sample_output}

    return Response({
        "valid": len(errors) == 0,
        "errors": errors,
        "preview": preview,
    })
