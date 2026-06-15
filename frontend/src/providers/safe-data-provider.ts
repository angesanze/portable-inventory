import simpleRestProvider from "@refinedev/simple-rest";
import type { AxiosInstance } from "axios";
import type { DataProvider, CrudFilters, CrudSorting } from "@refinedev/core";

/**
 * Converts Refine CrudFilters to Django REST Framework query params.
 * - "search" filter -> "search" param (for SearchFilter)
 * - "eq" operator -> direct field=value (for DjangoFilterBackend)
 * - "contains" operator -> field__icontains=value
 */
const convertFiltersToParams = (filters?: CrudFilters): Record<string, string> => {
    const params: Record<string, string> = {};

    if (!filters) return params;

    for (const filter of filters) {
        if ("field" in filter && filter.value !== undefined && filter.value !== null && filter.value !== "") {
            const { field, operator, value } = filter;

            if (field === "search" || operator === "contains") {
                // Use DRF SearchFilter
                params["search"] = String(value);
            } else if (operator === "eq") {
                // Direct field filter for DjangoFilterBackend
                params[field] = String(value);
            } else if (operator === "in" && Array.isArray(value)) {
                // DRF django-filter supports field__in=val1,val2
                params[`${field}__in`] = value.join(",");
            } else {
                // Fallback: direct assignment
                params[field] = String(value);
            }
        }
    }

    return params;
};

/**
 * Converts Refine CrudSorting to Django REST Framework ordering param.
 */
const convertSortersToParams = (sorters?: CrudSorting): Record<string, string> => {
    if (!sorters || sorters.length === 0) return {};

    const ordering = sorters
        .map((s) => (s.order === "desc" ? `-${s.field}` : s.field))
        .join(",");

    return { ordering };
};

export const safeDataProvider = (apiUrl: string, httpClient: AxiosInstance): DataProvider => {
    const baseProvider = simpleRestProvider(apiUrl, httpClient as any);

    return {
        ...baseProvider,
        getList: async (params) => {
            const { resource, pagination, filters, sorters } = params;

            // Build query params
            const queryParams: Record<string, string> = {};

            // Add pagination (DRF PageNumberPagination uses ?page=N&page_size=N)
            if (pagination) {
                const { current, pageSize } = pagination;
                if (current) queryParams["page"] = String(current);
                if (pageSize) queryParams["page_size"] = String(pageSize);
            }

            // Add filters (converted to DRF format)
            Object.assign(queryParams, convertFiltersToParams(filters));

            // Add sorters (converted to DRF ordering)
            Object.assign(queryParams, convertSortersToParams(sorters));

            // Build URL with query params
            const queryString = new URLSearchParams(queryParams).toString();
            const url = queryString ? `${apiUrl}/${resource}/?${queryString}` : `${apiUrl}/${resource}/`;

            try {
                const response = await httpClient.get(url);
                const rawData = response.data;

                // Handle DRF pagination wrapper or direct array
                let data: any[];
                let total: number;

                if (Array.isArray(rawData)) {
                    data = rawData;
                    total = rawData.length;
                } else if (rawData && Array.isArray(rawData.results)) {
                    data = rawData.results;
                    total = rawData.count ?? rawData.results.length;
                } else {
                    console.error(`[SafeDataProvider] getList for "${resource}" returned unexpected format:`, rawData);
                    data = [];
                    total = 0;
                }

                return { data, total };
            } catch (error) {
                console.error(`[SafeDataProvider] getList error for "${resource}":`, error);
                throw error;
            }
        },
        create: async ({ resource, variables }) => {
            const url = `${apiUrl}/${resource}/`;
            try {
                const response = await httpClient.post(url, variables);
                return { data: response.data };
            } catch (error) {
                console.error(`[SafeDataProvider] create error for "${resource}":`, error);
                throw error;
            }
        },
        getOne: async ({ resource, id }) => {
            // Ensure trailing slash for DRF compatibility
            const url = `${apiUrl}/${resource}/${id}/`;
            try {
                const response = await httpClient.get(url);
                return { data: response.data };
            } catch (error) {
                console.error(`[SafeDataProvider] getOne error for "${resource}" id "${id}":`, error);
                throw error;
            }
        },
        custom: async ({ url, method, payload, query, headers }) => {
            let requestUrl = url;
            if (query) {
                const queryString = new URLSearchParams(query as any).toString();
                requestUrl = `${url}?${queryString}`;
            }

            try {
                const response = await httpClient.request({
                    url: requestUrl,
                    method,
                    data: payload,
                    headers: headers as any,
                });
                return { data: response.data };
            } catch (error) {
                console.error(`[SafeDataProvider] custom error: ${requestUrl}`, error);
                throw error;
            }
        },
    };
};
