import { useForm } from "@refinedev/core";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormPage } from "../../../components/ui/FormPage";
import { FormSection } from "../../../components/ui/FormSection";
import { Input } from "../../../components/ui/Input";
import { FormErrorBanner } from "../../../components/ui/ErrorState";

export const SupplierCreate = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = searchParams.get("returnTo");

    const [name, setName] = useState("");
    const [vatNumber, setVatNumber] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");

    const { onFinish, mutationResult } = useForm({
        action: "create",
        resource: "suppliers",
        redirect: false,
        onMutationSuccess: (data: any) => {
            const back = decodeURIComponent(returnTo || "/suppliers");
            navigate(
                returnTo
                    ? `${back}${back.includes("?") ? "&" : "?"}created_supplier=${data.data.id}`
                    : "/suppliers",
            );
        },
    });

    const handleSubmit = async () => {
        await onFinish({
            name,
            vat_number: vatNumber,
            email,
            phone,
        });
    };

    return (
        <FormPage
            title={t("suppliers.newSupplierTitle")}
            onSubmit={handleSubmit}
            isLoading={mutationResult.isLoading}
            onCancel={() => navigate(decodeURIComponent(returnTo || "/suppliers"))}
        >
            {mutationResult?.isError && (
                <FormErrorBanner
                    title={t("suppliers.errorCreating")}
                    error={mutationResult.error}
                    fallbackMessage={t("suppliers.errorCreatingFallback")}
                />
            )}

            <FormSection
                title={t("suppliers.detailsTitle")}
                description={t("suppliers.detailsDesc")}
            >
                <Input
                    label={t("common:name")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("suppliers.namePlaceholder")}
                    required
                />
                <Input
                    label={t("suppliers.vatNumber")}
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                    placeholder={t("suppliers.vatPlaceholder")}
                    className="font-mono"
                />
                <Input
                    label={t("suppliers.email")}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("suppliers.emailPlaceholder")}
                />
                <Input
                    label={t("suppliers.phone")}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t("suppliers.phonePlaceholder")}
                />
            </FormSection>
        </FormPage>
    );
};
