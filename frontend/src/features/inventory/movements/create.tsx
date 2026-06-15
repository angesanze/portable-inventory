
import { useForm, useList, useCustom } from "@refinedev/core";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownLeft, ArrowUpRight, PackagePlus, PackageMinus } from "lucide-react";
import { API_URL } from "../../../config";
import { useFormDraft } from "../../../hooks/useFormDraft";
import { FormPage } from "../../../components/ui/FormPage";
import { FormSection } from "../../../components/ui/FormSection";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import { InfoTip } from "../../../components/ui/InfoTip";
import { PROFILE_METADATA } from "../../../types/api";
import { StatusPicker } from "../../widget/components/engines/StatusPicker";

interface MovementDraft {
    productId: string;
    direction: string;
    quantity: string;
    locationId: string;
    reason: string;
    supplierId: string;
    batchIdentifier: string;
    batchLotNumber: string;
    batchExpiry: string;
    identifier: string;
}

export const MovementCreate = () => {
    const navigate = useNavigate();
    const routerLocation = useLocation();
    const returnTo = encodeURIComponent(routerLocation.pathname + routerLocation.search);
    const { t } = useTranslation(["inventory", "common"]);

    const DIRECTION_OPTIONS = [
        {
            value: "inbound",
            label: t("movements.inbound"),
            description: t("movements.inboundOptionDesc"),
        },
        {
            value: "outbound",
            label: t("movements.outbound"),
            description: t("movements.outboundOptionDesc"),
        },
    ];
    const [searchParams] = useSearchParams();
    const urlDirection = searchParams.get("direction");
    const isPreselected = urlDirection === "inbound" || urlDirection === "outbound";

    // An inline-create form returns with ?created_supplier=<id> / ?created_location=<id>
    // (CLEANUP-05). Preselect the matching field, then strip the param below.
    const createdSupplier = searchParams.get("created_supplier");
    const createdLocation = searchParams.get("created_location");

    // Restore an in-progress draft snapshotted before an inline-create jump
    // (CLEANUP-05). Caller seeds useState from `restored`; URL direction still
    // wins over any drafted direction.
    const { restored, save, clear } = useFormDraft<MovementDraft>("draft:movements:create");

    const [productId, setProductId] = useState(restored?.productId ?? "");
    const [direction, setDirection] = useState(
        isPreselected ? urlDirection : restored?.direction ?? "",
    );
    const [quantity, setQuantity] = useState(restored?.quantity ?? "1");
    const [locationId, setLocationId] = useState(createdLocation ?? restored?.locationId ?? "");
    const [reason, setReason] = useState(restored?.reason ?? "");
    const [supplierId, setSupplierId] = useState(createdSupplier ?? restored?.supplierId ?? "");

    // BATCH fields
    const [batchIdentifier, setBatchIdentifier] = useState(restored?.batchIdentifier ?? "");
    const [batchLotNumber, setBatchLotNumber] = useState(restored?.batchLotNumber ?? "");
    const [batchExpiry, setBatchExpiry] = useState(restored?.batchExpiry ?? "");

    // INDIVIDUAL fields
    const [identifier, setIdentifier] = useState(restored?.identifier ?? "");

    // TRACKER fields (status_change movement)
    const [newStatus, setNewStatus] = useState("");
    const [trackerNotes, setTrackerNotes] = useState("");

    // Drop the one-shot created_* params from the URL once consumed, so a reload
    // or further inline-create round-trip starts clean.
    useEffect(() => {
        if (!createdSupplier && !createdLocation) return;
        const params = new URLSearchParams(searchParams);
        params.delete("created_supplier");
        params.delete("created_location");
        const search = params.toString();
        navigate(
            { pathname: routerLocation.pathname, search: search ? `?${search}` : "" },
            { replace: true },
        );
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Snapshot every field, then jump to an inline-create route. The draft is
    // restored when this component remounts on return.
    const saveAndNavigate = (to: string) => {
        save({
            productId,
            direction,
            quantity,
            locationId,
            reason,
            supplierId,
            batchIdentifier,
            batchLotNumber,
            batchExpiry,
            identifier,
        });
        navigate(to);
    };

    const { onFinish, mutationResult } = useForm({
        action: "create",
        resource: "movements",
        redirect: false,
        onMutationSuccess: () => {
            clear();
            navigate("/movements");
        },
    });

    const { data: productsData } = useList({
        resource: "product-models",
        pagination: { mode: "off" },
    });

    const { data: locationsData } = useList({
        resource: "locations",
        pagination: { mode: "off" },
    });

    const { data: suppliersData } = useList({
        resource: "suppliers",
        pagination: { mode: "off" },
        filters: [{ field: "is_active", operator: "eq", value: true }],
    });

    const products = productsData?.data || [];
    const locations = locationsData?.data || [];
    const suppliers = suppliersData?.data || [];
    const supplierOptions = suppliers.map((s: any) => ({
        value: s.id,
        label: s.name,
        description: s.vat_number || undefined,
    }));

    const selectedProduct = products.find((p: any) => p.id === productId);
    const meta = selectedProduct?.profile ? PROFILE_METADATA[selectedProduct.profile as keyof typeof PROFILE_METADATA] : null;

    const isBatch = meta?.supportsBatches ?? false;
    const isIndividual = meta?.supportsSerials ?? false;

    const engineConfig = selectedProduct?.engine_ui_config;
    const isTracker =
        !!engineConfig &&
        engineConfig.input_type === "tracker" &&
        !!engineConfig.status_transitions &&
        Object.keys(engineConfig.status_transitions).length > 0;

    // Lookup current status of the PhysicalProduct by identifier match. Endpoint
    // only filters by product_model/status — filter client-side. BROKEN/SOLD
    // items aren't returned (viewset force-filters status=ACTIVE), so a missing
    // result falls back to allowing every top-level transition.
    const { data: physicalForTrackerData } = useList({
        resource: "physical-products",
        filters: [{ field: "product_model", operator: "eq", value: productId }],
        pagination: { mode: "off" },
        queryOptions: { enabled: isTracker && !!productId && !!identifier },
    });
    const currentTrackerStatus: string | undefined = isTracker
        ? (physicalForTrackerData?.data || []).find(
              (p: any) => p.identifier === identifier,
          )?.status
        : undefined;
    const trackerTransitions = engineConfig?.status_transitions || {};
    const allowedTrackerTargets: string[] = isTracker
        ? currentTrackerStatus && trackerTransitions[currentTrackerStatus]
            ? trackerTransitions[currentTrackerStatus]
            : Object.keys(trackerTransitions)
        : [];
    const noTransitionsAvailable =
        isTracker &&
        !!currentTrackerStatus &&
        Array.isArray(trackerTransitions[currentTrackerStatus]) &&
        trackerTransitions[currentTrackerStatus].length === 0;

    // Tracker products are non-directional (status change, not inbound/outbound).
    // Ignore any `?direction=` URL hint once the chosen product turns out to be
    // a tracker: clear the state and strip the param so a reload starts clean.
    useEffect(() => {
        if (!isTracker) return;
        if (direction) setDirection("");
        if (searchParams.get("direction")) {
            const params = new URLSearchParams(searchParams);
            params.delete("direction");
            const search = params.toString();
            navigate(
                { pathname: routerLocation.pathname, search: search ? `?${search}` : "" },
                { replace: true },
            );
        }
    }, [isTracker]); // eslint-disable-line react-hooks/exhaustive-deps

    const productOptions = products.map((p: any) => ({
        value: p.id,
        label: p.name,
        description: p.sku,
    }));

    // Filter locations: for inbound show real destinations, for outbound show real sources
    const realLocations = locations.filter(
        (l: any) => l.type === "WAREHOUSE" || l.type === "STORE",
    );

    const locationOptions = realLocations.map((l: any) => ({
        value: l.id,
        label: l.name,
        description: l.type,
    }));

    // The "external" side of a receipt/shipment is the External Vendor virtual
    // location specifically — NOT just any VIRTUAL (e.g. "Inventory Adjustment"),
    // otherwise receipts get mislabeled as adjustments.
    const VENDOR_ALIASES = ["External Vendor", "External", "Vendor"];
    const virtualLocation = locations.find(
        (l: any) => l.type === "VIRTUAL" && VENDOR_ALIASES.includes(l.name),
    );

    // Auto-select when only one real location exists
    useEffect(() => {
        if (realLocations.length === 1 && !locationId) {
            setLocationId(String(realLocations[0].id));
        }
    }, [realLocations.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const isInbound = direction === "inbound";
    const isOutbound = direction === "outbound";

    // Fetch current stock level for selected product at selected location
    const { data: stockLevelData } = useCustom({
        url: `${API_URL}/api/v1/stock/${productId}/location/${locationId}`,
        method: "get",
        queryOptions: { enabled: !!productId && !!locationId },
    });
    const currentStock = (stockLevelData?.data as any)?.quantity;

    const handleSubmit = async () => {
        if (isTracker) {
            const payload = {
                product_id: productId,
                physical_identifier: identifier,
                transaction_type: "status_change",
                new_status: newStatus,
                notes: trackerNotes || undefined,
            };
            await onFinish(payload);
            return;
        }

        const qty = parseFloat(quantity);
        if (isNaN(qty) || qty <= 0) return;

        const payload: any = {
            product_id: productId,
            quantity: qty,
            reason: reason || (isInbound ? t("movements.checkIn") : t("movements.checkOut")),
        };

        if (isInbound) {
            // From external/virtual → to selected location
            if (virtualLocation) {
                payload.from_id = virtualLocation.id;
            } else {
                payload.from_location_name = "External Vendor";
            }
            payload.to_id = locationId;
            if (supplierId) {
                payload.supplier_id = supplierId;
            }
        } else {
            // From selected location → to external/virtual
            payload.from_id = locationId;
            if (virtualLocation) {
                payload.to_id = virtualLocation.id;
            } else {
                payload.to_location_name = "External Vendor";
            }
        }

        // BATCH: include batch data
        if (isBatch) {
            const batchData: Record<string, string> = {};
            if (batchIdentifier) batchData.batch_identifier = batchIdentifier;
            if (batchLotNumber) batchData.lot_number = batchLotNumber;
            if (batchExpiry) batchData.expiry_date = batchExpiry;
            if (Object.keys(batchData).length > 0) {
                payload.batch_data = batchData;
            }
        }

        // INDIVIDUAL: include identifier
        if (isIndividual && identifier) {
            payload.physical_identifier = identifier;
        }

        await onFinish(payload);
    };

    const isLoading = mutationResult.isLoading;

    // Direction accent colors
    const directionAccent = isInbound
        ? "border-emerald-500/30"
        : isOutbound
          ? "border-rose-500/30"
          : "";

    const submitLabel = isTracker
        ? t("movements.statusChangeSubmit")
        : isInbound
          ? t("movements.checkIn")
          : isOutbound
            ? t("movements.checkOut")
            : t("common:save");

    // Outbound beyond available stock: backend rejects it anyway, but a
    // disabled submit beats a round-trip ending in an error banner.
    const exceedsAvailableStock =
        isOutbound &&
        !isIndividual &&
        currentStock != null &&
        parseFloat(quantity) > Number(currentStock);

    const submitDisabled = isTracker
        ? noTransitionsAvailable || !(productId && identifier && newStatus)
        : exceedsAvailableStock || (isIndividual && !identifier);

    return (
        <FormPage
            title={t("movements.recordMovement")}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            onCancel={() => {
                clear();
                navigate("/movements");
            }}
            submitLabel={submitLabel}
            submitDisabled={submitDisabled}
        >
            {mutationResult?.isError && (
                <FormErrorBanner
                    title={t("movements.errorCreating")}
                    error={mutationResult.error}
                />
            )}

            {/* Section 1: Product */}
            <FormSection
                title={t("movements.product")}
                description={t("movements.productSectionDesc")}
            >
                <Select
                    custom
                    label={t("movements.productModel")}
                    value={productId}
                    onChange={(val) => {
                        setProductId(String(val));
                        setIdentifier("");
                        setBatchIdentifier("");
                    }}
                    options={productOptions}
                    placeholder={t("movements.selectProductPlaceholder")}
                    required
                />
                {productsData && products.length === 0 && (
                    <p className="text-xs text-zinc-500">
                        {t("movements.noProductsPrefix")}
                        <button
                            type="button"
                            onClick={() => saveAndNavigate(`/products/create?returnTo=${returnTo}`)}
                            className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                        >
                            {t("movements.noProductsLink")}
                        </button>
                    </p>
                )}
            </FormSection>

            {/* Section 2: Movement Details */}
            {productId && !isTracker && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <FormSection
                        title={t("movements.movementDetails")}
                        description={t("movements.movementDetailsDesc")}
                    >
                        {isPreselected ? (
                            <div className="flex items-center gap-3">
                                <span
                                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                                        direction === "inbound"
                                            ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                                            : "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20"
                                    }`}
                                >
                                    {direction === "inbound" ? (
                                        <PackagePlus size={14} />
                                    ) : (
                                        <PackageMinus size={14} />
                                    )}
                                    {direction === "inbound" ? t("movements.receivingStock") : t("movements.shippingOut")}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => navigate("/movements/create")}
                                    className="text-sm text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
                                >
                                    {t("movements.change")}
                                </button>
                            </div>
                        ) : (
                            <div className={directionAccent ? `rounded-lg border-l-4 ${directionAccent} pl-4` : ""}>
                                <Select
                                    custom
                                    label={t("movements.direction")}
                                    labelExtra={
                                        <InfoTip content={t("movements.directionHelp")} />
                                    }
                                    value={direction}
                                    onChange={(val) => setDirection(String(val))}
                                    options={DIRECTION_OPTIONS}
                                    placeholder={t("movements.selectDirection")}
                                    required
                                    helperText={t("movements.directionHelperText")}
                                />
                            </div>
                        )}

                        {direction && (
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 flex flex-col gap-4">
                                {!isIndividual && (
                                    <div>
                                        <Input
                                            label={t("movements.quantity")}
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={quantity}
                                            onChange={(e) => setQuantity(e.target.value)}
                                            required
                                            helperText={t("movements.quantityHelper")}
                                        />
                                        {currentStock != null && locationId && (
                                            <p className="mt-1 text-xs text-zinc-500">
                                                {t("movements.currentStockLabel")} <span className="text-zinc-300 font-medium">{currentStock} {t("movements.units")}</span>
                                                {isOutbound && parseFloat(quantity) > currentStock && (
                                                    <span className="text-amber-400 ml-2">{t("movements.exceedsStock")}</span>
                                                )}
                                            </p>
                                        )}
                                    </div>
                                )}

                                <div>
                                    <Select
                                        custom
                                        label={isInbound ? t("movements.destinationLocation") : t("movements.sourceLocation")}
                                        value={locationId}
                                        onChange={(val) => setLocationId(String(val))}
                                        options={locationOptions}
                                        placeholder={isInbound ? t("movements.destinationPlaceholder") : t("movements.sourcePlaceholder")}
                                        required
                                        helperText={
                                            isInbound
                                                ? t("movements.destinationHelper")
                                                : t("movements.sourceHelper")
                                        }
                                    />
                                    {realLocations.length === 1 && (
                                        <p className="mt-1 text-xs text-zinc-500">
                                            {t("movements.singleLocationPrefix")}
                                            <button
                                                type="button"
                                                onClick={() => saveAndNavigate(`/locations/create?returnTo=${returnTo}`)}
                                                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                                            >
                                                {t("movements.settingsLocations")}
                                            </button>
                                        </p>
                                    )}
                                </div>

                                {isInbound && (
                                    <div>
                                        <Select
                                            custom
                                            label={t("movements.supplierOptional")}
                                            value={supplierId}
                                            onChange={(val) => setSupplierId(String(val))}
                                            options={supplierOptions}
                                            placeholder={t("movements.selectSupplierPlaceholder")}
                                            helperText={t("movements.supplierHelper")}
                                        />
                                        {suppliersData && suppliers.length === 0 && (
                                            <p className="mt-1 text-xs text-zinc-500">
                                                {t("movements.noSuppliersPrefix")}
                                                <button
                                                    type="button"
                                                    onClick={() => saveAndNavigate(`/suppliers/create?returnTo=${returnTo}`)}
                                                    className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                                                >
                                                    {t("movements.noSuppliersLink")}
                                                </button>
                                            </p>
                                        )}
                                    </div>
                                )}

                                <Input
                                    label={t("movements.reason")}
                                    labelExtra={
                                        <InfoTip content={t("movements.reasonHelp")} />
                                    }
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder={isInbound ? t("movements.reasonPlaceholderInbound") : t("movements.reasonPlaceholderOutbound")}
                                    helperText={t("movements.reasonHelper")}
                                />
                            </div>
                        )}
                    </FormSection>
                </div>
            )}

            {/* Section 3: Batch details (BATCH products) */}
            {productId && direction && !isTracker && isBatch && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <FormSection
                        title={t("movements.batchInfo")}
                        description={t("movements.batchInfoDesc")}
                    >
                        <Input
                            label={t("movements.batchIdentifier")}
                            labelExtra={
                                <InfoTip content={t("movements.batchIdentifierHelp")} />
                            }
                            value={batchIdentifier}
                            onChange={(e) => setBatchIdentifier(e.target.value)}
                            placeholder={t("movements.batchIdentifierPlaceholder")}
                            helperText={t("movements.batchHelperText")}
                        />
                        <Input
                            label={t("movements.lotNumber")}
                            value={batchLotNumber}
                            onChange={(e) => setBatchLotNumber(e.target.value)}
                            placeholder={t("movements.lotNumberPlaceholder")}
                        />
                        <Input
                            label={t("movements.expiryDate")}
                            type="date"
                            value={batchExpiry}
                            onChange={(e) => setBatchExpiry(e.target.value)}
                        />
                    </FormSection>
                </div>
            )}

            {/* Section 4: Individual item (INDIVIDUAL/serialized products) */}
            {productId && direction && !isTracker && isIndividual && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <FormSection
                        title={t("movements.itemIdentification")}
                        description={t("movements.itemIdentificationDesc")}
                    >
                        <Input
                            label={t("movements.serialNumberIdentifier")}
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            placeholder={t("movements.serialPlaceholder")}
                            required
                            helperText={t("movements.serialHelper")}
                        />
                    </FormSection>
                </div>
            )}

            {/* Section 4b: Tracker status change (engine-driven products) */}
            {productId && isTracker && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <FormSection
                        title={t("movements.itemIdentification")}
                        description={t("movements.itemIdentificationDesc")}
                    >
                        <Input
                            label={t("movements.serialNumberIdentifier")}
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            placeholder={t("movements.serialPlaceholder")}
                            required
                            helperText={t("movements.serialHelper")}
                        />
                    </FormSection>
                </div>
            )}

            {/* Section 4c: Status-change controls (engine-driven products) */}
            {productId && isTracker && identifier && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <FormSection title={t("movements.statusChangeMode")}>
                        {currentTrackerStatus && (
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-zinc-500">
                                    {t("movements.currentStatusLabel")}:
                                </span>
                                <span className="inline-flex items-center rounded-md bg-indigo-500/10 px-3 py-1.5 text-sm font-medium text-indigo-300 ring-1 ring-indigo-500/20">
                                    {currentTrackerStatus}
                                </span>
                            </div>
                        )}
                        {noTransitionsAvailable ? (
                            <p className="text-sm text-zinc-400">
                                {t("movements.noTransitionsAvailable", {
                                    status: currentTrackerStatus,
                                })}
                            </p>
                        ) : (
                            <>
                                <StatusPicker
                                    label={t("movements.newStatusLabel")}
                                    statuses={allowedTrackerTargets}
                                    value={newStatus}
                                    onChange={setNewStatus}
                                />
                                <Input
                                    label={t("movements.statusChangeNotes")}
                                    value={trackerNotes}
                                    onChange={(e) => setTrackerNotes(e.target.value)}
                                    placeholder={t("movements.reasonPlaceholderInbound")}
                                    helperText={t("movements.reasonHelper")}
                                />
                            </>
                        )}
                    </FormSection>
                </div>
            )}

            {/* Direction visual indicator */}
            {!isTracker && direction && locationId && (
                <div className="flex items-center justify-center gap-3 py-2 text-sm">
                    {isInbound ? (
                        <>
                            <span className="text-zinc-500">{t("movements.external")}</span>
                            <ArrowUpRight size={18} className="text-emerald-400" />
                            <span className="text-emerald-400 font-medium">
                                {realLocations.find((l: any) => l.id === locationId)?.name || t("movements.locationFallback")}
                            </span>
                        </>
                    ) : (
                        <>
                            <span className="text-rose-400 font-medium">
                                {realLocations.find((l: any) => l.id === locationId)?.name || t("movements.locationFallback")}
                            </span>
                            <ArrowDownLeft size={18} className="text-rose-400" />
                            <span className="text-zinc-500">{t("movements.external")}</span>
                        </>
                    )}
                </div>
            )}
        </FormPage>
    );
};
