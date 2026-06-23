import { useOne, useList, useCustom, useDelete } from "@refinedev/core";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { API_URL } from "../../../../config";
import { PROFILE_METADATA } from "../../../../types/api";
import type { InventoryProfile, ProfileMetadata } from "../../../../types/api";
import { useConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import type {
    ProductModelDetail,
    StockLevel,
    MovementRow,
} from "./types";

/**
 * Data + logic for the Product Model detail screen.
 *
 * Owns the three data queries (model / stock level / recent movements),
 * the derived profile metadata, and the delete flow. The view layer renders
 * the returned view model only — behavior is identical to the original
 * inline implementation in `show.tsx`.
 */
export function useProductModelShow() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation(["products", "common"]);
    const { mutate: deleteModel } = useDelete();
    const { confirm, dialogProps } = useConfirmDialog();

    const { data: record, isLoading } = useOne<ProductModelDetail>({
        resource: "product-models",
        id: id as string,
        queryOptions: { enabled: !!id },
    });

    const { data: stockData, isLoading: isLoadingStock } = useCustom<StockLevel>({
        url: `${API_URL}/api/v1/stock/${id}/level`,
        method: "get",
        queryOptions: { enabled: !!id },
    });

    const { data: movementsData, isLoading: isLoadingMovements } =
        useList<MovementRow>({
            resource: "movements",
            filters: [{ field: "product_model", operator: "eq", value: id }],
            sorters: [{ field: "occurred_at", order: "desc" }],
            pagination: { current: 1, pageSize: 10 },
        });

    const model = record?.data;
    const stock = stockData?.data;
    const movements: MovementRow[] = Array.isArray(movementsData?.data)
        ? movementsData.data
        : [];

    const notFound = !model && !isLoading;

    const profileMeta: ProfileMetadata | undefined = model?.profile
        ? PROFILE_METADATA[model.profile as InventoryProfile]
        : undefined;
    const profileLabel = profileMeta?.label ?? t("products:unknownProfile");

    const handleDelete = async () => {
        const confirmed = await confirm({
            title: t("products:deleteProductModel"),
            message: t("products:deleteProductConfirm", { name: model?.name }),
            confirmLabel: t("common:delete"),
            variant: "danger",
        });
        if (confirmed) {
            deleteModel(
                { resource: "product-models", id: id as string },
                { onSuccess: () => navigate("/products") },
            );
        }
    };

    return {
        id,
        navigate,
        model,
        stock,
        movements,
        isLoading,
        isLoadingStock,
        isLoadingMovements,
        notFound,
        profileMeta,
        profileLabel,
        handleDelete,
        dialogProps,
    };
}
