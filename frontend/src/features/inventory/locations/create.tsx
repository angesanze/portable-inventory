import { useForm, useList } from "@refinedev/core";
import type { CreateResponse, UpdateResponse } from "@refinedev/core";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormPage } from "../../../components/ui/FormPage";
import { FormSection } from "../../../components/ui/FormSection";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import type { LocationRow } from "./types";

export const LocationCreate = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = searchParams.get("returnTo");

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

    const { onFinish, mutationResult } = useForm({
        action: "create",
        resource: "locations",
        redirect: false,
        onMutationSuccess: (
            data: CreateResponse<{ id: string }> | UpdateResponse<{ id: string }>,
        ) => {
            const back = decodeURIComponent(returnTo || "/locations");
            navigate(
                returnTo
                    ? `${back}${back.includes("?") ? "&" : "?"}created_location=${data.data.id}`
                    : "/locations",
            );
        },
    });

    const { data: locationsData } = useList<LocationRow>({
        resource: "locations",
        pagination: { mode: "off" },
    });

    const parentOptions = (locationsData?.data || []).map((loc) => ({
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

    const isLoading = mutationResult.isLoading;

    return (
        <FormPage
            title={t("locations.newLocation")}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            onCancel={() => navigate(decodeURIComponent(returnTo || "/locations"))}
        >
            {mutationResult?.isError && (
                <FormErrorBanner
                    title={t("locations.errorCreating")}
                    error={mutationResult.error}
                    fallbackMessage={t("locations.errorCreatingFallback")}
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
