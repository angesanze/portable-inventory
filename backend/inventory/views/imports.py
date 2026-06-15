"""Catalogue import API (DATA-ONBOARDING-09).

POST /api/v1/import/products/ (multipart, field 'file').
  - ?dry_run=true  → parse + validate only, returns the per-row report. No writes.
  - otherwise      → validate + commit row-by-row, returns the final report.

Authenticated dashboard endpoint (scoped to the caller's effective company).
A dedicated throttle scope ('import_products') caps abusive uploads.
"""
from rest_framework import permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.exceptions import PermissionDenied

from core.scope import resolve_effective_company
from ..services import importer


def _is_truthy(val):
    return str(val).strip().lower() in ('1', 'true', 'yes', 'on')


class ProductImportView(APIView):
    """Upload a CSV/XLSX catalogue file to create/update products in bulk."""
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'import_products'

    def post(self, request):
        company = resolve_effective_company(request)
        if company is None:
            raise PermissionDenied("Authenticated company context required.")

        upload = request.FILES.get('file')
        if upload is None:
            return Response({"detail": "No file uploaded (field 'file')."}, status=400)

        dry_run = _is_truthy(request.query_params.get('dry_run')) or _is_truthy(
            request.data.get('dry_run')
        )

        try:
            rows = importer.parse(upload)
        except importer.ImportError_ as exc:
            return Response({"detail": str(exc)}, status=400)

        if dry_run:
            results = importer.validate_rows(company, rows)
            counts = {'create': 0, 'update': 0, 'error': 0}
            for r in results:
                if r['action'] == 'CREATE':
                    counts['create'] += 1
                elif r['action'] == 'UPDATE':
                    counts['update'] += 1
                else:
                    counts['error'] += 1
            return Response({
                'dry_run': True,
                'total': len(results),
                'counts': counts,
                'results': results,
            })

        report = importer.commit(company, rows, request.user)
        return Response({
            'dry_run': False,
            'total': len(rows),
            'counts': {
                'create': report['created'],
                'update': report['updated'],
                'error': report['errors'],
            },
            'results': report['results'],
        })
