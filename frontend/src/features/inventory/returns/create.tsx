import { useForm } from "@refinedev/core";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ReturnForm,
    buildReturnPayload,
    emptyLine,
    type ReturnKind,
    type ReturnLineDraft,
} from "./ReturnForm";

export const ReturnOrderCreate = () => {
    const { t } = useTranslation(["returns", "common"]);
    const navigate = useNavigate();

    const [kind, setKind] = useState<ReturnKind>("CUSTOMER_RETURN");
    const [customerId, setCustomerId] = useState("");
    const [supplierId, setSupplierId] = useState("");
    const [reasonCode, setReasonCode] = useState("OTHER");
    const [salesOrderId, setSalesOrderId] = useState("");
    const [purchaseOrderId, setPurchaseOrderId] = useState("");
    const [notes, setNotes] = useState("");
    const [lines, setLines] = useState<ReturnLineDraft[]>([emptyLine()]);

    const { onFinish, mutationResult } = useForm({
        action: "create",
        resource: "return-orders",
        redirect: false,
        onMutationSuccess: () => navigate("/returns"),
    });

    const handleSubmit = async () => {
        await onFinish(
            buildReturnPayload({
                kind,
                customerId,
                supplierId,
                reasonCode,
                salesOrderId,
                purchaseOrderId,
                notes,
                lines,
            }),
        );
    };

    return (
        <ReturnForm
            title={t("form.createTitle")}
            kind={kind}
            setKind={setKind}
            customerId={customerId}
            setCustomerId={setCustomerId}
            supplierId={supplierId}
            setSupplierId={setSupplierId}
            reasonCode={reasonCode}
            setReasonCode={setReasonCode}
            salesOrderId={salesOrderId}
            setSalesOrderId={setSalesOrderId}
            purchaseOrderId={purchaseOrderId}
            setPurchaseOrderId={setPurchaseOrderId}
            notes={notes}
            setNotes={setNotes}
            lines={lines}
            setLines={setLines}
            onSubmit={handleSubmit}
            onCancel={() => navigate("/returns")}
            isLoading={mutationResult.isLoading}
            error={mutationResult?.isError ? mutationResult.error : undefined}
        />
    );
};
