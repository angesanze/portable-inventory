import { useForm, useOne } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ReturnForm,
    buildReturnPayload,
    emptyLine,
    type ReturnKind,
    type ReturnLineDraft,
} from "./ReturnForm";

export const ReturnOrderEdit = () => {
    const { t } = useTranslation(["returns", "common"]);
    const navigate = useNavigate();
    const { id } = useParams();

    const { data } = useOne({
        resource: "return-orders",
        id: id ?? "",
        queryOptions: { enabled: !!id },
    });
    const order = data?.data as any;

    const [kind, setKind] = useState<ReturnKind>("CUSTOMER_RETURN");
    const [customerId, setCustomerId] = useState("");
    const [supplierId, setSupplierId] = useState("");
    const [reasonCode, setReasonCode] = useState("OTHER");
    const [salesOrderId, setSalesOrderId] = useState("");
    const [purchaseOrderId, setPurchaseOrderId] = useState("");
    const [notes, setNotes] = useState("");
    const [lines, setLines] = useState<ReturnLineDraft[]>([emptyLine()]);

    useEffect(() => {
        if (!order) return;
        setKind(order.kind);
        setCustomerId(order.customer ?? "");
        setSupplierId(order.supplier ?? "");
        setReasonCode(order.reason_code ?? "OTHER");
        setSalesOrderId(order.sales_order ?? "");
        setPurchaseOrderId(order.purchase_order ?? "");
        setNotes(order.notes ?? "");
        setLines(
            (order.lines ?? []).map((l: any) => ({
                product_model_id:
                    typeof l.product_model === "string"
                        ? l.product_model
                        : l.product_model?.id ?? "",
                quantity: String(l.quantity),
            })),
        );
    }, [order]);

    const { onFinish, mutationResult } = useForm({
        action: "edit",
        resource: "return-orders",
        id: id ?? "",
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
