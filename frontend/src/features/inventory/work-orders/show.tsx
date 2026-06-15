import { useOne, useCustom, useCustomMutation, useList, useDelete, useUpdate } from "@refinedev/core";
import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
    Package,
    Activity,
    Edit2,
    Trash2,
    Box,
    Plus,
    Minus,
    CheckCircle,
    Archive,
    ArrowRight,
    Truck,
} from "lucide-react";
import { Badge, type BadgeVariant } from "../../../components/ui/Badge";
import { SkeletonList } from "../../../components/ui/Skeleton";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { DetailPage } from "../../../components/ui/DetailPage";
import { KeyValueGrid } from "../../../components/ui/KeyValueGrid";
import {
    ConfirmDialog,
    useConfirmDialog,
} from "../../../components/ui/ConfirmDialog";
import { InfoTip } from "../../../components/ui/InfoTip";
import { API_URL } from "../../../config";
import { Select } from "../../../components/ui/Select";

function statusExplanation(status: string, t: TFunction): string | undefined {
    switch (status) {
        case "OPEN": return t("workOrders.statusOpen");
        case "CLOSED": return t("workOrders.statusClosed");
        case "ARCHIVED": return t("workOrders.statusArchived");
        default: return undefined;
    }
}

function statusVariant(status: string): BadgeVariant {
    switch (status) {
        case "OPEN": return "emerald";
        case "CLOSED": return "neutral";
        case "ARCHIVED": return "slate";
        default: return "neutral";
    }
}

