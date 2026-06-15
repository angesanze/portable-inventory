import { useForm } from "@refinedev/core";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OrderForm, buildOrderPayload, emptyLine, type LineDraft } from "./OrderForm";

export const PurchaseOrderCreate = () => {
    const { t } = useTranslation(["purchasing", "common"]);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Restock Kanban hands off ?product_id=…&qty=… — prefill the first line
    // so a CRITICAL card becomes a DRAFT order in two clicks.
    const prefillProductId = searchParams.get("product_id");
    const prefillQty = searchParams.get("qty");

    const [supplierId, setSupplierId] = useState("");
    const [expectedAt, setExpectedAt] = useState("");
    const [notes, setNotes] = useState("");
    const [lines, setLines] = useState<LineDraft[]>([
        prefillProductId
            ? {
                  product_model_id: prefillProductId,
                  quantity_ordered: prefillQty && parseFloat(prefillQty) > 0 ? prefillQty : "1",
                  unit_cost: "",
              }
            : emptyLine(),
    ]);

    const { onFinish, mutationResult } = useForm({
        action: "create",
        resource: "purchase-orders",
        redirect: false,
        onMutationSuccess: () => navigate("/purchasing"),
    });

    const handleSubmit = async () => {
        await onFinish(buildOrderPayload({ supplierId, expectedAt, notes, lines }));
    };

    return (
        <OrderForm
            title={t("form.createTitle")}
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
            isLoading={mutationResult.isLoading}
            error={mutationResult?.isError ? mutationResult.error : undefined}
        />
    );
};
