import { useForm } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FormPage } from "../../../components/ui/FormPage";
import { FormSection } from "../../../components/ui/FormSection";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { FormErrorBanner } from "../../../components/ui/ErrorState";

export const CustomerEdit = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const navigate = useNavigate();
    const { id } = useParams();

    const [name, setName] = useState("");
    const [vatNumber, setVatNumber] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [address, setAddress] = useState("");
    const [isActive, setIsActive] = useState<string | number>("true");

    const { onFinish, queryResult, mutationResult, formLoading } = useForm({
        action: "edit",
        resource: "customers",
        id,
        redirect: false,
        onMutationSuccess: () => {
            navigate("/customers");
        },
    });

    const record = queryResult?.data?.data;

    useEffect(() => {
        if (record) {
            setName(record.name || "");
            setVatNumber(record.vat_number || "");
            setEmail(record.email || "");
            setPhone(record.phone || "");
            setAddress(record.address || "");
            setIsActive(record.is_active === false ? "false" : "true");
        }
    }, [record]);

    const handleSubmit = async () => {
        await onFinish({
            name,
            vat_number: vatNumber,
            email,
            phone,
            address,
            is_active: isActive === "true",
        });
    };

    if (formLoading) {
        return <div className="p-12 text-center text-zinc-500">{t("common:loading")}</div>;
    }

    return (
        <FormPage
            title={t("customers.editCustomerTitle")}
            onSubmit={handleSubmit}
            isLoading={mutationResult.isLoading || formLoading}
            onCancel={() => navigate("/customers")}
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
                <Select
                    custom
                    label={t("customers.status")}
                    value={isActive}
                    onChange={(val) => setIsActive(val)}
                    options={[
                        { value: "true", label: t("customers.active") },
                        { value: "false", label: t("customers.inactive") },
                    ]}
                />
            </FormSection>
        </FormPage>
    );
};
