import type { TFunction } from "i18next";
import { Edit2, Trash2, CheckCircle, Archive, Truck } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import type { WorkOrderRecord } from "./showTypes";

interface WorkOrderActionsProps {
    t: TFunction;
    order: WorkOrderRecord | undefined;
    id: string | undefined;
    isUpdating: boolean;
    navigate: (path: string) => void;
    onFulfill: () => void;
    onStatusChange: (newStatus: string) => void;
    onDelete: () => void;
}

export const WorkOrderActions = ({
    t,
    order,
    id,
    isUpdating,
    navigate,
    onFulfill,
    onStatusChange,
    onDelete,
}: WorkOrderActionsProps) => {
    return (
        <>
            <Button
                variant="secondary"
                icon={Edit2}
                onClick={() => navigate(`/work-orders/edit/${id}`)}
            >
                {t("common:edit")}
            </Button>
            {order?.status === "OPEN" && (
                <Button
                    variant="primary"
                    icon={Truck}
                    onClick={onFulfill}
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
                    onClick={() => onStatusChange("CLOSED")}
                >
                    {t("workOrders.complete")}
                </Button>
            )}
            {order?.status === "CLOSED" && (
                <Button
                    variant="secondary"
                    icon={Archive}
                    onClick={() => onStatusChange("ARCHIVED")}
                >
                    {t("workOrders.archive")}
                </Button>
            )}
            <Button variant="danger" icon={Trash2} onClick={onDelete}>
                {t("common:delete")}
            </Button>
        </>
    );
};
