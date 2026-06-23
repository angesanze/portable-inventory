import { useForm, useList } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FormPage } from "../../../components/ui/FormPage";
import { FormSection } from "../../../components/ui/FormSection";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import type { LocationRow } from "./types";

export const LocationEdit = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const navigate = useNavigate();
    const { id } = useParams();

    const LOCATION_TYPE_OPTIONS = [
        {
            value: "WAREHOUSE",
            label: t("locations.warehouse"),
            description: t("locations.warehouseDesc"),
        },
        {
            value: "STORE",
            label: t("locations.store"),
            description: t("locations.storeDesc"),
        },
        {
            value: "LOSS",
            label: t("locations.loss"),
            description: t("locations.lossDesc"),
        },
        {
            value: "VIRTUAL",
            label: t("locations.virtual"),
            description: t("locations.virtualDesc"),
        },
    ];

    const [name, setName] = useState("");
    const [locationType, setLocationType] = useState<string | number>("WAREHOUSE");
    const [parentId, setParentId] = useState<string | number | null>(null);

    const { onFinish, queryResult, mutationResult, formLoading } = useForm({
        action: "edit",
        resource: "locations",
        id,
        redirect: false,
        onMutationSuccess: () => {
            navigate("/locations");
        },
    });

    const record = queryResult?.data?.data;

    useEffect(() => {
        if (record) {
            // Hydrate form fields from the fetched record (async fetch → setState).
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setName(record.name || "");
            setLocationType(record.type || "WAREHOUSE");
            setParentId(record.parent_id || null);
        }
    }, [record]);

    const { data: locationsData } = useList<LocationRow>({
        resource: "locations",
        pagination: { mode: "off" },
    });

    const parentOptions = (locationsData?.data || [])
        .filter((loc) => loc.id !== id)
        .map((loc) => ({
            label: loc.name,
            value: loc.id,
        }));

    const handleSubmit = async () => {
        await onFinish({
            name,
            type: locationType,
            parent_id: parentId || null,
        });
    };

    const isLoading = mutationResult.isLoading || formLoading;

    if (formLoading) {
        return <div className="p-12 text-center text-zinc-500">{t("common:loading")}</div>;
    }

    return (
        <FormPage
            title={t("locations.editLocation")}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            onCancel={() => navigate("/locations")}
        >
            {mutationResult?.isError && (
                <FormErrorBanner
                    title={t("locations.errorSaving")}
                    error={mutationResult.error}
                    fallbackMessage={t("locations.errorSavingFallback")}
                />
            )}

            <FormSection
                title={t("locations.detailsTitle")}
                description={t("locations.detailsDesc")}
            >
                <Input
                    label={t("common:name")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("locations.namePlaceholder")}
                    required
                />
                <Select
                    custom
                    label={t("common:type")}
                    value={locationType}
                    onChange={(val) => setLocationType(val)}
                    options={LOCATION_TYPE_OPTIONS}
                    required
                    helperText={t("locations.typeHelper")}
                />
                <Select
                    custom
                    label={t("locations.parentLocation")}
                    value={parentId}
                    onChange={(val) => setParentId(val)}
                    options={parentOptions}
                    placeholder={t("locations.parentPlaceholder")}
                    helperText={t("locations.parentHelper")}
                />
            </FormSection>
        </FormPage>
    );
};
