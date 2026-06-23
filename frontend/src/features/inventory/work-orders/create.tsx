import { useForm, useList, useOne } from "@refinedev/core";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FormPage } from "../../../components/ui/FormPage";
import { FormSection } from "../../../components/ui/FormSection";
import { Input, Textarea } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import { InfoTip } from "../../../components/ui/InfoTip";
import { BatchLineItemsInput } from "./components/BatchLineItemsInput";
import type {
    WorkOrderProductModel,
    WorkOrderLineItem,
    WorkOrderPayloadItem,
} from "./listTypes";

// Persisted to the description field as a tag prefix (audit data) — kept in English.
const PURPOSE_LABELS: Record<string, string> = {
    assembly: "Assembly",
    kitting: "Kitting",
    fulfillment: "Fulfillment",
    production: "Production",
    other: "Other",
};

export const WorkOrderCreate = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const PURPOSE_OPTIONS = [
        {
            value: "assembly",
            label: t("workOrders.assembly"),
            description: t("workOrders.assemblyDesc"),
        },
        {
            value: "kitting",
            label: t("workOrders.kitting"),
            description: t("workOrders.kittingDesc"),
        },
        {
            value: "fulfillment",
            label: t("workOrders.fulfillment"),
            description: t("workOrders.fulfillmentDesc"),
        },
        {
            value: "production",
            label: t("workOrders.production"),
            description: t("workOrders.productionDesc"),
        },
        {
            value: "other",
            label: t("workOrders.other"),
            description: t("workOrders.otherDesc"),
        },
    ];
    const STATUS_OPTIONS = [
        {
            value: "OPEN",
            label: t("workOrders.open"),
            description: t("workOrders.statusOpenDesc"),
        },
        {
            value: "CLOSED",
            label: t("workOrders.closed"),
            description: t("workOrders.statusClosedDesc"),
        },
        {
            value: "ARCHIVED",
            label: t("workOrders.archived"),
            description: t("workOrders.statusArchivedDesc"),
        },
    ];
    const navigate = useNavigate();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [purpose, setPurpose] = useState<string | number | null>(null);
    const [status, setStatus] = useState<string | number>("OPEN");
    const [selectedModelId, setSelectedModelId] = useState<string | number | null>(null);
    const [items, setItems] = useState<WorkOrderLineItem[]>([]);

    const { onFinish, mutationResult } = useForm({
        action: "create",
        resource: "work-orders",
        redirect: false,
    });

    const { data: productModels } = useList<WorkOrderProductModel>({
        resource: "product-models",
        pagination: { mode: "off" },
    });

    const definitionOptions = (productModels?.data || [])
        .filter((p) => p.engine_type === "bucket")
        .map((p) => ({
            label: `${p.sku} - ${p.name}`,
            value: p.id,
        }));

    const componentOptions = (productModels?.data || [])
        .filter((p) => p.engine_type !== "bucket")
        .map((p) => ({
            label: `${p.sku} - ${p.name}`,
            value: p.id,
        }));

    const { data: selectedModelDetails } = useOne<WorkOrderProductModel>({
        resource: "product-models",
        id: selectedModelId as string,
        queryOptions: {
            enabled: !!selectedModelId,
        },
    });

    const lastProcessedModelId = useRef<string>("");

    useEffect(() => {
        if (selectedModelDetails?.data?.components && productModels?.data) {
            if (lastProcessedModelId.current === selectedModelId) return;

            const newItems: WorkOrderLineItem[] = selectedModelDetails.data.components.map((c) => ({
                product_model_id: c.child,
                quantity: parseFloat(String(c.quantity)),
                temp_serials: [],
                locked: true,
                key: Math.random(),
            }));

            // Seed line items from the fetched model's BOM; guarded by the ref
            // above so it runs once per model selection (async fetch → setState).
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setItems(newItems);
            lastProcessedModelId.current = selectedModelId as string;
        }
    }, [selectedModelDetails, productModels, selectedModelId]);

    const handleSubmit = async () => {
        try {
            const payloadItems: WorkOrderPayloadItem[] = [];

            items.forEach((item) => {
                const model = (productModels?.data || []).find(
                    (p) => p.id === item.product_model_id,
                );
                const isSerialized = model?.profile === "SERIALIZED" || model?.tracking_mode === "INDIVIDUAL";

                if (isSerialized) {
                    (item.temp_serials || []).forEach((sid: string) => {
                        payloadItems.push({
                            product_model_id: item.product_model_id,
                            quantity: 1,
                            physical_product_id: sid,
                        });
                    });
                } else {
                    payloadItems.push({
                        product_model_id: item.product_model_id,
                        quantity: item.quantity,
                        physical_product_id: "",
                    });
                }
            });

            const finalDescription = purpose
                ? `[${PURPOSE_LABELS[purpose as string] || purpose}] ${description}`.trim()
                : description;

            await onFinish({
                name,
                description: finalDescription,
                status,
                product_model: selectedModelId || null,
                items: payloadItems,
            });

            navigate("/work-orders");
        } catch (error) {
            console.error("Failed to create Work Order:", error);
        }
    };

    const isLoading = mutationResult.isLoading;

    return (
        <FormPage
            title={t("workOrders.createWorkOrder")}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            onCancel={() => navigate("/work-orders")}
        >
            {mutationResult?.isError && (
                <FormErrorBanner
                    title={t("workOrders.errorCreating")}
                    error={mutationResult.error}
                    fallbackMessage={t("workOrders.errorCreatingFallback")}
                />
            )}

            <FormSection
                title={t("workOrders.batchDefinition")}
                description={t("workOrders.batchDefinitionDesc")}
            >
                <Select
                    custom
                    label={t("workOrders.template")}
                    labelExtra={
                        <InfoTip content={t("workOrders.purposeHelp")} />
                    }
                    value={selectedModelId}
                    onChange={(val) => setSelectedModelId(val)}
                    options={definitionOptions}
                    placeholder={t("workOrders.customBatchPlaceholder")}
                    helperText={t("workOrders.templateHelper")}
                />
            </FormSection>

            <FormSection
                title={t("workOrders.workOrderDetails")}
                description={t("workOrders.workOrderDetailsDesc")}
            >
                <Select
                    custom
                    label={t("workOrders.purpose")}
                    labelExtra={
                        <InfoTip content={t("workOrders.purposeInfoHelp")} />
                    }
                    value={purpose}
                    onChange={(val) => setPurpose(val)}
                    options={PURPOSE_OPTIONS}
                    placeholder={t("workOrders.purposeNonePlaceholder")}
                    helperText={t("workOrders.purposeHelper")}
                />
                <Input
                    label={t("common:name")}
                    labelExtra={
                        <InfoTip content={t("workOrders.orderNameHelp")} />
                    }
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("workOrders.namePlaceholder")}
                    required
                />
                <Textarea
                    label={t("common:description")}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("workOrders.descriptionPlaceholder")}
                    rows={3}
                />
                <Select
                    custom
                    label={t("common:status")}
                    value={status}
                    onChange={(val) => setStatus(val)}
                    options={STATUS_OPTIONS}
                    required
                    helperText={t("workOrders.statusHelper")}
                />
            </FormSection>

            <FormSection
                title={t("workOrders.lineItems")}
                description={t("workOrders.lineItemsDesc")}
            >
                <BatchLineItemsInput
                    items={items}
                    setItems={setItems}
                    modelOptions={componentOptions}
                    productModelsRaw={productModels?.data || []}
                />
            </FormSection>
        </FormPage>
    );
};
