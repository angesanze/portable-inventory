import { useForm } from "@refinedev/core";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OrderForm } from "./OrderForm";
import { buildOrderPayload, emptyLine, type LineDraft } from "./orderForm";

export const SalesOrderCreate = () => {
    const { t } = useTranslation(["sales", "common"]);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const prefillProductId = searchParams.get("product_id");
    const prefillQty = searchParams.get("qty");

    const [customerId, setCustomerId] = useState("");
    const [promisedAt, setPromisedAt] = useState("");
    const [notes, setNotes] = useState("");
    const [lines, setLines] = useState<LineDraft[]>([
        prefillProductId
            ? {
                  ...emptyLine(),
                  product_model_id: prefillProductId,
                  quantity_ordered: prefillQty && parseFloat(prefillQty) > 0 ? prefillQty : "1",
              }
            : emptyLine(),
    ]);

    const { onFinish, mutationResult } = useForm({
        action: "create",
        resource: "sales-orders",
        redirect: false,
        onMutationSuccess: () => navigate("/sales"),
    });

    const handleSubmit = async () => {
        await onFinish(buildOrderPayload({ customerId, promisedAt, notes, lines }));
    };

    return (
        <OrderForm
            title={t("form.createTitle")}
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
            isLoading={mutationResult.isLoading}
            error={mutationResult?.isError ? mutationResult.error : undefined}
        />
    );
};
