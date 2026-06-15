import { useForm } from "@refinedev/core";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormPage } from "../../components/ui/FormPage";
import { FormSection } from "../../components/ui/FormSection";
import { Input } from "../../components/ui/Input";
import { FormErrorBanner } from "../../components/ui/ErrorState";

/**
 * Developer-only tenant create form (DUAL-TIER-07). Posts `{ name }` to the
 * `tenants` resource — the backend forces `account_type='manager'` and parents
 * the new company to the calling developer. On success we return to the list,
 * which refetches and shows the new tenant.
 */
export const TenantCreate = () => {
    const { t } = useTranslation(["settings", "common"]);
    const navigate = useNavigate();
    const [name, setName] = useState("");

    const { onFinish, mutationResult } = useForm({
        action: "create",
        resource: "tenants",
        redirect: false,
        onMutationSuccess: () => {
            navigate("/tenants");
        },
    });

    const handleSubmit = async () => {
        await onFinish({ name });
    };

    return (
        <FormPage
            title={t("settings:tenants.createTitle")}
            onSubmit={handleSubmit}
            isLoading={mutationResult.isLoading}
            onCancel={() => navigate("/tenants")}
        >
            {mutationResult?.isError && (
                <FormErrorBanner
                    title={t("settings:tenants.errorCreating")}
                    error={mutationResult.error}
                    fallbackMessage={t("settings:tenants.errorCreatingFallback")}
                />
            )}

            <FormSection
                title={t("settings:tenants.detailsTitle")}
                description={t("settings:tenants.detailsDesc")}
            >
                <Input
                    label={t("settings:tenants.nameLabel")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("settings:tenants.namePlaceholder")}
                    required
                />
            </FormSection>
        </FormPage>
    );
};
