import { useCustom } from "@refinedev/core";
import { API_URL } from "../../../config";

export const useProductSeries = (productId: string | null, days: 30 | 90 = 90) =>
  useCustom({
    url: `${API_URL}/api/v1/products/${productId}/stock-series/`,
    method: "get",
    config: { query: { days } },
    queryOptions: { enabled: !!productId },
  });
