import type { TFunction } from "i18next";
import { Card } from "../../../components/ui/Card";
import { KeyValueGrid } from "../../../components/ui/KeyValueGrid";
import type { WorkOrderRecord } from "./showTypes";
import { statusExplanation } from "./workOrderStatus";

interface WorkOrderDetailsProps {
    t: TFunction;
    order: WorkOrderRecord | undefined;
}

export const WorkOrderDetails = ({ t, order }: WorkOrderDetailsProps) => {
    return (
        <>
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
                                ? new Date(order.created_at).toLocaleString()
                                : undefined,
                        },
                        {
                            label: t("common:updated"),
                            value: order?.updated_at
                                ? new Date(order.updated_at).toLocaleString()
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
        </>
    );
};
