import { useForm } from "@refinedev/core";
import type { CreateResponse, UpdateResponse } from "@refinedev/core";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormPage } from "../../../components/ui/FormPage";
import { FormSection } from "../../../components/ui/FormSection";
import { Input } from "../../../components/ui/Input";
import { FormErrorBanner } from "../../../components/ui/ErrorState";

export const CustomerCreate = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = searchParams.get("returnTo");

    const [name, setName] = useState("");
    const [vatNumber, setVatNumber] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [address, setAddress] = useState("");

    const { onFinish, mutationResult } = useForm({
        action: "create",
        resource: "customers",
        redirect: false,
        onMutationSuccess: (
            data: CreateResponse<{ id: string }> | UpdateResponse<{ id: string }>,
        ) => {
            const back = decodeURIComponent(returnTo || "/customers");
            navigate(
                returnTo
                    ? `${back}${back.includes("?") ? "&" : "?"}created_customer=${data.data.id}`
                    : "/customers",
            );
        },
    });

    const handleSubmit = async () => {
        await onFinish({
            name,
            vat_number: vatNumber,
            email,
            phone,
            address,
        });
    };

    return (
        <FormPage
            title={t("customers.newCustomerTitle")}
            onSubmit={handleSubmit}
            isLoading={mutationResult.isLoading}
            onCancel={() => navigate(decodeURIComponent(returnTo || "/customers"))}
        >
            {mutationResult?.isError && (
                <FormErrorBanner
                    title={t("customers.errorCreating")}
                    error={mutationResult.error}
                    fallbackMessage={t("customers.errorCreatingFallback")}
                />
            )}

            <FormSection
                title={t("customers.detailsTitle")}
                description={t("customers.detailsDesc")}
            >
                <Input
                    label={t("common:name")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("customers.namePlaceholder")}
                    required
                />
                <Input
                    label={t("customers.vatNumber")}
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                    placeholder={t("customers.vatPlaceholder")}
                    className="font-mono"
                />
                <Input
                    label={t("customers.email")}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("customers.emailPlaceholder")}
                />
                <Input
                    label={t("customers.phone")}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t("customers.phonePlaceholder")}
                />
                <Input
                    label={t("customers.address")}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={t("customers.addressPlaceholder")}
                />
            </FormSection>
        </FormPage>
    );
};
