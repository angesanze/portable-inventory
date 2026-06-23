
import { useForm, useList, useCustom } from "@refinedev/core";
import type { HttpError } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, AlertCircle, Workflow, ShieldAlert, Sliders, Boxes } from "lucide-react";
import { FormPage } from "../../../components/ui/FormPage";
import { FormSection } from "../../../components/ui/FormSection";
import { InfoTip } from "../../../components/ui/InfoTip";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Button } from "../../../components/ui/Button";
import { PROFILE_METADATA, type InventoryProfile, type CalculatorTemplate } from "../../../types/api";
import { API_URL } from "../../../config";
import { BulkStockEditor } from "./BulkStockEditor";
import { EngineConfigForm } from "../../settings/calculators/EngineConfigForm";
import type {
    ProductModelEditRecord,
    ProductModelEditValues,
    ComponentItem,
    ComponentModelOption,
    StockLevelSummary,
} from "../types";

function formatPresetValue(val: unknown, t: (key: string) => string): string {
    if (typeof val === "boolean") return val ? t("common:yes") : t("common:no");
    if (val === null || val === undefined) return "—";
    if (Array.isArray(val)) return val.length === 0 ? "—" : val.map((v) => formatPresetValue(v, t)).join(", ");
    if (typeof val === "object") {
        const entries = Object.entries(val as Record<string, unknown>);
        if (entries.length === 0) return "—";
        return entries.map(([k, v]) => `${k} → ${formatPresetValue(v, t)}`).join("; ");
    }
    return String(val);
}

