import {
    useOne,
    useCustom,
    useCustomMutation,
    useList,
    useDelete,
    useUpdate,
    type HttpError,
} from "@refinedev/core";
import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SelectOption } from "../../../components/ui/Select";
import { useConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { API_URL } from "../../../config";
import { buildBatchUpdatePayload } from "../../widget/payload";
import type {
    WorkOrderRecord,
    WorkOrderContentItem,
    WorkOrderMovement,
    ProductModelOption,
    PhysicalProductOption,
} from "./showTypes";

/** Option shape for the add-model select (extends label/value with tracking mode). */
export interface ModelSelectOption extends SelectOption {
    tracking_mode?: string;
}

/**
 * Normalizes the `contents` endpoint payload (which may arrive as an array, a
 * `{ results }` envelope, or a JSON-encoded string) into a flat list of items.
 */
function normalizeContents(raw: unknown): WorkOrderContentItem[] {
    let value: unknown = raw;
    if (typeof value === "string") {
        try {
            value = JSON.parse(value);
        } catch {
            // ignore parse errors
        }
    }
    if (Array.isArray(value)) {
        return value as WorkOrderContentItem[];
    }
    if (value && typeof value === "object") {
        const { results } = value as {
            results?: WorkOrderContentItem[];
        };
        return results || [];
    }
    return [];
}

/** Extracts a human-readable error message from a refine HttpError response. */
function readErrorMessage(error: HttpError | undefined): string | undefined {
    if (!error) return undefined;
    const response = error.response as
        | { data?: { error?: string } }
        | undefined;
    return response?.data?.error ?? error.message;
}

/**
 * Encapsulates all data fetching, derived state, and mutation handlers for the
 * Work Order detail screen. The component layer only renders the returned view
 * model — behavior is identical to the original inline implementation.
 */
export function useWorkOrderShow() {
    const { t } = useTranslation(["inventory", "common"]);
    const { id } = useParams();
    const navigate = useNavigate();
    const { mutate: deleteWorkOrder } = useDelete();
    const { mutate: updateWorkOrder } = useUpdate();
    const { confirm, dialogProps } = useConfirmDialog();

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedModelId, setSelectedModelId] = useState("");
    const [selectedPhysicalProductId, setSelectedPhysicalProductId] =
        useState("");
    const [addQuantity, setAddQuantity] = useState(1);

    const { data: record, isLoading } = useOne<WorkOrderRecord>({
        resource: "work-orders",
        id: id as string,
        queryOptions: { enabled: !!id },
    });

    const { mutate: updateQuantity, isLoading: isUpdating } =
        useCustomMutation<WorkOrderRecord, HttpError, Record<string, unknown>>();

    // Product models for add modal
    const { data: productModels } = useList<ProductModelOption>({
        resource: "product-models",
        pagination: { mode: "off" },
    });

    const modelOptions: ModelSelectOption[] = (productModels?.data || [])
        .filter((p) => p.engine_type !== "bucket")
        .map((p) => ({
            label: `${p.sku} - ${p.name}`,
            value: p.id,
            tracking_mode: p.tracking_mode,
        }));

    const selectedModel = (productModels?.data || []).find(
        (p) => p.id === selectedModelId,
    );
    const isIndividual =
        selectedModel?.profile === "SERIALIZED" ||
        selectedModel?.tracking_mode === "INDIVIDUAL";

    // Physical products for serial picker
    const { data: physicalProducts } = useList<PhysicalProductOption>({
        resource: "physical-products",
        filters: [
            { field: "product_model", operator: "eq", value: selectedModelId },
            { field: "status", operator: "eq", value: "ACTIVE" },
        ],
        queryOptions: { enabled: !!selectedModelId && isIndividual },
        pagination: { mode: "off" },
    });

    const physicalProductOptions: SelectOption[] = (
        physicalProducts?.data || []
    ).map((p) => ({
        label: p.identifier ?? "",
        value: p.id,
    }));

    // Contents
    const {
        data: contentsData,
        isLoading: isLoadingContents,
        refetch,
    } = useCustom({
        url: `${API_URL}/api/v1/work-orders/${record?.data?.id}/contents/`,
        method: "get",
        queryOptions: { enabled: !!record?.data?.id },
    });

    // Movements linked to this work order
    const { data: movementsData, isLoading: isLoadingMovements } =
        useList<WorkOrderMovement>({
            resource: "movements",
            filters: [{ field: "work_order", operator: "eq", value: id }],
            sorters: [{ field: "occurred_at", order: "desc" }],
            pagination: { current: 1, pageSize: 10 },
            queryOptions: { enabled: !!id },
        });

    const order = record?.data;
    const contents = normalizeContents(contentsData?.data);
    const movements: WorkOrderMovement[] = Array.isArray(movementsData?.data)
        ? movementsData.data
        : [];

    const handleDelete = async () => {
        const confirmed = await confirm({
            title: t("workOrders.deleteWorkOrder"),
            message: t("workOrders.deleteConfirmNamed", { name: order?.name }),
            confirmLabel: t("common:delete"),
            variant: "danger",
        });
        if (confirmed) {
            deleteWorkOrder(
                { resource: "work-orders", id: id as string },
                { onSuccess: () => navigate("/work-orders") },
            );
        }
    };

    const handleStatusChange = async (newStatus: string) => {
        const isComplete = newStatus === "CLOSED";
        const confirmed = await confirm({
            title: isComplete
                ? t("workOrders.completeWorkOrder")
                : t("workOrders.archiveWorkOrder"),
            message: isComplete
                ? t("workOrders.completeConfirm", { name: order?.name })
                : t("workOrders.archiveConfirm", { name: order?.name }),
            confirmLabel: isComplete
                ? t("workOrders.complete")
                : t("workOrders.archive"),
            variant: "default",
        });
        if (confirmed) {
            updateWorkOrder({
                resource: "work-orders",
                id: id as string,
                values: { status: newStatus },
            });
        }
    };

    const handleAdjustment = (item: WorkOrderContentItem, delta: number) => {
        if (!record?.data?.id) return;
        updateQuantity(
            {
                url: `${API_URL}/api/v1/widget/${record?.data?.id}/transaction/`,
                method: "post",
                values: buildBatchUpdatePayload({
                    productModelId: item.product_id,
                    delta,
                    physicalIdentifier: item.identifier,
                }),
                successNotification: () => ({
                    message: t("workOrders.stockUpdated"),
                    type: "success",
                }),
                errorNotification: () => ({
                    message: t("workOrders.failedToUpdate"),
                    type: "error",
                }),
            },
            { onSuccess: () => refetch() },
        );
    };

    const handleFulfill = async () => {
        if (!record?.data?.id) return;
        const confirmed = await confirm({
            title: t("workOrders.fulfillWorkOrder"),
            message: t("workOrders.fulfillConfirm", { name: order?.name }),
            confirmLabel: t("workOrders.fulfill"),
            variant: "danger",
        });
        if (!confirmed) return;
        updateQuantity(
            {
                url: `${API_URL}/api/v1/work-orders/${record?.data?.id}/fulfill/`,
                method: "post",
                values: {},
                successNotification: () => ({
                    message: t("workOrders.fulfillSuccess"),
                    type: "success",
                }),
                errorNotification: (err) => ({
                    message:
                        readErrorMessage(err) || t("workOrders.fulfillFailed"),
                    type: "error",
                }),
            },
            { onSuccess: () => refetch() },
        );
    };

    const handleAddModel = () => {
        if (!selectedModelId || addQuantity <= 0) return;
        updateQuantity(
            {
                url: `${API_URL}/api/v1/widget/${record?.data?.id}/transaction/`,
                method: "post",
                values: buildBatchUpdatePayload({
                    productModelId: selectedModelId,
                    delta: isIndividual ? 1 : addQuantity,
                    physicalProductId: isIndividual ? selectedPhysicalProductId : undefined,
                }),
                successNotification: () => ({
                    message: t("workOrders.itemAdded"),
                    type: "success",
                }),
                errorNotification: (err) => ({
                    message: err?.message || t("workOrders.failedToAddItem"),
                    type: "error",
                }),
            },
            {
                onSuccess: () => {
                    refetch();
                    setIsAddModalOpen(false);
                    setSelectedModelId("");
                    setSelectedPhysicalProductId("");
                    setAddQuantity(1);
                },
            },
        );
    };

    return {
        t,
        id,
        navigate,
        order,
        isLoading,
        isUpdating,
        contents,
        isLoadingContents,
        movements,
        isLoadingMovements,
        dialogProps,
        // add-model modal state
        isAddModalOpen,
        setIsAddModalOpen,
        selectedModelId,
        setSelectedModelId,
        selectedPhysicalProductId,
        setSelectedPhysicalProductId,
        addQuantity,
        setAddQuantity,
        isIndividual,
        modelOptions,
        physicalProductOptions,
        // handlers
        handleDelete,
        handleStatusChange,
        handleAdjustment,
        handleFulfill,
        handleAddModel,
    };
}
