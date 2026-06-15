import { useForm, useList } from "@refinedev/core";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Save, Loader, Package } from "lucide-react";
import { EngineConfigForm } from "./EngineConfigForm";
import { FormulaPreview } from "./FormulaPreview";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import { Select, type SelectOption } from "../../../components/ui/Select";

const ENGINE_TYPES = [
    { value: "counter", labelKey: "counter" },
    { value: "converter", labelKey: "converter" },
    { value: "bucket", labelKey: "bucket" },
    { value: "tracker", labelKey: "tracker" },
    { value: "dimension", labelKey: "dimension" },
    { value: "time_based", labelKey: "timeBased" },
];

export const CalculatorEdit = () => {
    const { t } = useTranslation(["settings", "common"]);
    const navigate = useNavigate();
    const { id } = useParams();
    const [engineType, setEngineType] = useState("counter");
    const [engineConfig, setEngineConfig] = useState<Record<string, any>>({});
    const [initialized, setInitialized] = useState(false);

    const { onFinish, queryResult, mutationResult, formLoading } = useForm({
        action: "edit",
        resource: "calculator-templates",
        id: id,
        redirect: false,
        onMutationSuccess: () => {
            navigate("/settings/calculators");
        },
    });

    const record = queryResult?.data?.data;

    useEffect(() => {
        if (record && !initialized) {
            setEngineType(record.engine_type || "counter");
            setEngineConfig(record.engine_config || {});
            setInitialized(true);
        }
    }, [record, initialized]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const name = formData.get("name") as string;
        await onFinish({
            name,
            engine_type: engineType,
            engine_config: engineConfig,
        });
    };

    const { data: usageData, isLoading: isLoadingUsage } = useList({
        resource: "product-models",
        filters: id ? [{ field: "default_calculator", operator: "eq", value: id }] : [],
        pagination: { pageSize: 50 },
        queryOptions: { enabled: !!id },
    }) as any;

    const usingProducts = Array.isArray(usageData?.data) ? usageData.data : [];

    const engineTypeOptions: SelectOption[] = ENGINE_TYPES.map((et) => ({
        value: et.value,
        label: t(`settings:trackingPresets.editEngineTypes.${et.labelKey}`),
    }));

    const isLoading = mutationResult.isLoading || formLoading;

    if (formLoading) {
        return (
            <div className="p-12 text-center text-zinc-500 animate-pulse">{t("common:loading")}</div>
        );
    }

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-3xl font-bold text-white tracking-tight">
                    {t("settings:trackingPresets.editPreset")}
                </h1>
            </div>

            <form
                onSubmit={handleSubmit}
                className="bg-zinc-900 border border-white/[0.06] rounded-xl p-8 shadow-lg space-y-6"
            >
                {mutationResult?.isError && (
                    <FormErrorBanner
                        title={t("settings:trackingPresets.saveError")}
                        error={mutationResult.error}
                        fallbackMessage={t("settings:trackingPresets.saveErrorFallback")}
                    />
                )}

                <div>
                    <label
                        htmlFor="name"
                        className="block text-sm font-medium text-zinc-400 mb-2"
                    >
                        {t("settings:trackingPresets.templateName")} <span className="text-red-400">*</span>
                    </label>
                    <input
                        id="name"
                        name="name"
                        required
                        type="text"
                        defaultValue={record?.name}
                        className="w-full bg-zinc-950 border border-white/[0.06] rounded-lg px-4 py-3 text-white focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                        {t("settings:trackingPresets.engineType")} <span className="text-red-400">*</span>
                    </label>
                    <Select
                        custom
                        value={engineType}
                        onChange={(val) => {
                            setEngineType(String(val));
                            setEngineConfig({});
                        }}
                        options={engineTypeOptions}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-3">
                        {t("settings:trackingPresets.engineConfig")}
                    </label>
                    <div className="bg-zinc-950/50 border border-white/5 rounded-lg p-4">
                        <EngineConfigForm
                            engineType={engineType}
                            value={engineConfig}
                            onChange={setEngineConfig}
                        />
                        <FormulaPreview
                            engineType={engineType}
                            engineConfig={engineConfig}
                        />
                    </div>
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
                        className="flex items-center gap-2 px-8 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all duration-150 active:scale-95"
                    >
                        {isLoading ? (
                            <Loader className="animate-spin" size={18} />
                        ) : (
                            <Save size={18} />
                        )}
                        {t("settings:trackingPresets.saveChanges")}
                    </button>
                </div>
            </form>

            <div className="mt-8 bg-zinc-900 border border-white/[0.06] rounded-xl p-6 shadow-lg">
                <div className="flex items-center gap-2 mb-4">
                    <Package size={16} className="text-zinc-400" />
                    <h2 className="text-sm font-medium text-zinc-300">
                        {t("settings:trackingPresets.productsUsing")}
                    </h2>
                    {!isLoadingUsage && (
                        <span className="text-xs text-zinc-500">
                            ({usingProducts.length})
                        </span>
                    )}
                </div>
                {isLoadingUsage ? (
                    <p className="text-sm text-zinc-500 animate-pulse">{t("common:loading")}</p>
                ) : usingProducts.length === 0 ? (
                    <p className="text-sm text-zinc-500">
                        {t("settings:trackingPresets.noProductsUsing")}
                    </p>
                ) : (
                    <ul className="space-y-1">
                        {usingProducts.map((p: any) => (
                            <li key={p.id}>
                                <Link
                                    to={`/products/${p.id}`}
                                    className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                                >
                                    {p.name}
                                    {p.sku && (
                                        <span className="text-zinc-500 ml-2">
                                            {p.sku}
                                        </span>
                                    )}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};
