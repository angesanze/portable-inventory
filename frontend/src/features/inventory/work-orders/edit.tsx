import { useForm } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader } from "lucide-react";
import { FormPage } from "../../../components/ui/FormPage";
import { FormSection } from "../../../components/ui/FormSection";
import { Input, Textarea } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { FormErrorBanner } from "../../../components/ui/ErrorState";

export const WorkOrderEdit = () => {
    const { t } = useTranslation(["inventory", "common"]);
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
    const { id } = useParams();

    const { onFinish, queryResult, formLoading, mutationResult } = useForm({
        action: "edit",
        resource: "work-orders",
        id: id,
        redirect: false,
    });

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [status, setStatus] = useState<string | number>("OPEN");

    useEffect(() => {
        if (queryResult?.data?.data) {
            const record = queryResult.data.data;
            setName(record.name || "");
            setDescription(record.description || "");
            setStatus(record.status || "OPEN");
        }
    }, [queryResult]);

    const handleSubmit = async () => {
        const data: Record<string, any> = {};
        if (name) data.name = name;
        if (description) data.description = description;
        if (status) data.status = status;

        await onFinish(data);
        navigate("/work-orders");
    };

    if (formLoading) {
        return (
            <div className="flex items-center justify-center h-screen text-zinc-500 gap-3">
                <Loader className="animate-spin" size={20} /> {t("workOrders.loadingWorkOrder")}
            </div>
        );
    }

    const isLoading = mutationResult.isLoading;

    return (
        <FormPage
            title={t("workOrders.editWorkOrder")}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            onCancel={() => navigate("/work-orders")}
        >
            {mutationResult?.isError && (
                <FormErrorBanner
                    title={t("workOrders.errorSaving")}
                    error={mutationResult.error}
                    fallbackMessage={t("workOrders.errorSavingFallback")}
                />
            )}

            <FormSection
                title={t("workOrders.workOrderDetails")}
                description={t("workOrders.editDetailsDesc")}
            >
                <Input
                    label={t("common:name")}
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
        </FormPage>
    );
};
