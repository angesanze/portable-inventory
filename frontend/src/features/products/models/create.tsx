
import { useForm, useList } from "@refinedev/core";
import type { BaseRecord, HttpError } from "@refinedev/core";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormPage } from "../../../components/ui/FormPage";
import { FormSection } from "../../../components/ui/FormSection";
import { Input, Textarea } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import { InfoTip } from "../../../components/ui/InfoTip";
import type { SelectOption } from "../../../components/ui/Select";
import { PROFILE_METADATA, type CalculatorTemplate, type InventoryProfile } from "../../../types/api";
import { ProfileWizard } from "../components/ProfileWizard";
import { EngineConfigForm } from "../../settings/calculators/EngineConfigForm";
import { safeEvalFormula } from "../../widget/calculator/utils";
import type {
    LocationOptionRow,
    SupplierOptionRow,
    CreatedModelResult,
    ProductModelCreateValues,
} from "../types";

export const ProductModelCreate = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = searchParams.get("returnTo");
    const { t } = useTranslation(["products", "common"]);

    const [profile, setProfile] = useState<InventoryProfile | "">("");
    const [sku, setSku] = useState("");
    const [name, setName] = useState("");
    const [barcode, setBarcode] = useState("");
    const [description, setDescription] = useState("");
    const [initialBalance, setInitialBalance] = useState("");
    const [initialLocationId, setInitialLocationId] = useState("");
    const [initialSupplierId, setInitialSupplierId] = useState("");
    const [presetId, setPresetId] = useState<string>("");
    const [engineConfig, setEngineConfig] = useState<Record<string, unknown>>({});
    const [batchIdentifier, setBatchIdentifier] = useState("");
    const [lotNumber, setLotNumber] = useState("");
    const [expiryDate, setExpiryDate] = useState("");
    const [batchQuantity, setBatchQuantity] = useState("");
    const [batchLocationId, setBatchLocationId] = useState("");
    const [serialsText, setSerialsText] = useState("");
    const [serialsLocationId, setSerialsLocationId] = useState("");
    const [dimensionValues, setDimensionValues] = useState<Record<string, string>>({});

    const { onFinish, mutationResult } = useForm<
        BaseRecord,
        HttpError,
        ProductModelCreateValues,
        BaseRecord,
        CreatedModelResult["data"]
    >({
        action: "create",
        resource: "product-models",
        redirect: false,
        onMutationSuccess: (data) => {
            const meta = profile ? PROFILE_METADATA[profile] : null;
            if (meta?.supportsBatches) {
                navigate(`/products/edit/${data.data.id}`);
            } else if (returnTo) {
                const back = decodeURIComponent(returnTo);
                navigate(
                    `${back}${back.includes("?") ? "&" : "?"}created_product=${data.data.id}`,
                );
            } else {
                navigate("/products");
            }
        },
    });

    const { data: locationsData } = useList<LocationOptionRow>({
        resource: "locations",
        pagination: { mode: "off" },
    });

    const locationOptions: SelectOption[] = (locationsData?.data || [])
        .filter((l) => l.type !== "VIRTUAL" && l.type !== "LOSS")
        .map((l) => ({
            value: l.id,
            label: l.name,
            description: l.type,
        }));

    const { data: suppliersData } = useList<SupplierOptionRow>({
        resource: "suppliers",
        pagination: { mode: "off" },
        filters: [{ field: "is_active", operator: "eq", value: true }],
    });

    const supplierOptions: SelectOption[] = (suppliersData?.data || []).map((s) => ({
        value: s.id,
        label: s.name,
        description: s.vat_number || undefined,
    }));

    const { data: templatesData } = useList<CalculatorTemplate>({
        resource: "calculator-templates",
        pagination: { mode: "off" },
    });
    const allTemplates: CalculatorTemplate[] = (templatesData?.data || []) as CalculatorTemplate[];

    const meta = profile ? PROFILE_METADATA[profile] : null;
    const targetEngineType = profile ? PROFILE_METADATA[profile].engineType : null;
    const compatibleTemplates = targetEngineType
        ? allTemplates.filter((tpl) => tpl.engine_type === targetEngineType)
        : [];
    const isBulk = meta?.trackingMode === "BULK";
    const isDimensional = profile === "DIMENSIONAL";
    const dimensionsList: string[] = isDimensional
        ? ((engineConfig.dimensions as string[]) || []).filter((d) => !!d && d.trim().length > 0)
        : [];
    const dimensionFormula: string = isDimensional ? ((engineConfig.formula as string) || "") : "";
    const dimensionUnit: string = isDimensional ? ((engineConfig.unit as string) || "") : "";
    const dimensionComputedUnit: string = isDimensional
        ? ((engineConfig.computed_unit as string) || dimensionUnit || "")
        : "";

    const computeDimensionTotal = (): number | null => {
        if (!isDimensional || dimensionsList.length === 0 || !dimensionFormula) return null;
        const allFilled = dimensionsList.every(
            (d) => dimensionValues[d] && parseFloat(dimensionValues[d]) > 0,
        );
        if (!allFilled) return null;
        let expr = dimensionFormula;
        for (const d of dimensionsList) {
            expr = expr.replace(new RegExp(`\\b${d}\\b`, "g"), String(parseFloat(dimensionValues[d]) || 0));
        }
        const v = safeEvalFormula(expr);
        return isNaN(v) ? null : v;
    };
    const computedDimensionValue = computeDimensionTotal();

    const [validationError, setValidationError] = useState<string | null>(null);

    const handlePresetChange = (val: string | number) => {
        const next = val === "" ? "" : String(val);
        setPresetId(next);
        if (next) {
            const tpl = allTemplates.find((t) => t.id === next);
            if (tpl?.engine_config) {
                setEngineConfig((curr) => ({ ...curr, ...tpl.engine_config }));
            }
        }
    };

    const handleSubmit = async () => {
        setValidationError(null);
        if (!profile) {
            setValidationError(t("products:selectProfileError"));
            return;
        }
        if (!sku.trim() || !name.trim()) {
            setValidationError(t("products:skuNameRequired"));
            return;
        }

        const submitConfig: Record<string, unknown> = { ...engineConfig };
        const tpl = presetId ? allTemplates.find((t) => t.id === presetId) : null;
        const mergedEngineConfig = { ...(tpl?.engine_config ?? {}), ...submitConfig };

        const payload: ProductModelCreateValues = {
            sku: sku.trim(),
            name: name.trim(),
            barcode: barcode.trim() || undefined,
            description: description.trim() || undefined,
            profile,
            engine_config:
                Object.keys(mergedEngineConfig).length > 0 ? mergedEngineConfig : undefined,
        };
        if (presetId) {
            payload.default_calculator = presetId;
        }
        if (isBulk && isDimensional) {
            const computed = computeDimensionTotal();
            if (computed !== null && computed > 0) {
                payload.initial_balance = computed;
                payload.initial_dimensions = Object.fromEntries(
                    dimensionsList.map((d) => [d, parseFloat(dimensionValues[d]) || 0]),
                );
                if (initialLocationId) {
                    payload.initial_location_id = initialLocationId;
                }
                if (initialSupplierId) {
                    payload.initial_supplier_id = initialSupplierId;
                }
            }
        } else if (isBulk) {
            const balance = parseFloat(initialBalance);
            if (balance > 0) {
                payload.initial_balance = balance;
                if (initialLocationId) {
                    payload.initial_location_id = initialLocationId;
                }
                if (initialSupplierId) {
                    payload.initial_supplier_id = initialSupplierId;
                }
            }
        }

        if (profile === "SERIALIZED") {
            const parsed = Array.from(
                new Set(
                    serialsText
                        .split("\n")
                        .map((s) => s.trim())
                        .filter((s) => s.length > 0),
                ),
            );
            if (parsed.length > 0) {
                payload.initial_serials = parsed;
                if (serialsLocationId) {
                    payload.initial_location_id = serialsLocationId;
                }
            }
        }

        if (profile === "PERISHABLE" || profile === "BATCH_TRACKED") {
            const qty = parseFloat(batchQuantity);
            if (batchIdentifier.trim() && qty > 0) {
                payload.initial_batch = {
                    batch_identifier: batchIdentifier.trim(),
                    initial_quantity: qty,
                    initial_location_id: batchLocationId || undefined,
                    lot_number: lotNumber.trim() || undefined,
                };
                if (profile === "PERISHABLE" && expiryDate) {
                    payload.initial_batch.expiry_date = expiryDate;
                }
            }
        }
        await onFinish(payload);
    };

    const isLoading = mutationResult.isLoading;

    return (
        <FormPage
            title={t("products:createProduct")}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            onCancel={() => navigate(returnTo ? decodeURIComponent(returnTo) : "/products")}
        >
            {validationError && (
                <FormErrorBanner
                    title={t("products:validationError")}
                    error={{ message: validationError }}
                />
            )}
            {mutationResult?.isError && (
                <FormErrorBanner
                    title={t("products:createError")}
                    error={mutationResult.error}
                />
            )}

            {/* Section 1: Basic Information */}
            <FormSection title={t("products:basicInfo")} description={t("products:basicInfoDesc")}>
                <Input
                    label={t("products:sku")}
                    labelExtra={
                        <InfoTip content={t("products:skuHelp")} />
                    }
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder={t("products:skuPlaceholder")}
                    required
                />
                <Input
                    label={t("common:name")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("products:namePlaceholder")}
                    required
                />
                <Input
                    label={t("products:barcode")}
                    labelExtra={
                        <InfoTip content={t("products:barcodeHelp")} />
                    }
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder={t("products:barcodePlaceholder")}
                    className="font-mono"
                />
                <Textarea
                    label={t("common:description")}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("products:descriptionPlaceholder")}
                />
            </FormSection>

            {/* Section 2: Inventory Profile */}
            <FormSection
                title={t("products:inventoryProfile")}
                titleExtra={
                    <InfoTip content={t("products:inventoryProfileHelp")} />
                }
                description={t("products:inventoryProfileDesc")}
            >
                <ProfileWizard
                    value={profile || null}
                    onChange={(val) => setProfile(val)}
                />
            </FormSection>

            {/* Section 3: Tracking Preset (gated on profile) */}
            {profile && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
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
                        <Select
                            label={t("products:activePreset")}
                            value={presetId}
                            onChange={handlePresetChange}
                            options={[
                                {
                                    value: "",
                                    label: t("products:presetNone"),
                                    description: t("products:presetNoneDesc"),
                                },
                                ...compatibleTemplates.map((tpl) => ({
                                    value: tpl.id,
                                    label: tpl.name,
                                    description: tpl.engine_type,
                                })),
                            ]}
                            placeholder={t("products:selectPresetPlaceholder")}
                            helperText={
                                compatibleTemplates.length === 0
                                    ? t("products:noPresetsForEngine", { engine: targetEngineType })
                                    : t("products:presetsForEngine", {
                                          count: compatibleTemplates.length,
                                          engine: targetEngineType,
                                      })
                            }
                        />
                    </FormSection>
                </div>
            )}

            {/*
                Engine ↔ per-product config — single slot driven by PROFILE_METADATA[profile].engineType.
                counter / converter / bucket / tracker / dimension / time_based each render their own controls.
            */}
            {targetEngineType && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <FormSection title={t(`products:engineConfig.${targetEngineType}.title`)}>
                        <EngineConfigForm
                            engineType={targetEngineType}
                            value={engineConfig}
                            onChange={setEngineConfig}
                        />
                    </FormSection>
                </div>
            )}

            {/* Initial Batch — PERISHABLE / BATCH_TRACKED first-batch onboarding */}
            {(profile === "PERISHABLE" || profile === "BATCH_TRACKED") && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <FormSection
                        title={t("products:initialBatch")}
                        titleExtra={
                            <InfoTip content={t("products:initialBatchHelp")} />
                        }
                        description={t("products:initialBatchDesc")}
                    >
                        <Input
                            label={t("products:batchIdentifier")}
                            value={batchIdentifier}
                            onChange={(e) => setBatchIdentifier(e.target.value)}
                            placeholder={t("products:batchIdentifierPlaceholder")}
                            helperText={t("products:batchIdentifierHelp")}
                        />
                        <Input
                            label={t("products:lotNumber")}
                            value={lotNumber}
                            onChange={(e) => setLotNumber(e.target.value)}
                            placeholder={t("products:lotNumberPlaceholder")}
                        />
                        {profile === "PERISHABLE" && (
                            <Input
                                label={t("products:expiryDate")}
                                type="date"
                                value={expiryDate}
                                onChange={(e) => setExpiryDate(e.target.value)}
                                helperText={t("products:expiryDateHelp")}
                            />
                        )}
                        <Input
                            label={t("products:initialQuantity")}
                            type="number"
                            min="0"
                            step="any"
                            value={batchQuantity}
                            onChange={(e) => setBatchQuantity(e.target.value)}
                            placeholder="0"
                            helperText={t("products:initialQuantityHelp")}
                        />
                        {parseFloat(batchQuantity) > 0 && (
                            <Select
                                custom
                                label={t("products:destinationLocation")}
                                value={batchLocationId}
                                onChange={(val) => setBatchLocationId(String(val))}
                                options={locationOptions}
                                placeholder={t("products:autoSelectWarehouse")}
                                helperText={t("products:destinationLocationHelp")}
                            />
                        )}
                    </FormSection>
                </div>
            )}

            {/* Initial Serials — SERIALIZED first-units onboarding */}
            {profile === "SERIALIZED" && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <FormSection
                        title={t("products:initialSerials")}
                        titleExtra={
                            <InfoTip content={t("products:initialSerialsHelp")} />
                        }
                        description={t("products:initialSerialsDesc")}
                    >
                        <Textarea
                            label={t("products:serialsTextareaLabel")}
                            value={serialsText}
                            onChange={(e) => setSerialsText(e.target.value)}
                            placeholder={t("products:serialsTextareaPlaceholder")}
                            helperText={(() => {
                                const parsed = Array.from(
                                    new Set(
                                        serialsText
                                            .split("\n")
                                            .map((s) => s.trim())
                                            .filter((s) => s.length > 0),
                                    ),
                                );
                                return parsed.length > 0
                                    ? t("products:serialsParsedCount", { count: parsed.length })
                                    : undefined;
                            })()}
                            rows={6}
                        />
                        {serialsText.trim().length > 0 && (
                            <Select
                                custom
                                label={t("products:destinationLocation")}
                                value={serialsLocationId}
                                onChange={(val) => setSerialsLocationId(String(val))}
                                options={locationOptions}
                                placeholder={t("products:autoSelectWarehouse")}
                                helperText={t("products:destinationLocationHelp")}
                            />
                        )}
                    </FormSection>
                </div>
            )}

            {/* Initial Stock — only for BULK profiles */}
            {isBulk && !isDimensional && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <FormSection
                        title={t("products:initialStock")}
                        titleExtra={
                            <InfoTip content={t("products:initialStockHelp")} />
                        }
                        description={t("products:initialStockDesc")}
                    >
                        <Input
                            label={t("products:initialQuantity")}
                            type="number"
                            min="0"
                            step="any"
                            value={initialBalance}
                            onChange={(e) => setInitialBalance(e.target.value)}
                            placeholder="0"
                            helperText={t("products:initialQuantityHelp")}
                        />
                        {parseFloat(initialBalance) > 0 && (
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                                <Select
                                    custom
                                    label={t("products:destinationLocation")}
                                    value={initialLocationId}
                                    onChange={(val) => setInitialLocationId(String(val))}
                                    options={locationOptions}
                                    placeholder={t("products:autoSelectWarehouse")}
                                    helperText={t("products:destinationLocationHelp")}
                                />
                                <Select
                                    custom
                                    label={t("products:initialSupplier")}
                                    value={initialSupplierId}
                                    onChange={(val) => setInitialSupplierId(String(val))}
                                    options={supplierOptions}
                                    placeholder={t("products:initialSupplierPlaceholder")}
                                    helperText={t("products:initialSupplierHelp")}
                                />
                            </div>
                        )}
                    </FormSection>
                </div>
            )}

            {/* Initial Measurement — DIMENSIONAL opening measurement */}
            {isBulk && isDimensional && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <FormSection
                        title={t("products:initialMeasurement")}
                        titleExtra={
                            <InfoTip content={t("products:initialMeasurementHelp")} />
                        }
                        description={t("products:initialMeasurementDesc")}
                    >
                        {dimensionsList.length === 0 || !dimensionFormula ? (
                            <p className="text-xs text-zinc-500 italic">
                                {t("products:configureDimensionsFirst")}
                            </p>
                        ) : (
                            <>
                                <div className="grid gap-3">
                                    {dimensionsList.map((dim) => (
                                        <Input
                                            key={dim}
                                            label={`${dim.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}${dimensionUnit ? ` (${dimensionUnit})` : ""}`}
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={dimensionValues[dim] || ""}
                                            onChange={(e) =>
                                                setDimensionValues({
                                                    ...dimensionValues,
                                                    [dim]: e.target.value,
                                                })
                                            }
                                            placeholder="0"
                                        />
                                    ))}
                                </div>
                                {computedDimensionValue !== null && (
                                    <div className="pi-computed">
                                        <div className="pi-computed-label">
                                            {t("products:computedInitialStock")}
                                        </div>
                                        <div className="pi-computed-value">
                                            {computedDimensionValue.toFixed(2)} {dimensionComputedUnit}
                                        </div>
                                        <div className="pi-computed-hint">
                                            {t("products:formula")}: {dimensionFormula}
                                        </div>
                                    </div>
                                )}
                                {computedDimensionValue !== null && computedDimensionValue > 0 && (
                                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                                        <Select
                                            custom
                                            label={t("products:destinationLocation")}
                                            value={initialLocationId}
                                            onChange={(val) => setInitialLocationId(String(val))}
                                            options={locationOptions}
                                            placeholder={t("products:autoSelectWarehouse")}
                                            helperText={t("products:destinationLocationHelp")}
                                        />
                                        <Select
                                            custom
                                            label={t("products:initialSupplier")}
                                            value={initialSupplierId}
                                            onChange={(val) => setInitialSupplierId(String(val))}
                                            options={supplierOptions}
                                            placeholder={t("products:initialSupplierPlaceholder")}
                                            helperText={t("products:initialSupplierHelp")}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </FormSection>
                </div>
            )}
        </FormPage>
    );
};
