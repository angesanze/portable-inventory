import { useForm } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { OrderForm, buildOrderPayload, type LineDraft } from "./OrderForm";

export const SalesOrderEdit = () => {
    const { t } = useTranslation(["sales", "common"]);
    const navigate = useNavigate();
    const { id } = useParams();

    const [customerId, setCustomerId] = useState("");
    const [promisedAt, setPromisedAt] = useState("");
    const [notes, setNotes] = useState("");
    const [lines, setLines] = useState<LineDraft[]>([]);

    const { onFinish, queryResult, mutationResult, formLoading } = useForm({
        action: "edit",
        resource: "sales-orders",
        id,
        redirect: false,
        onMutationSuccess: () => navigate("/sales"),
    });

    const record = queryResult?.data?.data as any;

    useEffect(() => {
        if (!record) return;
        // Only DRAFT orders are editable; the backend rejects everything else.
        if (record.status && record.status !== "DRAFT") {
            navigate(`/sales/${record.id}`, { replace: true });
            return;
        }
        setCustomerId(record.customer ?? "");
        setPromisedAt(record.promised_at ?? "");
        setNotes(record.notes ?? "");
        setLines(
            (record.lines ?? []).map((l: any) => ({
                product_model_id: l.product_model ?? "",
                quantity_ordered: String(l.quantity_ordered ?? "1"),
                unit_price: l.unit_price == null ? "" : String(l.unit_price),
            })),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [record]);

    const handleSubmit = async () => {
        await onFinish(buildOrderPayload({ customerId, promisedAt, notes, lines }));
    };

    if (formLoading) {
        return <div className="p-12 text-center text-zinc-500">{t("common:loading")}</div>;
    }

    return (
        <OrderForm
            title={t("form.editTitle")}
            customerId={customerId}
            setCustomerId={setCustomerId}
            promisedAt={promisedAt}
            setPromisedAt={setPromisedAt}
            notes={notes}
            setNotes={setNotes}
            lines={lines}
            setLines={setLines}
            onSubmit={handleSubmit}
            onCancel={() => navigate("/sales")}
            isLoading={mutationResult.isLoading || formLoading}
            error={mutationResult?.isError ? mutationResult.error : undefined}
        />
    );
};
