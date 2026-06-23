import { useState } from "react";
import { useForm, useList } from "@refinedev/core";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Check, Info, Loader } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Select, type SelectOption } from "../../../components/ui/Select";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import type { StockModelOption, StockLocationOption } from "./types";

export const PhysicalProductCreate = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const navigate = useNavigate();
    const { onFinish, mutationResult } = useForm({
        action: "create",
        resource: "physical-products",
        redirect: false,
        onMutationSuccess: () => {
            navigate("/stock");
        }
    });

    const { data: productModels } = useList<StockModelOption>({
        resource: "product-models",
        filters: [
            { field: "profile", operator: "eq", value: "SERIALIZED" }
        ],
        pagination: { mode: "off" }
    });

    const { data: locations } = useList<StockLocationOption>({
        resource: "locations",
        pagination: { mode: "off" }
    });

    const modelOptions = (productModels?.data || []).map((m) => ({
        label: `${m.sku} - ${m.name}`,
        value: m.id
    }));

    const locationOptions = (locations?.data || []).map((l) => ({
        label: l.name,
        value: l.id
    }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const data = Object.fromEntries(formData.entries());
        await onFinish(data);
    };

    const isLoading = mutationResult.isLoading;

    // Controlled values. CustomDropdown emits a hidden <input name=…> from `value`,
    // so the FormData-based submit needs each Select to be controlled.
    const [productModel, setProductModel] = useState<string>("");
    const [locationId, setLocationId] = useState<string>("");
    const [status, setStatus] = useState("ACTIVE");
    const statusOptions: SelectOption[] = [
        { value: "ACTIVE", label: t("stock.statusActiveAvailable") },
        { value: "INACTIVE", label: t("stock.statusInactiveStorage") },
        { value: "DAMAGED", label: t("stock.statusDamagedRepair") },
    ];

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-3xl font-bold text-white tracking-tight">{t("stock.registerPhysicalItem")}</h1>
            </div>

            <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-xl p-4 flex gap-3" role="note">
                <Info size={20} className="text-indigo-400 mt-0.5 shrink-0" />
                <div className="text-sm text-indigo-200/80">
                    <p>{t("stock.registerItemBanner")}</p>
                    <Link to="/movements/create" className="inline-flex items-center gap-1 mt-2 text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                        {t("stock.recordMovementInstead")} →
                    </Link>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="bg-zinc-900 border border-white/[0.06] rounded-xl p-8 shadow-lg space-y-6">
                {mutationResult?.isError && (
                    <FormErrorBanner
                        title={t("stock.errorRegistering")}
                        error={mutationResult.error}
                        fallbackMessage={t("stock.failedToRegister")}
                    />
                )}

                <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">{t("stock.identifierSnLabel")} <span className="text-red-400">*</span></label>
                    <input
                        name="identifier"
                        required
                        type="text"
                        placeholder={t("stock.identifierPlaceholder")}
                        className="w-full bg-zinc-950 border border-white/[0.06] rounded-lg px-4 py-3 text-white focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none font-mono"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">{t("stock.productModel")} <span className="text-red-400">*</span></label>
                    <Select
                        name="product_model"
                        required
                        placeholder={t("stock.selectModel")}
                        value={productModel}
                        onChange={(val) => setProductModel(String(val))}
                        options={modelOptions}
                    />
                    <p className="mt-1 text-xs text-zinc-500 italic">{t("stock.serializedOnly")}</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">{t("stock.initialLocation")}</label>
                    <Select
                        name="location_id"
                        placeholder={t("stock.selectLocation")}
                        value={locationId}
                        onChange={(val) => setLocationId(String(val))}
                        options={locationOptions}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">{t("stock.initialStatus")}</label>
                    <Select
                        name="status"
                        value={status}
                        onChange={(val) => setStatus(String(val))}
                        options={statusOptions}
                    />
                </div>

                <div className="pt-6 border-t border-white/5 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="px-6 py-2 rounded-lg font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        {t("common:cancel")}
                    </button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="flex items-center gap-2 px-8 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-bold shadow-lg shadow-indigo-900/20 active:scale-95 transition-all duration-150"
                    >
                        {isLoading ? <Loader className="animate-spin" size={18} /> : <Check size={18} />}
                        {t("stock.registerUnit")}
                    </button>
                </div>
            </form>
        </div>
    );
};
