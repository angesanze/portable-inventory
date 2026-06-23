import { useForm } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { OrderForm } from "./OrderForm";
import { buildOrderPayload, type LineDraft } from "./orderForm";
import type { PurchaseOrderRecord } from "./types";

export const PurchaseOrderEdit = () => {
    const { t } = useTranslation(["purchasing", "common"]);
    const navigate = useNavigate();
    const { id } = useParams();

    const [supplierId, setSupplierId] = useState("");
    const [expectedAt, setExpectedAt] = useState("");
    const [notes, setNotes] = useState("");
    const [lines, setLines] = useState<LineDraft[]>([]);

    const { onFinish, queryResult, mutationResult, formLoading } = useForm<PurchaseOrderRecord>({
        action: "edit",
        resource: "purchase-orders",
        id,
        redirect: false,
        onMutationSuccess: () => navigate("/purchasing"),
    });

    const record = queryResult?.data?.data;

    useEffect(() => {
        if (!record) return;
        // Only DRAFT orders are editable; the backend rejects everything else.
        if (record.status && record.status !== "DRAFT") {
            navigate(`/purchasing/receive/${record.id}`, { replace: true });
            return;
        }
        setSupplierId(record.supplier ?? "");
        setExpectedAt(record.expected_at ?? "");
        setNotes(record.notes ?? "");
        // Hydrated rows intentionally carry no `_key` (key={index} fallback, as
        // before): the literal is structurally a keyless LineDraft, so the
        // assertion only re-adds the optional field the runtime omits here.
        const hydratedLines = (record.lines ?? []).map((l) => ({
            product_model_id: l.product_model ?? "",
            quantity_ordered: String(l.quantity_ordered ?? "1"),
            unit_cost: l.unit_cost == null ? "" : String(l.unit_cost),
        })) as LineDraft[];
        setLines(hydratedLines);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [record]);

    const handleSubmit = async () => {
        await onFinish(buildOrderPayload({ supplierId, expectedAt, notes, lines }));
    };

    if (formLoading) {
        return <div className="p-12 text-center text-zinc-500">{t("common:loading")}</div>;
    }

    return (
        <OrderForm
            title={t("form.editTitle")}
            supplierId={supplierId}
            setSupplierId={setSupplierId}
            expectedAt={expectedAt}
            setExpectedAt={setExpectedAt}
            notes={notes}
            setNotes={setNotes}
            lines={lines}
            setLines={setLines}
            onSubmit={handleSubmit}
            onCancel={() => navigate("/purchasing")}
            isLoading={mutationResult.isLoading || formLoading}
            error={mutationResult?.isError ? mutationResult.error : undefined}
        />
    );
};
