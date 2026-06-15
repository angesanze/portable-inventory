import { axiosInstance } from "../providers/axios-client";

/**
 * Fetch every page of a DRF-paginated list endpoint.
 *
 * The server caps page_size at 200, so single-request "big page" tricks
 * silently truncate. Used by Excel exports and pick-everything modals that
 * must operate on the full (filtered) dataset, not the visible page.
 */
export async function fetchAllPages<T = unknown>(
    url: string,
    params: Record<string, string> = {},
): Promise<T[]> {
    const all: T[] = [];
    let page = 1;
    for (;;) {
        const qs = new URLSearchParams({
            ...params,
            page: String(page),
            page_size: "200",
        }).toString();
        const res = await axiosInstance.get(`${url}?${qs}`);
        const data = res.data;
        const items = Array.isArray(data) ? data : (data?.results ?? []);
        all.push(...items);
        if (Array.isArray(data) || !data?.next) break;
        page += 1;
    }
    return all;
}
