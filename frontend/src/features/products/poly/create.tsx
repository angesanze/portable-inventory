import { useState } from "react";
import { useForm, useSelect } from "@refinedev/core";
import type { BaseRecord, HttpError } from "@refinedev/core";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Select, type SelectOption } from "../../../components/ui/Select";

/**
 * Fields posted by the poly-create form, collected from `FormData`
 * (the `name` and `product_model` inputs).
 */
type PolyCreateValues = Record<string, FormDataEntryValue>;

export const ProductPolyCreate = () => {
    const { t } = useTranslation(["products", "common"]);
    const navigate = useNavigate();
    const { onFinish, mutation } = useForm<BaseRecord, HttpError, PolyCreateValues>({
        action: "create",
        resource: "products-poly",
        redirect: false,
    });

    const { options: modelOptions } = useSelect({
        resource: "product-models",
        optionLabel: "name",
        optionValue: "id",
    });

    // Controlled value for the custom Select. The hidden <input name="product_model">
    // it emits keeps the FormData-based submit working (same as the old native select).
    const [productModel, setProductModel] = useState("");
    const modelSelectOptions: SelectOption[] = (Array.isArray(modelOptions) ? modelOptions : []).map(opt => ({
        value: opt.value,
        label: opt.label,
    }));

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = Object.fromEntries(formData.entries());

        try {
            await onFinish(data);
            navigate("/products-poly");
        } catch (err) {
            console.error("Failed to create product instance", err);
        }
    };

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-8">{t("products:poly.createTitle")}</h1>

            <form onSubmit={handleSubmit} className="bg-zinc-900 border border-white/[0.06] rounded-xl p-8 shadow-lg space-y-6">
                <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">{t("products:poly.instanceName")}</label>
                    <input
                        name="name"
                        required
                        className="w-full bg-zinc-950 border border-white/[0.06] rounded-lg px-4 py-3 text-white"
                        placeholder={t("products:poly.instanceNamePlaceholder")}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">{t("products:poly.productModelBase")}</label>
                    <Select
                        custom
                        name="product_model"
                        required
                        placeholder={t("products:poly.selectModel")}
                        value={productModel}
                        onChange={(val) => setProductModel(String(val))}
                        options={modelSelectOptions}
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                        {t("products:poly.inheritHelp")}
                    </p>
                </div>

                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4 text-sm text-indigo-400">
                    {t("products:poly.configAfterCreate")}
                </div>

                <div className="flex justify-end gap-4 pt-4">
                    <button
                        type="button"
                        onClick={() => navigate("/products-poly")}
                        className="px-6 py-2.5 text-zinc-400 hover:text-white"
                    >
                        {t("common:cancel")}
                    </button>
                    <button
                        type="submit"
                        disabled={mutation.isLoading}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold disabled:opacity-50"
                    >
                        {mutation.isLoading ? t("products:poly.creating") : t("products:poly.createInstance")}
                    </button>
                </div>
            </form>
        </div>
    );
};
