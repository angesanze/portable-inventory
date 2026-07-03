from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    page_size_query_param = "page_size"
    max_page_size = 200

    def get_page_size(self, request):
        # `page_size=0` is an explicit "return the full set" signal used by
        # fetch-all callers (dropdowns / pickers / KPI rollups). Returning None
        # disables pagination for that request so the view serializes the whole
        # queryset instead of silently truncating it to a page (FE-02).
        raw = request.query_params.get(self.page_size_query_param)
        if raw is not None and str(raw).strip() == "0":
            return None
        return super().get_page_size(request)
