import { useForm } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TransferForm } from "./TransferForm";
import { buildTransferPayload, emptyLine, type LineDraft } from "./transferForm";
import type { TransferOrderRecord } from "./types";

export const TransferOrderEdit = () => {
    const { t } = useTranslation(["transfers", "common"]);
    const navigate = useNavigate();
    const { id } = useParams();

    const [fromLocationId, setFromLocationId] = useState("");
    const [toLocationId, setToLocationId] = useState("");
    const [notes, setNotes] = useState("");
    const [lines, setLines] = useState<LineDraft[]>([]);

    const { onFinish, queryResult, mutationResult, formLoading } = useForm<TransferOrderRecord>({
        action: "edit",
        resource: "transfer-orders",
        id,
        redirect: false,
        onMutationSuccess: () => navigate("/transfers"),
    });

    const record = queryResult?.data?.data;

    useEffect(() => {
        if (!record) return;
        // Only DRAFT transfers are editable; everything else goes to receive.
        if (record.status && record.status !== "DRAFT") {
            navigate(`/transfers/receive/${record.id}`, { replace: true });
            return;
        }
        setFromLocationId(record.from_location ?? "");
        setToLocationId(record.to_location ?? "");
        setNotes(record.notes ?? "");
        setLines(
            (record.lines ?? []).map((l) => ({
                _key: emptyLine()._key,
                product_model_id: l.product_model ?? "",
                quantity_sent: String(l.quantity_sent ?? "1"),
            })),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [record]);

    const handleSubmit = async () => {
        await onFinish(
            buildTransferPayload({ fromLocationId, toLocationId, notes, lines }),
        );
    };

    if (formLoading) {
        return <div className="p-12 text-center text-zinc-500">{t("common:loading")}</div>;
    }

    return (
        <TransferForm
            title={t("form.editTitle")}
            fromLocationId={fromLocationId}
            setFromLocationId={setFromLocationId}
            toLocationId={toLocationId}
            setToLocationId={setToLocationId}
            notes={notes}
            setNotes={setNotes}
            lines={lines}
            setLines={setLines}
            onSubmit={handleSubmit}
            onCancel={() => navigate("/transfers")}
            isLoading={mutationResult.isLoading || formLoading}
            error={mutationResult?.isError ? mutationResult.error : undefined}
        />
    );
};
