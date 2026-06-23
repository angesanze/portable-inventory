import { useForm } from "@refinedev/core";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ArrowLeft,
    ArrowLeftRight,
    Check,
    Clock,
    Fingerprint,
    Hash,
    Layers,
    Loader,
    Ruler,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EngineConfigForm } from "./EngineConfigForm";
import { FormulaPreview } from "./FormulaPreview";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import { PROFILE_METADATA } from "../../../types/api";
import type { EngineConfig } from "./types";

interface EngineTypeCard {
    value: string;
    /** Suffix of the `settings:trackingPresets.engineTypes.*` translation key. */
    labelKey: string;
    icon: LucideIcon;
    profiles: string[];
}

const ENGINE_TYPES: EngineTypeCard[] = [
    {
        value: "counter",
        labelKey: "counter",
        icon: Hash,
        profiles: ["SIMPLE_COUNT", "ASSEMBLED"],
    },
    {
        value: "converter",
        labelKey: "converter",
        icon: ArrowLeftRight,
        profiles: ["UNIT_CONVERSION"],
    },
    {
        value: "bucket",
        labelKey: "bucket",
        icon: Layers,
        profiles: ["BATCH_TRACKED"],
    },
    {
        value: "tracker",
        labelKey: "tracker",
        icon: Fingerprint,
        profiles: ["SERIALIZED"],
    },
    {
        value: "dimension",
        labelKey: "dimension",
        icon: Ruler,
        profiles: ["DIMENSIONAL"],
    },
    {
        value: "time_based",
        labelKey: "timeBased",
        icon: Clock,
        profiles: ["PERISHABLE"],
    },
];

function profileLabels(profileKeys: string[]): string {
    return profileKeys
        .map((k) => PROFILE_METADATA[k as keyof typeof PROFILE_METADATA]?.label)
        .filter(Boolean)
        .join(", ");
}

export const CalculatorCreate = () => {
    const { t } = useTranslation(["settings", "common"]);
    const navigate = useNavigate();
    const [engineType, setEngineType] = useState("counter");
    const [engineConfig, setEngineConfig] = useState<EngineConfig>({});

    const { onFinish, mutationResult } = useForm({
        action: "create",
        resource: "calculator-templates",
        redirect: false,
        onMutationSuccess: () => {
            navigate("/settings/calculators");
        },
    });

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

    const isLoading = mutationResult.isLoading;

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
                    {t("settings:trackingPresets.createPreset")}
                </h1>
            </div>

            <form
                onSubmit={handleSubmit}
                className="bg-zinc-900 border border-white/[0.06] rounded-xl p-8 shadow-lg space-y-6"
            >
                {mutationResult?.isError && (
                    <FormErrorBanner
                        title={t("settings:trackingPresets.createError")}
                        error={mutationResult.error}
                        fallbackMessage={t("settings:trackingPresets.createErrorFallback")}
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
                        placeholder={t("settings:trackingPresets.namePlaceholder")}
                        className="w-full bg-zinc-950 border border-white/[0.06] rounded-lg px-4 py-3 text-white focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-3">
                        {t("settings:trackingPresets.engineType")} <span className="text-red-400">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {ENGINE_TYPES.map((type) => {
                            const Icon = type.icon;
                            const selected = engineType === type.value;
                            return (
                                <button
                                    key={type.value}
                                    type="button"
                                    onClick={() => {
                                        setEngineType(type.value);
                                        setEngineConfig({});
                                    }}
                                    className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
                                        selected
                                            ? "border-indigo-500 bg-zinc-900"
                                            : "border-white/[0.06] bg-zinc-900/80 hover:border-white/[0.12]"
                                    }`}
                                >
                                    <Icon
                                        className={`size-5 ${
                                            selected ? "text-indigo-400" : "text-zinc-400"
                                        }`}
                                    />
                                    <span className="text-sm font-medium text-zinc-200">
                                        {t(`settings:trackingPresets.engineTypes.${type.labelKey}`)}
                                    </span>
                                    <span className="text-xs text-zinc-500 leading-relaxed">
                                        {t(`settings:trackingPresets.engineTypes.${type.labelKey}Desc`)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {engineType && (
                        <p className="mt-2 text-xs text-zinc-500">
                            {t("settings:trackingPresets.pairedWith", {
                                profiles: profileLabels(
                                    ENGINE_TYPES.find((et) => et.value === engineType)
                                        ?.profiles ?? [],
                                ),
                            })}
                        </p>
                    )}
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
                        className="flex items-center gap-2 px-8 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-bold shadow-lg shadow-indigo-900/20 active:scale-95 transition-all duration-150"
                    >
                        {isLoading ? (
                            <Loader className="animate-spin" size={18} />
                        ) : (
                            <Check size={18} />
                        )}
                        {t("settings:trackingPresets.createTemplate")}
                    </button>
                </div>
            </form>
        </div>
    );
};
