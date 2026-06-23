import { useForm } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FormPage } from "../../../components/ui/FormPage";
import { FormSection } from "../../../components/ui/FormSection";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { FormErrorBanner } from "../../../components/ui/ErrorState";

export const SupplierEdit = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const navigate = useNavigate();
    const { id } = useParams();

    const [name, setName] = useState("");
    const [vatNumber, setVatNumber] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [isActive, setIsActive] = useState<string | number>("true");

    const { onFinish, queryResult, mutationResult, formLoading } = useForm({
        action: "edit",
        resource: "suppliers",
        id,
        redirect: false,
        onMutationSuccess: () => {
            navigate("/suppliers");
        },
    });

    const record = queryResult?.data?.data;

    useEffect(() => {
        if (record) {
            // Hydrate form fields from the fetched record (async fetch → setState).
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setName(record.name || "");
            setVatNumber(record.vat_number || "");
            setEmail(record.email || "");
            setPhone(record.phone || "");
            setIsActive(record.is_active === false ? "false" : "true");
        }
    }, [record]);

    const handleSubmit = async () => {
        await onFinish({
            name,
            vat_number: vatNumber,
            email,
            phone,
            is_active: isActive === "true",
        });
    };

    if (formLoading) {
        return <div className="p-12 text-center text-zinc-500">{t("common:loading")}</div>;
    }

    return (
        <FormPage
            title={t("suppliers.editSupplierTitle")}
            onSubmit={handleSubmit}
            isLoading={mutationResult.isLoading || formLoading}
            onCancel={() => navigate("/suppliers")}
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
                <Select
                    custom
                    label={t("suppliers.status")}
                    value={isActive}
                    onChange={(val) => setIsActive(val)}
                    options={[
                        { value: "true", label: t("suppliers.active") },
                        { value: "false", label: t("suppliers.inactive") },
                    ]}
                />
            </FormSection>
        </FormPage>
    );
};
