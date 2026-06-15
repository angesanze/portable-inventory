import { useCustom } from "@refinedev/core";
import { API_URL } from "../../../config";

export const useRestockBoard = () =>
  useCustom({
    url: `${API_URL}/api/v1/restock/board/`,
    method: "get",
  });
