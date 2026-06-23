import { useList } from "@refinedev/core";
import { useTranslation } from "react-i18next";
import { Select } from "../../../../components/ui/Select";
import type { WorkOrderSerialOption } from "../listTypes";

interface SerialPickerProps {
    modelId: string;
    onChange: (value: string) => void;
    excludeIds: string[];
}

export const SerialPicker = ({ modelId, onChange, excludeIds }: SerialPickerProps) => {
    const { t } = useTranslation(["inventory", "common"]);
    const { data: physicalProducts } = useList<WorkOrderSerialOption>({
        resource: "physical-products",
        filters: [
            { field: "product_model", operator: "eq", value: modelId },
            { field: "status", operator: "eq", value: "ACTIVE" }
        ],
        queryOptions: {
            enabled: !!modelId
        },
        pagination: { mode: "off" }
    });

    const options = (physicalProducts?.data || [])
        .filter((p) => !excludeIds.includes(p.id))
        .map((p) => ({
            label: p.identifier ?? "",
            value: p.id
        }));

    return (
        <Select
            value=""
            onChange={(val) => {
                if (val) onChange(String(val));
            }}
            placeholder={t("workOrders.addSerialPlaceholder")}
            options={options}
        />
    );
};
