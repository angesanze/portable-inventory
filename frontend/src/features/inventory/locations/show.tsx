import { useOne, useList, useDelete } from "@refinedev/core";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
    MapPin,
    ArrowRight,
    Activity,
    Edit2,
    Trash2,
    Package,
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

function typeVariant(type: string): BadgeVariant {
    switch (type) {
        case "WAREHOUSE": return "indigo";
        case "STORE": return "cyan";
        case "PHYSICAL": return "emerald";
        case "LOSS": return "rose";
        case "VIRTUAL": return "neutral";
        default: return "neutral";
    }
}

function typeLabel(type: string, t: TFunction): string {
    switch (type) {
        case "WAREHOUSE": return t("locations.warehouse");
        case "STORE": return t("locations.store");
        case "PHYSICAL": return t("locations.physical");
        case "LOSS": return t("locations.loss");
        case "VIRTUAL": return t("locations.virtual");
        default: return type || t("locations.unknown");
    }
}

export const LocationShow = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const { id } = useParams();
    const navigate = useNavigate();
    const { mutate: deleteLocation } = useDelete();
    const { confirm, dialogProps } = useConfirmDialog();

    const { data: record, isLoading } = useOne({
        resource: "locations",
        id: id as string,
        queryOptions: { enabled: !!id },
    });

    const { data: stockData, isLoading: isLoadingStock } = useList({
        resource: "physical-products",
        filters: [{ field: "location", operator: "eq", value: id }],
        pagination: { mode: "off" },
        queryOptions: { enabled: !!id },
    });

    const { data: movementsData, isLoading: isLoadingMovements } = useList({
        resource: "movements",
        filters: [{ field: "location", operator: "eq", value: id }],
        sorters: [{ field: "occurred_at", order: "desc" }],
        pagination: { current: 1, pageSize: 10 },
        queryOptions: { enabled: !!id },
    });

    const location = record?.data as any;
    const inventory = Array.isArray(stockData?.data) ? stockData.data : [];
    const movements = Array.isArray(movementsData?.data)
        ? movementsData.data
        : [];

    if (!location && !isLoading) {
        return (
            <div className="p-8 text-center text-zinc-500">
                {t("locations.notFound")}
            </div>
        );
    }

    const handleDelete = async () => {
        const confirmed = await confirm({
            title: t("locations.deleteTitle"),
            message: t("locations.deleteConfirmNamed", { name: location?.name }),
            confirmLabel: t("common:delete"),
            variant: "danger",
        });
        if (confirmed) {
            deleteLocation(
                { resource: "locations", id: id as string },
                { onSuccess: () => navigate("/locations") },
            );
        }
    };

    return (
        <>
            <DetailPage
                title={location?.name ?? ""}
                badges={
                    location?.type
                        ? [
                              {
                                  label: typeLabel(location.type, t),
                                  variant: typeVariant(location.type),
                              },
                          ]
                        : []
                }
                actions={
                    <>
                        <Button
                            variant="secondary"
                            icon={Edit2}
                            onClick={() => navigate(`/locations/edit/${id}`)}
                        >
                            {t("common:edit")}
                        </Button>
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
                            {t("locations.details")}
                        </h3>
                    }
                >
                    <KeyValueGrid
                        items={[
                            { label: t("common:name"), value: location?.name },
                            {
                                label: t("common:type"),
                                value: location?.type
                                    ? typeLabel(location.type, t)
                                    : undefined,
                            },
                            {
                                label: t("locations.parentLocation"),
                                value: location?.parent_name || undefined,
                            },
                            {
                                label: t("common:created"),
                                value: location?.created_at
                                    ? new Date(
                                          location.created_at,
                                      ).toLocaleString()
                                    : undefined,
                            },
                        ]}
                    />
                </Card>

                {/* Current Inventory */}
                <Card
                    padding="none"
                    header={
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                                <Package
                                    size={16}
                                    className="text-emerald-400"
                                />
                                {t("locations.currentInventory")}
                            </h3>
                            <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                                {t("locations.itemCount", { count: inventory.length })}
                            </span>
                        </div>
                    }
                >
                    {isLoadingStock ? (
                        <SkeletonList items={3} />
                    ) : inventory.length === 0 ? (
                        <div className="p-8 text-center">
                            <Package
                                size={32}
                                className="mx-auto mb-3 text-zinc-600"
                            />
                            <p className="text-zinc-500">
                                {t("locations.noInventory")}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/[0.06]">
                            {inventory.map((item: any) => (
                                <div
                                    key={item.id}
                                    className="px-5 py-4 hover:bg-white/5 transition-colors flex items-center justify-between"
                                >
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-zinc-200">
                                            {item.product_model_name ||
                                                item.name ||
                                                item.sku ||
                                                t("locations.unknownProduct")}
                                        </div>
                                        {item.serial_number && (
                                            <div className="text-xs text-zinc-500 mt-0.5 font-mono">
                                                {t("locations.snLabel")} {item.serial_number}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        {item.status && (
                                            <Badge variant="neutral">
                                                {item.status}
                                            </Badge>
                                        )}
                                        {item.quantity != null && (
                                            <span className="font-mono font-bold text-zinc-50">
                                                {Number(
                                                    item.quantity,
                                                ).toLocaleString()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                {/* Recent Activity */}
                <Card
                    padding="none"
                    header={
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                                <Activity
                                    size={16}
                                    className="text-cyan-400"
                                />
                                {t("locations.recentActivity")}
                            </h3>
                            <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                                {t("locations.last", { count: movements.length })}
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
                                {t("locations.noActivity")}
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
                                                        t("locations.unknownProduct")}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-zinc-500">
                                                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-white/[0.06] text-zinc-300">
                                                        {m.from_location
                                                            ?.name || "—"}
                                                    </span>
                                                    <ArrowRight
                                                        size={12}
                                                        className="text-zinc-600"
                                                    />
                                                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-white/[0.06] text-zinc-300">
                                                        {m.to_location?.name ||
                                                            "—"}
                                                    </span>
                                                </div>
                                                {m.reason && (
                                                    <p className="text-xs text-zinc-500 mt-1 truncate">
                                                        {m.reason}
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
                                                <div className="text-[10px] text-zinc-600 mt-1 font-mono">
                                                    {new Date(
                                                        m.occurred_at,
                                                    ).toLocaleString()}
                                                </div>
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
        </>
    );
};
