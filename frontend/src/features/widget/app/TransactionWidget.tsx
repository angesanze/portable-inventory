import { useWidgetOperations } from "../hooks/useWidgetOperations";
import React, { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useWidgetData } from "../hooks/useWidgetData";
import { useWidgetApiKey } from "../hooks/useWidgetApiKey";
import { PROFILE_METADATA } from "../../../types/api";
import { LocationSelector } from "../components/LocationSelector";
import { OperationPanel } from "../components/OperationPanel";
import { useTheme } from "../hooks/useTheme";
import { useHostCommunication, useWidgetResize } from "../hooks/useHostCommunication";

export const TransactionWidget = () => {
    const { t } = useTranslation("widget");
    const rootRef = useRef<HTMLDivElement>(null);
    useTheme(rootRef);

    const { apiKey, resolvingKey } = useWidgetApiKey();

    const {
        apiUrl,
        loading,
        setLoading,
        actionLoading,
        setActionLoading,
        error,
        companyName,
        locations,
        products,
        batches,
        setBatches,
        availableItems,
        selectedLocation,
        setSelectedLocation,
        locationLocked,
        selectedProduct,
        setSelectedProduct,
        productLocked,
        identifier,
        setIdentifier,
        identifierLocked,
        selectedBatchId,
        batchManagerData,
        qrCode,
        loadBatches,
        loadAvailableItems,
        loadBatchManagerData,
        loadProductsForLocation
    } = useWidgetData(apiKey, resolvingKey);

    const [step, setStep] = useState<"LOCATION" | "OPERATION">("LOCATION");
    const [quantity, setQuantity] = useState("1");
    const [batchIdentifier, setBatchIdentifier] = useState("");
    const [batchData, setBatchData] = useState<Record<string, any>>({});
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
    const [expiryDate, setExpiryDate] = useState("");
    const [batchRefInput, setBatchRefInput] = useState("");

    // Derived State
    const activeProduct = products.find(p => p.id === selectedProduct);
    const activeSubLocation = locations.find(l => l.id === selectedLocation);
    const activeProfile = activeProduct?.profile;
    const activeProfileMeta = activeProfile ? PROFILE_METADATA[activeProfile] : null;
    const isBucketStrategy = activeProfileMeta?.supportsBatches ?? false;

    const [componentBatches, setComponentBatches] = useState<Record<string, any[]>>({});
    // QR state stubs — useWidgetOperations destructures these
    const [qrConfiguring, setQrConfiguring] = useState(false);
    const [qrLocking, setQrLocking] = useState(false);
    const [qrConfigured, setQrConfigured] = useState(false);

    const applyThemeToRoot = useCallback((theme: { primaryColor?: string; backgroundColor?: string; textColor?: string; borderRadius?: string; fontFamily?: string; successColor?: string; dangerColor?: string; mutedColor?: string; borderColor?: string; surfaceColor?: string; inputBgColor?: string; compact?: boolean }) => {
        const el = rootRef.current;
        if (!el) return;
        if (theme.primaryColor) el.style.setProperty('--pi-primary', theme.primaryColor);
        if (theme.backgroundColor) el.style.setProperty('--pi-bg', theme.backgroundColor);
        if (theme.textColor) el.style.setProperty('--pi-text', theme.textColor);
        if (theme.borderRadius) el.style.setProperty('--pi-radius', theme.borderRadius);
        if (theme.fontFamily) el.style.setProperty('--pi-font', theme.fontFamily);
        if (theme.successColor) el.style.setProperty('--pi-success', theme.successColor);
        if (theme.dangerColor) el.style.setProperty('--pi-danger', theme.dangerColor);
        if (theme.mutedColor) el.style.setProperty('--pi-muted', theme.mutedColor);
        if (theme.borderColor) el.style.setProperty('--pi-border', theme.borderColor);
        if (theme.surfaceColor) el.style.setProperty('--pi-surface', theme.surfaceColor);
        if (theme.inputBgColor) el.style.setProperty('--pi-input-bg', theme.inputBgColor);
        if (theme.compact) el.classList.add('pi-compact');
        else el.classList.remove('pi-compact');
    }, []);

    const { sendTransactionEvent, sendErrorEvent } = useHostCommunication({
        handlers: {
            onSetProduct: (productId) => setSelectedProduct(productId),
            onSetLocation: (locationId) => {
                setSelectedLocation(locationId);
                setStep("OPERATION");
            },
            onSetTheme: applyThemeToRoot,
        },
    });

    useWidgetResize([step, locations, products, batches, message, selectedProduct, quantity]);

    // Auto-advance to OPERATION if location pre-selected
    React.useEffect(() => {
        if (selectedLocation && step !== "OPERATION") {
            setStep("OPERATION");
        }
    }, [selectedLocation]);

    // Fetch batch manager data when product changes
    React.useEffect(() => {
        if (selectedProduct && activeProfile === 'ASSEMBLED') {
            loadBatchManagerData(selectedProduct, selectedLocation || "");
        }
    }, [selectedProduct, activeProfile, selectedLocation]);

    // Fetch PhysicalProduct serials when a SERIALIZED product is selected at a
    // known location. Drives the `Select Item` dropdown in TrackerForm /
    // TrackerStatusForm. Without this `availableItems` stays empty and the form
    // degrades to a free-text scan input.
    React.useEffect(() => {
        if (selectedProduct && selectedLocation && activeProfileMeta?.supportsSerials) {
            loadAvailableItems(selectedProduct, selectedLocation);
        }
    }, [selectedProduct, selectedLocation, activeProfileMeta?.supportsSerials]);

    // Fetch ProductBatch rows for BATCH_TRACKED / PERISHABLE products. Drives the
    // batch dropdown / time-based panel. Without this `batches` is only populated
    // after a transaction succeeds (via useWidgetOperations), so the first render
    // of the panel has no batches to pick from.
    React.useEffect(() => {
        if (selectedProduct && selectedLocation && activeProfileMeta?.supportsBatches) {
            loadBatches(selectedProduct, selectedLocation);
        }
    }, [selectedProduct, selectedLocation, activeProfileMeta?.supportsBatches]);

    const widgetState = {
        quantity, setQuantity, identifier, setIdentifier, batchIdentifier,
        batchData, setMessage, componentBatches, setComponentBatches,
        setQrConfiguring, setQrConfigured, setQrLocking,
        sendTransactionEvent, sendErrorEvent,
        expiryDate, batchRef: batchRefInput,
        fulfillSuccessText: t("workOrder.fulfillSuccess"),
        fulfillFailedText: t("workOrder.fulfillFailed"),
    };

    const widgetDataBag = {
        products, batches, setBatches, selectedProduct, selectedLocation,
        selectedBatchId, batchManagerData, loadBatches, loadAvailableItems,
        loadBatchManagerData, loadProductsForLocation, setLoading, setActionLoading, qrCode
    };

    const {
        loadComponentBatches,
        fetchBatchDetails,
        handleMove,
        handleStatusChange,
        handleFulfillWorkOrder,
    } = useWidgetOperations(apiKey, apiUrl, widgetDataBag, widgetState);

    // WorkOrder fulfillment is only valid in the ASSEMBLED (batch-manager) context,
    // where selectedProduct is the WorkOrder id.
    const onFulfillWorkOrder = useCallback(() => {
        if (!selectedProduct) return;
        if (!window.confirm(t("workOrder.fulfillConfirm"))) return;
        handleFulfillWorkOrder(selectedProduct);
    }, [selectedProduct, handleFulfillWorkOrder, t]);

    React.useEffect(() => {
        fetchBatchDetails();
    }, [selectedBatchId, isBucketStrategy]);

    if (loading) return (
        <div ref={rootRef} className="pi-theme flex justify-center items-center h-screen" style={{ backgroundColor: 'var(--pi-bg, #09090b)', fontFamily: 'var(--pi-font, system-ui)' }}>
            <div className="animate-spin h-8 w-8 border-2 rounded-full border-t-transparent" style={{ borderColor: 'var(--pi-primary, #6366f1)' }}></div>
        </div>
    );

    if (error) return (
        <div ref={rootRef} className="pi-theme p-8 text-center h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--pi-bg, #09090b)', fontFamily: 'var(--pi-font, system-ui)' }}>
            <div className="p-6 rounded-xl" style={{ backgroundColor: 'var(--pi-surface, #18181b)', border: '1px solid rgba(244,63,94,0.2)' }}>
                <div className="font-bold text-lg mb-2" style={{ color: 'var(--pi-danger, #f43f5e)' }}>{t("accessDenied")}</div>
                <p style={{ color: 'var(--pi-muted, #a1a1aa)' }}>{error}</p>
            </div>
        </div>
    );

    if (step === "LOCATION") {
        return (
            <div ref={rootRef} className="pi-theme" style={{ fontFamily: 'var(--pi-font, system-ui)', color: 'var(--pi-text, #f4f4f5)', backgroundColor: 'var(--pi-bg, #09090b)', minHeight: '100vh' }}>
                <LocationSelector
                    companyName={companyName}
                    locations={locations}
                    selectedLocation={selectedLocation}
                    onSelect={locId => {
                        setSelectedLocation(locId);
                        setStep("OPERATION");
                    }}
                    apiUrl={apiUrl}
                    apiKey={apiKey}
                />
            </div>
        );
    }

    return (
        <div ref={rootRef} className="pi-theme" style={{ fontFamily: 'var(--pi-font, system-ui)', color: 'var(--pi-text, #f4f4f5)', backgroundColor: 'var(--pi-bg, #09090b)', minHeight: '100vh' }}>
        <OperationPanel
            companyName={companyName}
            activeSubLocation={activeSubLocation}
            locationLocked={locationLocked}
            onBackToLocation={() => setStep("LOCATION")}
            products={products}
            selectedProduct={selectedProduct}
            productLocked={productLocked}
            onProductChange={(id) => {
                setSelectedProduct(id);
                const p = products.find(prod => prod.id === id);
                if (p?.calc_config?.ui_config?.step) {
                    setQuantity(String(p.calc_config.ui_config.step));
                } else {
                    setQuantity("1");
                }
            }}
            handleMove={handleMove}
            handleStatusChange={handleStatusChange}
            actionLoading={actionLoading}
            message={message}
            quantity={quantity}
            setQuantity={setQuantity}
            identifier={identifier}
            setIdentifier={setIdentifier}
            identifierLocked={identifierLocked}
            availableItems={availableItems}
            batchIdentifier={batchIdentifier}
            setBatchIdentifier={setBatchIdentifier}
            batchData={batchData}
            setBatchData={setBatchData}
            expiryDate={expiryDate}
            setExpiryDate={setExpiryDate}
            batchRef={batchRefInput}
            setBatchRef={setBatchRefInput}
            selectedBatchId={selectedBatchId}
            batchManagerData={batchManagerData}
            expandedModelId={expandedModelId}
            setExpandedModelId={setExpandedModelId}
            loadComponentBatches={loadComponentBatches}
            loadAvailableItems={loadAvailableItems}
            selectedLocation={selectedLocation}
            setMessage={setMessage}
            onFulfillWorkOrder={onFulfillWorkOrder}
            fulfillLabel={t("workOrder.fulfill")}
        />
        </div>
    );
};
