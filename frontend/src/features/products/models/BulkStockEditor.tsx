import { useState } from "react";
import { useList, useNotification } from "@refinedev/core";
import { useTranslation } from "react-i18next";
import { Edit2 } from "lucide-react";

import { axiosInstance } from "../../../providers/axios-client";
import { Button } from "../../../components/ui/Button";

/**
 * Inline editor for BULK (non-batch, non-serialized) stock totals.
 *
 * The ledger is immutable, so a manual edit is translated into an adjustment
 * movement of the delta between the desired total and the current total, applied
 * against a default physical location.
 */
export function BulkStockEditor({
    productId,
    currentTotal,
    onUpdated,
}: {
    productId: string;
    currentTotal: number;
    onUpdated: () => void;
}) {
    const { t } = useTranslation(["products", "common"]);
    const { open } = useNotification();
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState<string>(String(currentTotal));
    const [saving, setSaving] = useState(false);

    // Prefer a WAREHOUSE, but fall back to any non-virtual location so companies
    // without a WAREHOUSE-typed location (PHYSICAL/STORE only) can still adjust
    // stock — matching the backend, which accepts
    // type__in=['WAREHOUSE','PHYSICAL','STORE'].
    const { data: locationData } = useList({
        resource: "locations",
        pagination: { pageSize: 50 },
    });
    const locations = (locationData?.data ?? []) as Array<{ id: string; type: string }>;
    const defaultLocationId = (
        locations.find((l) => l.type === "WAREHOUSE") ??
        locations.find((l) => l.type !== "VIRTUAL" && l.type !== "LOSS")
    )?.id;

    const startEdit = () => {
        setValue(String(currentTotal));
        setEditing(true);
    };

    const save = async () => {
        const target = parseFloat(value);
        if (isNaN(target) || target < 0) {
            open?.({
                message: t("common:error"),
                description: t("products:invalidQuantity"),
                type: "error",
            });
            return;
        }
        const delta = target - currentTotal;
        if (delta === 0) {
            setEditing(false);
            return;
        }
        if (!defaultLocationId) {
            open?.({
                message: t("common:error"),
                description: t("products:noWarehouseForAdjust"),
                type: "error",
            });
            return;
        }
        setSaving(true);
        try {
            await axiosInstance.post(`/api/v1/widget/move/`, {
                product_id: productId,
                quantity: delta,
                location_id: defaultLocationId,
                // Manual giacenza edit is a rettifica, not a vendor receipt.
                counterparty: "ADJUSTMENT",
                reason: t("products:manualStockAdjustment"),
            });
            open?.({
                message: t("common:success"),
                description: t("products:stockUpdated"),
                type: "success",
            });
            setEditing(false);
            onUpdated();
        } catch (err: any) {
            open?.({
                message: t("common:error"),
                description:
                    err?.response?.data?.detail ||
                    err?.response?.data?.[0] ||
                    t("products:adjustmentFailed"),
                type: "error",
            });
        } finally {
            setSaving(false);
        }
    };

    if (!editing) {
        return (
            <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={Edit2}
                onClick={startEdit}
            >
                {t("products:editStock")}
            </Button>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <input
                type="number"
                min="0"
                value={value}
                autoFocus
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        // Prevent submitting an enclosing form (e.g. the edit page).
                        e.preventDefault();
                        save();
                    }
                }}
                className="w-28 bg-zinc-950 border border-white/[0.06] rounded-lg px-3 py-1.5 text-white text-sm focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none font-mono"
            />
            <Button type="button" size="sm" loading={saving} onClick={save}>
                {t("common:save")}
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => setEditing(false)}
            >
                {t("common:cancel")}
            </Button>
        </div>
    );
}
