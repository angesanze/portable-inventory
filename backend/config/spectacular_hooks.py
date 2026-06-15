"""drf-spectacular preprocessing hooks (PLATFORM-API-10, Fase 2).

Two cross-cutting concerns the schema needs that are awkward to express
per-viewset:

* **X-Acting-Company** — a developer can scope any ``/api/v1/`` request to a
  child tenant by sending this header. Rather than annotate every
  CompanyScoped viewset, ``add_acting_company_header`` injects the header as an
  optional parameter on every authenticated v1 operation in one pass.

* **Platform tagging** — the superuser-only ``platform/`` endpoints should be
  grouped under a single ``Platform`` tag (and the playbook keeps them in the
  document rather than excluding them). ``tag_platform_endpoints`` rewrites
  their tags by path so we don't have to touch each view.
"""

ACTING_COMPANY_PARAMETER = {
    'name': 'X-Acting-Company',
    'in': 'header',
    'required': False,
    'description': (
        'Optional. A developer-tier company may scope the request to a child '
        'tenant it owns by sending that child company UUID. Ignored for '
        'managers acting on their own company; superusers may name any company.'
    ),
    'schema': {'type': 'string', 'format': 'uuid'},
}


def _is_v1_path(path):
    return path.startswith('/api/v1/')


def add_acting_company_header(result, generator, request, public):
    """Add the optional X-Acting-Company header to every authenticated v1 op."""
    for path, path_item in result.get('paths', {}).items():
        if not _is_v1_path(path):
            continue
        for method, operation in path_item.items():
            if method not in {'get', 'post', 'put', 'patch', 'delete'}:
                continue
            # Skip the public widget + onboarding surface: those are api_key /
            # anonymous, never developer-impersonation paths.
            if '/widget/' in path or '/onboarding/' in path:
                continue
            params = operation.setdefault('parameters', [])
            if not any(p.get('name') == 'X-Acting-Company' for p in params):
                params.append(dict(ACTING_COMPANY_PARAMETER))
    return result


def tag_platform_endpoints(result, generator, request, public):
    """Group the superuser-only platform/* operations under a 'Platform' tag."""
    for path, path_item in result.get('paths', {}).items():
        if '/platform/' not in path:
            continue
        for method, operation in path_item.items():
            if method not in {'get', 'post', 'put', 'patch', 'delete'}:
                continue
            operation['tags'] = ['Platform']
    return result
