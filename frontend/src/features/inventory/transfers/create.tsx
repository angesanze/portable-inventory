import { useForm } from "@refinedev/core";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TransferForm } from "./TransferForm";
import { buildTransferPayload, emptyLine, type LineDraft } from "./transferForm";

export const TransferOrderCreate = () => {
    const { t } = useTranslation(["transfers", "common"]);
    const navigate = useNavigate();

    const [fromLocationId, setFromLocationId] = useState("");
    const [toLocationId, setToLocationId] = useState("");
    const [notes, setNotes] = useState("");
    const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

    const { onFinish, mutationResult } = useForm({
        action: "create",
        resource: "transfer-orders",
        redirect: false,
        onMutationSuccess: () => navigate("/transfers"),
    });

    const handleSubmit = async () => {
        await onFinish(
            buildTransferPayload({ fromLocationId, toLocationId, notes, lines }),
        );
    };

    return (
        <TransferForm
            title={t("form.createTitle")}
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
            isLoading={mutationResult.isLoading}
            error={mutationResult?.isError ? mutationResult.error : undefined}
        />
    );
};