export const ProductModelEdit = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation(["products", "common"]);

    const { onFinish, queryResult, mutationResult } = useForm<
        ProductModelEditRecord,
        HttpError,
        ProductModelEditValues
    >({
        action: "edit",
        resource: "product-models",
        id: id,
        redirect: false,
    });

    const [componentItems, setComponentItems] = useState<ComponentItem[]>([]);
    const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
    const [engineConfig, setEngineConfig] = useState<Record<string, unknown>>({});

    const { data: calculatorTemplates } = useList<CalculatorTemplate>({
        resource: "calculator-templates",
        pagination: { mode: "off" },
    });

    // Current stock level — drives the inline BULK giacenza editor below.
    const { data: stockData, refetch: refetchStock } = useCustom<StockLevelSummary>({
        url: `${API_URL}/api/v1/stock/${id}/level`,
        method: "get",
        queryOptions: { enabled: !!id },
    });
    const stockTotal = Number(stockData?.data?.total || 0);

    const { data: productModels } = useList<ComponentModelOption>({
        resource: "product-models",
        pagination: { mode: "off" },
    });

    const modelOptions = (productModels?.data || [])
        .filter((p) => {
            const meta = p.profile ? PROFILE_METADATA[p.profile as InventoryProfile] : null;
            return meta ? !meta.supportsBatches : p.engine_type !== "bucket";
        })
        .map((p) => ({
            label: `${p.sku} - ${p.name}`,
            value: p.id,
        }));

    useEffect(() => {
        if (queryResult?.data?.data) {
            const data = queryResult.data.data;
            if (data.components) {
                // Hydrate component rows from the fetched model (async fetch → setState).
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setComponentItems(
                    data.components.map((c) => ({
                        product_model_id: c.child,
                        quantity: parseFloat(String(c.quantity)),
                        key: Math.random(),
                    }))
                );
            }
            setSelectedPreset(data.default_calculator ?? null);
            setEngineConfig(data.engine_config ? { ...data.engine_config } : {});
        }
    }, [queryResult?.data?.data?.id]);

    const handlePresetChange = (val: string | number) => {
        const nextId = val === "" ? null : String(val);
        setSelectedPreset(nextId);
        if (nextId) {
            const allTemplates: CalculatorTemplate[] = calculatorTemplates?.data || [];
            const tpl = allTemplates.find((t) => t.id === nextId);
            if (tpl?.engine_config) {
                setEngineConfig((current) => ({ ...current, ...tpl.engine_config }));
            }
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const values: ProductModelEditValues = Object.fromEntries(formData.entries());

        values.components = componentItems.map((c) => ({
            child: c.product_model_id,
            quantity: c.quantity,
        }));

        values.default_calculator = selectedPreset || null;
        values.engine_config = engineConfig;

        if (values.min_threshold) {
            values.attributes = { ...values.attributes, min_threshold: values.min_threshold };
        }

        try {
            await onFinish(values);
            navigate("/products");
        } catch (err) {
            console.error("Save failed", err);
        }
    };

    const record = queryResult?.data?.data;
    const isLoading = queryResult?.isLoading || mutationResult?.isLoading;

    if (queryResult?.isLoading) {
        return <div className="p-8 text-center text-zinc-500">{t("products:loadingConfig")}</div>;
    }

    const profile = record?.profile as InventoryProfile | undefined;
    const meta = profile ? PROFILE_METADATA[profile] : null;

    // Derive stock method from profile, fallback to engine_type for legacy data
    const stockMethod = meta
        ? meta.supportsBatches
            ? "BATCH"
            : meta.supportsSerials
              ? "SERIALIZED"
              : "BULK"
        : record?.engine_type === "bucket"
          ? "BATCH"
          : record?.engine_type === "tracker"
            ? "SERIALIZED"
            : "BULK";

    return (
        <FormPage
            title={t("products:editTitle", { name: record?.name ?? t("products:productModelFallback") })}
            onSubmit={handleSave}
            isLoading={isLoading}
            onCancel={() => navigate("/products")}
        >
            {/* Profile badge */}
            <div className="flex items-center gap-2 -mt-2 mb-2">
                <span
                    className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                        stockMethod === "BATCH"
                            ? "bg-amber-500/10 text-amber-400"
                            : stockMethod === "SERIALIZED"
                              ? "bg-violet-500/10 text-violet-400"
                              : "bg-indigo-500/10 text-indigo-400"
                    }`}
                >
                    {meta?.label || stockMethod}
                </span>
                <span className="text-zinc-500 text-sm">{t("products:modelConfiguration")}</span>
            </div>

            {/* Profile info (read-only) */}
            {meta && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-950 border border-white/5 mb-4 text-sm text-zinc-400">
                    <ShieldAlert size={16} className="text-zinc-500 shrink-0" />
                    <span>
                        {t("products:profileColumn")}: <strong className="text-zinc-200">{meta.label}</strong> — {meta.description}.
                        {" "}{t("products:profileLocked")}
                    </span>
                </div>
            )}

            {/* Basic Info */}
            <FormSection title={t("products:basicInfo")}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                        label={t("products:sku")}
                        name="sku"
                        defaultValue={record?.sku}
                        className="font-mono uppercase"
                    />
                    <Input label={t("common:name")} name="name" defaultValue={record?.name} />
                    <Input
                        label={t("products:barcode")}
                        name="barcode"
                        defaultValue={record?.barcode}
                        placeholder={t("products:barcodePlaceholder")}
                        className="font-mono"
                    />
                </div>
            </FormSection>

            {/* Bulk-specific: inline giacenza editor (creates an adjustment movement) */}
            {stockMethod === "BULK" && (
                <FormSection
                    title={t("products:currentInventory")}
                    description={t("products:currentInventoryEditHelp")}
                >
                    <div className="flex items-center gap-3 bg-zinc-950 p-4 rounded-lg border border-white/5">
                        <Boxes size={18} className="text-emerald-400 shrink-0" />
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-zinc-50 font-mono">
                                {stockTotal.toLocaleString()}
                            </span>
                            <span className="text-zinc-500 text-sm">{t("products:totalUnits")}</span>
                        </div>
                        <div className="ml-auto">
                            <BulkStockEditor
                                productId={id as string}
                                currentTotal={stockTotal}
                                onUpdated={() => refetchStock()}
                            />
                        </div>
                    </div>
                </FormSection>
            )}

            {/*
                Engine ↔ per-product config mapping (single source of truth):
                  counter    → step + input_label (unit) + allow_negative   (SIMPLE_COUNT, ASSEMBLED)
                  converter  → ratio_source + precision + input/stock unit  (UNIT_CONVERSION)
                  bucket     → allocation_strategy + primary_key            (BATCH_TRACKED)
                  tracker    → status_transitions                           (SERIALIZED)
                  dimension  → dimensions + unit + formula                  (DIMENSIONAL)
                  time_based → time_unit + expiry_tracking + auto_decrement (PERISHABLE)
                Driven by `meta.engineType` from PROFILE_METADATA — one block per engine, no duplicates.
            */}
            {meta?.engineType && (
                <FormSection title={t(`products:engineConfig.${meta.engineType}.title`)}>
                    <EngineConfigForm
                        engineType={meta.engineType}
                        value={engineConfig}
                        onChange={setEngineConfig}
                    />
                </FormSection>
            )}

            {/* Bulk-specific: Alerts */}
            {stockMethod === "BULK" && (
                <FormSection
                    title={t("products:inventoryAlerts")}
                    description={t("products:inventoryAlertsDesc")}
                >
                    <div className="flex items-center gap-2 text-indigo-400 mb-1">
                        <AlertCircle size={18} />
                        <span className="font-medium text-sm">{t("products:minThreshold")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Input
                            name="min_threshold"
                            type="number"
                            defaultValue={record?.attributes?.min_threshold || 0}
                            className="md:w-1/2"
                        />
                        <span className="text-zinc-500 text-sm">{t("products:units")}</span>
                    </div>
                    <p className="text-xs text-zinc-500">
                        {t("products:minThresholdHelp")}
                    </p>
                </FormSection>
            )}

            {/* Tracking Preset */}
            <FormSection
                title={t("products:trackingPreset")}
                titleExtra={
                    <InfoTip
                        content={t("products:trackingPresetHelp")}
                        title={t("products:trackingPresetsTitle")}
                    />
                }
                description={t("products:trackingPresetDesc")}
            >
                <div className="flex items-center gap-2 text-indigo-400 mb-1">
                    <Sliders size={18} />
                    <span className="font-medium text-sm">{t("products:presetAssignment")}</span>
                </div>
                {(() => {
                    const allTemplates: CalculatorTemplate[] = calculatorTemplates?.data || [];
                    const compatibleTemplates = allTemplates.filter(
                        (tpl) => tpl.engine_type === record?.engine_type
                    );
                    const presetOptions = [
                        { value: "", label: t("products:presetNone"), description: t("products:presetNoneDesc") },
                        ...compatibleTemplates.map((tpl) => ({
                            value: tpl.id,
                            label: tpl.name,
                            description: `${tpl.engine_type} — ${Object.keys(tpl.engine_config || {}).join(", ") || t("products:defaultConfig")}`,
                        })),
                    ];

                    const activePreset = selectedPreset
                        ? allTemplates.find((tpl) => tpl.id === selectedPreset)
                        : null;

                    return (
                        <>
                            <Select
                                label={t("products:activePreset")}
                                value={selectedPreset ?? ""}
                                onChange={handlePresetChange}
                                options={presetOptions}
                                placeholder={t("products:selectPresetPlaceholder")}
                                helperText={
                                    compatibleTemplates.length === 0
                                        ? t("products:noPresetsForEngine", { engine: record?.engine_type })
                                        : t("products:presetsForEngine", { count: compatibleTemplates.length, engine: record?.engine_type })
                                }
                            />
                            {activePreset && (
                                <div className="mt-2 p-3 rounded-lg bg-zinc-950 border border-white/5">
                                    <p className="text-xs font-medium text-zinc-400 mb-2">{t("products:presetConfiguration")}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {Object.entries(engineConfig).map(([key, val]) => (
                                            <span
                                                key={key}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-xs text-indigo-300 border border-indigo-500/20"
                                            >
                                                <span className="font-medium">{key}:</span>{" "}
                                                {formatPresetValue(val, t)}
                                            </span>
                                        ))}
                                        {Object.keys(engineConfig).length === 0 && (
                                            <span className="text-xs text-zinc-500 italic">{t("products:noCustomConfig")}</span>
                                        )}
                                    </div>
                                </div>
                            )}
                            {!selectedPreset && (
                                <p className="text-xs text-zinc-500">
                                    {t("products:usingDefaultsFull")}
                                </p>
                            )}
                        </>
                    );
                })()}
            </FormSection>

            {/* Kit / Assembly Components */}
            {(stockMethod === "BATCH" || componentItems.length > 0) && (
                <FormSection
                    title={t("products:kitConfig")}
                    description={t("products:kitConfigDesc")}
                >
                    <div className="flex items-center gap-2 text-indigo-400 mb-1">
                        <Workflow size={18} />
                        <span className="font-medium text-sm">{t("products:components")}</span>
                    </div>

                    {componentItems.length === 0 && (
                        <div className="p-8 text-center border-2 border-dashed border-white/5 rounded-xl text-zinc-600">
                            {t("products:noComponents")}
                        </div>
                    )}

                    {componentItems.map((comp, idx) => (
                        <div
                            key={comp.key || idx}
                            className="flex gap-4 items-end bg-zinc-950/50 p-4 rounded-lg border border-white/5"
                        >
                            <div className="flex-1">
                                <Select
                                    label={t("products:componentModel")}
                                    value={comp.product_model_id}
                                    onChange={(val) => {
                                        const updated = [...componentItems];
                                        updated[idx].product_model_id = String(val);
                                        setComponentItems(updated);
                                    }}
                                    placeholder={t("products:selectModelPlaceholder")}
                                    options={modelOptions.filter((m) => m.value !== id)}
                                />
                            </div>
                            <div className="w-24">
                                <Input
                                    label={t("products:qty")}
                                    type="number"
                                    value={comp.quantity}
                                    onChange={(e) => {
                                        const updated = [...componentItems];
                                        updated[idx].quantity = parseFloat(e.target.value);
                                        setComponentItems(updated);
                                    }}
                                />
                            </div>
                            <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                icon={Trash2}
                                onClick={() =>
                                    setComponentItems(componentItems.filter((_, i) => i !== idx))
                                }
                            />
                        </div>
                    ))}

                    <Button
                        type="button"
                        variant="ghost"
                        icon={Plus}
                        onClick={() =>
                            setComponentItems([
                                ...componentItems,
                                { product_model_id: "", quantity: 1, key: Math.random() },
                            ])
                        }
                        className="w-full border border-dashed border-indigo-500/20 text-indigo-400 hover:text-indigo-300"
                    >
                        {t("products:addComponent")}
                    </Button>
                </FormSection>
            )}
        </FormPage>
    );
};