export const WorkOrderShow = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const { id } = useParams();
    const navigate = useNavigate();
    const { mutate: deleteWorkOrder } = useDelete();
    const { mutate: updateWorkOrder } = useUpdate();
    const { confirm, dialogProps } = useConfirmDialog();

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedModelId, setSelectedModelId] = useState("");
    const [selectedPhysicalProductId, setSelectedPhysicalProductId] = useState("");
    const [addQuantity, setAddQuantity] = useState(1);

    const { data: record, isLoading } = useOne({
        resource: "work-orders",
        id: id as string,
        queryOptions: { enabled: !!id },
    });

    const { mutate: updateQuantity, isLoading: isUpdating } = useCustomMutation<any>();

    // Product models for add modal
    const { data: productModels } = useList({
        resource: "product-models",
        pagination: { mode: "off" },
    });

    const modelOptions = (productModels?.data || [])
        .filter((p: any) => p.engine_type !== "bucket")
        .map((p: any) => ({
            label: `${p.sku} - ${p.name}`,
            value: p.id,
            tracking_mode: p.tracking_mode,
        }));

    const selectedModel = (productModels?.data || []).find(
        (p: any) => p.id === selectedModelId,
    );
    const isIndividual = selectedModel?.profile === "SERIALIZED" || selectedModel?.tracking_mode === "INDIVIDUAL";

    // Physical products for serial picker
    const { data: physicalProducts } = useList({
        resource: "physical-products",
        filters: [
            { field: "product_model", operator: "eq", value: selectedModelId },
            { field: "status", operator: "eq", value: "ACTIVE" },
        ],
        queryOptions: { enabled: !!selectedModelId && isIndividual },
        pagination: { mode: "off" },
    });

    const physicalProductOptions = (physicalProducts?.data || []).map(
        (p: any) => ({
            label: p.identifier,
            value: p.id,
        }),
    );

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
    const { data: movementsData, isLoading: isLoadingMovements } = useList({
        resource: "movements",
        filters: [{ field: "work_order", operator: "eq", value: id }],
        sorters: [{ field: "occurred_at", order: "desc" }],
        pagination: { current: 1, pageSize: 10 },
        queryOptions: { enabled: !!id },
    });

    const order = record?.data as any;
    let rawContents = contentsData?.data as any;
    if (typeof rawContents === "string") {
        try {
            rawContents = JSON.parse(rawContents);
        } catch {
            // ignore parse errors
        }
    }
    const contents = Array.isArray(rawContents)
        ? rawContents
        : rawContents?.results || [];
    const movements = Array.isArray(movementsData?.data)
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
            title: isComplete ? t("workOrders.completeWorkOrder") : t("workOrders.archiveWorkOrder"),
            message: isComplete
                ? t("workOrders.completeConfirm", { name: order?.name })
                : t("workOrders.archiveConfirm", { name: order?.name }),
            confirmLabel: isComplete ? t("workOrders.complete") : t("workOrders.archive"),
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

    const handleAdjustment = (item: any, delta: number) => {
        if (!record?.data?.id) return;
        updateQuantity(
            {
                url: `${API_URL}/api/v1/widget/${record?.data?.id}/transaction/`,
                method: "post",
                values: {
                    operation: "batch_update_item",
                    product_model_id: item.product_id,
                    delta,
                    physical_identifier: item.identifier,
                },
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
                errorNotification: (err: any) => ({
                    message:
                        err?.response?.data?.error ||
                        err?.message ||
                        t("workOrders.fulfillFailed"),
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
                values: {
                    operation: "batch_update_item",
                    product_model_id: selectedModelId,
                    delta: isIndividual ? 1 : addQuantity,
                    physical_product_id: isIndividual
                        ? selectedPhysicalProductId
                        : undefined,
                },
                successNotification: () => ({
                    message: t("workOrders.itemAdded"),
                    type: "success",
                }),
                errorNotification: (err: any) => ({
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

    if (!order && !isLoading) {
        return (
            <div className="p-8 text-center text-zinc-500">
                {t("workOrders.notFound")}
            </div>
        );
    }

    return (
        <>
            <DetailPage
                title={order?.name ?? ""}
                subtitle={order?.description || undefined}
                badges={
                    order?.status
                        ? [
                              {
                                  label: order.status,
                                  variant: statusVariant(order.status),
                                  dot: true,
                              },
                          ]
                        : []
                }
                actions={
                    <>
                        <Button
                            variant="secondary"
                            icon={Edit2}
                            onClick={() =>
                                navigate(`/work-orders/edit/${id}`)
                            }
                        >
                            {t("common:edit")}
                        </Button>
                        {order?.status === "OPEN" && (
                            <Button
                                variant="primary"
                                icon={Truck}
                                onClick={handleFulfill}
                                disabled={
                                    isUpdating ||
                                    order?.contents_summary?.total_items === 0
                                }
                            >
                                {t("workOrders.fulfill")}
                            </Button>
                        )}
                        {order?.status === "OPEN" && (
                            <Button
                                variant="secondary"
                                icon={CheckCircle}
                                onClick={() => handleStatusChange("CLOSED")}
                            >
                                {t("workOrders.complete")}
                            </Button>
                        )}
                        {order?.status === "CLOSED" && (
                            <Button
                                variant="secondary"
                                icon={Archive}
                                onClick={() => handleStatusChange("ARCHIVED")}
                            >
                                {t("workOrders.archive")}
                            </Button>
                        )}
                        <Button
                            variant="danger"
                            icon={Trash2}
                            onClick={handleDelete}
                        >
                            {t("common:delete")}
                        </Button>
                    </>
                }
                isLoading={isLoading}
            >
                {/* Details */}
                <Card
                    header={
                        <h3 className="text-sm font-semibold text-zinc-200">
                            {t("workOrders.details")}
                        </h3>
                    }
                >
                    <KeyValueGrid
                        items={[
                            { label: t("common:name"), value: order?.name },
                            {
                                label: t("common:description"),
                                value: order?.description || undefined,
                            },
                            {
                                label: t("workOrders.productModel"),
                                value:
                                    order?.product_model_details?.name ||
                                    order?.product_model_sku ||
                                    undefined,
                            },
                            { label: t("common:status"), value: order?.status },
                            {
                                label: t("common:created"),
                                value: order?.created_at
                                    ? new Date(
                                          order.created_at,
                                      ).toLocaleString()
                                    : undefined,
                            },
                            {
                                label: t("common:updated"),
                                value: order?.updated_at
                                    ? new Date(
                                          order.updated_at,
                                      ).toLocaleString()
                                    : undefined,
                            },
                        ]}
                    />
                </Card>

                {/* Status Explanation */}
                {order?.status && statusExplanation(order.status, t) && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-zinc-800/50 border border-white/[0.06] text-sm text-zinc-400">
                        <span>{statusExplanation(order.status, t)}</span>
                    </div>
                )}

                {/* Line Items */}
                <Card
                    padding="none"
                    header={
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                                <Package
                                    size={16}
                                    className="text-emerald-400"
                                />
                                {t("workOrders.lineItems")}
                            </h3>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                                    {t("workOrders.itemCount", { count: contents.length })}
                                </span>
                                {order?.status === "OPEN" && (
                                    <>
                                        <Button
                                            variant="secondary"
                                                                                       icon={Plus}
                                            onClick={() =>
                                                setIsAddModalOpen(true)
                                            }
                                        >
                                            {t("workOrders.addItem")}
                                        </Button>
                                        <InfoTip content={t("workOrders.addItemHelp")} />
                                    </>
                                )}
                            </div>
                        </div>
                    }
                >
                    {isLoadingContents ? (
                        <SkeletonList items={3} />
                    ) : contents.length === 0 ? (
                        <div className="p-8 text-center">
                            <Box
                                size={32}
                                className="mx-auto mb-3 text-zinc-600"
                            />
                            <p className="text-zinc-500">
                                {t("workOrders.noLineItems")}
                            </p>
                            {order?.status === "OPEN" && (
                                <p className="text-zinc-500 text-sm mt-2">
                                    {t("workOrders.emptyLineItems")}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div>
                            {(["BULK", "BATCH", "SERIAL"] as const).map((type) => {
                                const items = contents.filter((item: any) => item.type === type);
                                if (items.length === 0) return null;
                                const sectionLabel = type === "BULK" ? t("workOrders.bulkItems") : type === "BATCH" ? t("workOrders.batchItems") : t("workOrders.serializedItems");
                                const sectionVariant = type === "BATCH" ? "amber" : type === "SERIAL" ? "cyan" : "indigo";
                                return (
                                    <div key={type}>
                                        <div className="px-5 py-2 bg-zinc-800/40 border-y border-white/[0.04] flex items-center gap-2">
                                            <Badge variant={sectionVariant} size="sm">{type}</Badge>
                                            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{sectionLabel}</span>
                                            <span className="text-xs text-zinc-600">({items.length})</span>
                                        </div>
                                        <div className="divide-y divide-white/[0.06]">
                                            {items.map((item: any, idx: number) => (
                                                <div
                                                    key={idx}
                                                    className="px-5 py-4 hover:bg-white/5 transition-colors flex items-center justify-between"
                                                >
                                                    <div className="min-w-0 flex items-center gap-3">
                                                        <div>
                                                            <div className="text-sm font-medium text-zinc-200">
                                                                {item.product_name}
                                                            </div>
                                                            <div className="text-xs text-zinc-500 font-mono">
                                                                {item.sku}
                                                            </div>
                                                            {type === "BULK" && (
                                                                <div className="text-xs text-zinc-500 mt-0.5">
                                                                    {Number(item.quantity).toLocaleString()} {item.unit || t("workOrders.units")}
                                                                </div>
                                                            )}
                                                            {type === "BATCH" && (
                                                                <>
                                                                    <div className="text-xs text-zinc-500 mt-0.5">
                                                                        {t("workOrders.qtyLabel")} {Number(item.quantity).toLocaleString()}
                                                                    </div>
                                                                    {item.batch_identifier &&
                                                                        !["AGGREGATED", "General", "Standard"].includes(item.batch_identifier) && (
                                                                            <div className="text-xs text-zinc-600 mt-0.5">
                                                                                {t("workOrders.lotLabel")} {item.batch_identifier}
                                                                            </div>
                                                                        )}
                                                                </>
                                                            )}
                                                            {type === "SERIAL" && (
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    {item.identifier && (
                                                                        <span className="text-xs text-zinc-500 font-mono">
                                                                            {t("workOrders.snLabel")} {item.identifier}
                                                                        </span>
                                                                    )}
                                                                    <Badge variant={item.status === "ACTIVE" ? "emerald" : "neutral"} size="sm">
                                                                        {item.status || "ACTIVE"}
                                                                    </Badge>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 flex-shrink-0">
                                                        {["BATCH", "BULK"].includes(item.type) && (
                                                            <>
                                                                <button
                                                                    disabled={isUpdating}
                                                                    onClick={() => handleAdjustment(item, -1)}
                                                                    className="w-7 h-7 flex items-center justify-center rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                                                                >
                                                                    <Minus size={14} />
                                                                </button>
                                                                <span className="text-lg font-bold text-zinc-50 min-w-[30px] text-center font-mono">
                                                                    {Number(item.quantity).toLocaleString()}
                                                                </span>
                                                                <button
                                                                    disabled={isUpdating}
                                                                    onClick={() => handleAdjustment(item, 1)}
                                                                    className="w-7 h-7 flex items-center justify-center rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                                                                >
                                                                    <Plus size={14} />
                                                                </button>
                                                            </>
                                                        )}
                                                        {item.type === "SERIAL" && (
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-lg font-bold text-zinc-50 font-mono">
                                                                    {Number(item.quantity).toLocaleString()}
                                                                </span>
                                                                <button
                                                                    disabled={isUpdating}
                                                                    onClick={() => handleAdjustment(item, -1)}
                                                                    className="w-7 h-7 flex items-center justify-center rounded-md bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors disabled:opacity-50"
                                                                    title={t("workOrders.removeFromBatch")}
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                            {/* Total items summary */}
                            {(() => {
                                const uniqueProducts = new Set(contents.map((item: any) => item.product_name || item.sku)).size;
                                const totalUnits = contents.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
                                return (
                                    <div className="px-5 py-3 bg-zinc-800/30 border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-400">
                                        <span>{t("workOrders.totalSummary", { products: uniqueProducts, units: totalUnits.toLocaleString() })}</span>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </Card>

                {/* Movements */}
                <Card
                    padding="none"
                    header={
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                                <Activity
                                    size={16}
                                    className="text-cyan-400"
                                />
                                {t("movements.title")}
                            </h3>
                            <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                                {t("workOrders.last", { count: movements.length })}
                            </span>
                        </div>
                    }
                >
                    {isLoadingMovements ? (
                        <SkeletonList items={3} />
                    ) : movements.length === 0 ? (
                        <div className="p-8 text-center">
                            <Activity
                                size={32}
                                className="mx-auto mb-3 text-zinc-600"
                            />
                            <p className="text-zinc-500">
                                {t("workOrders.noMovements")}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/[0.06]">
                            {movements.map((m: any) => {
                                const qty = Number(m.quantity);
                                const isPositive = qty > 0;
                                return (
                                    <div
                                        key={m.id}
                                        className="px-5 py-4 hover:bg-white/5 transition-colors"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="min-w-0 pr-4">
                                                <div className="text-sm text-zinc-300 mb-1">
                                                    {m.product_model_name ||
                                                        t("workOrders.unknownProduct")}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-zinc-500">
                                                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-white/[0.06] text-zinc-300">
                                                        {m.from_location
                                                            ?.name || "\u2014"}
                                                    </span>
                                                    <ArrowRight
                                                        size={12}
                                                        className="text-zinc-600"
                                                    />
                                                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-white/[0.06] text-zinc-300">
                                                        {m.to_location
                                                            ?.name || "\u2014"}
                                                    </span>
                                                </div>
                                                {m.description && (
                                                    <p className="text-xs text-zinc-500 mt-1 truncate">
                                                        {m.description}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <Badge
                                                    variant={
                                                        isPositive
                                                            ? "emerald"
                                                            : "rose"
                                                    }
                                                    className="px-2 py-0.5"
                                                >
                                                    {isPositive ? "+" : ""}
                                                    {qty.toLocaleString()}
                                                </Badge>
                                                {m.occurred_at && (
                                                    <div className="text-[10px] text-zinc-600 mt-1 font-mono">
                                                        {new Date(
                                                            m.occurred_at,
                                                        ).toLocaleString()}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            </DetailPage>

            <ConfirmDialog {...dialogProps} />

            {/* Add Model Modal */}
            {isAddModalOpen && (
                <div
                    className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm"
                    onClick={() => setIsAddModalOpen(false)}
                >
                    <div
                        className="bg-zinc-900 border border-white/[0.06] p-8 rounded-xl max-w-lg w-full shadow-2xl space-y-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div>
                            <h3 className="text-2xl font-bold text-white">
                                {t("workOrders.addModelTitle")}
                            </h3>
                            <p className="text-zinc-400 text-sm mt-1">
                                {t("workOrders.addModelDesc")}
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    {t("workOrders.productModel")}
                                </label>
                                <Select
                                    value={selectedModelId}
                                    onChange={(val) =>
                                        setSelectedModelId(String(val))
                                    }
                                    placeholder={t("workOrders.selectModel")}
                                    options={modelOptions}
                                />
                            </div>
                            {isIndividual ? (
                                <div>
                                    <label className="block text-sm font-medium text-indigo-400 mb-2">
                                        {t("workOrders.selectSerialNumber")}
                                    </label>
                                    <Select
                                        value={selectedPhysicalProductId}
                                        onChange={(val) =>
                                            setSelectedPhysicalProductId(
                                                String(val),
                                            )
                                        }
                                        placeholder={t("workOrders.pickSerial")}
                                        options={physicalProductOptions}
                                    />
                                    <p className="text-xs text-zinc-500 mt-2 italic">
                                        {t("workOrders.serializedQtyNote")}
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                                        {t("workOrders.initialQuantity")}
                                    </label>
                                    <input
                                        type="number"
                                        value={addQuantity}
                                        onChange={(e) =>
                                            setAddQuantity(
                                                parseInt(e.target.value),
                                            )
                                        }
                                        className="w-full bg-zinc-950 border border-white/[0.06] rounded-lg px-4 py-3 text-white focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <Button
                                variant="ghost"
                                onClick={() => setIsAddModalOpen(false)}
                            >
                                {t("common:cancel")}
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleAddModel}
                                disabled={
                                    !selectedModelId ||
                                    (isIndividual &&
                                        !selectedPhysicalProductId) ||
                                    isUpdating
                                }
                            >
                                {t("workOrders.addToBatch")}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
