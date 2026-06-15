import React, { useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useWidgetData } from "../hooks/useWidgetData";
import { useWidgetApiKey } from "../hooks/useWidgetApiKey";
import { useTheme } from "../hooks/useTheme";
import { useHostCommunication, useWidgetResize } from "../hooks/useHostCommunication";
import { useScannerConfirmation } from "../scanner/useScannerConfirmation";
import { QRScanner } from "../scanner/QRScanner";
import type { QRScanResult } from "../scanner/QRScanner";
import { ScanResult } from "../scanner/ScanResult";
import { QuantityInput } from "../scanner/QuantityInput";
import { ConfirmationDialog } from "../scanner/ConfirmationDialog";
import { SuccessFeedback, ErrorFeedback } from "../scanner/SuccessFeedback";

export const ScannerWidget = () => {
    const { t } = useTranslation("widget");
    const rootRef = useRef<HTMLDivElement>(null);
    useTheme(rootRef);

    const { apiKey, resolvingKey } = useWidgetApiKey();

    const {
        apiUrl,
        loading,
        error,
        products,
        locations,
    } = useWidgetData(apiKey, resolvingKey);

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
            onSetTheme: applyThemeToRoot,
        },
    });

    const scannerFlow = useScannerConfirmation({
        apiKey,
        apiUrl,
        sendTransactionEvent,
        sendErrorEvent,
    });

    useWidgetResize([scannerFlow.step]);

    // QR redirect pre-population: when accessed via /go/{code}/ with product/location params,
    // skip scanner and jump directly to ScanResult
    React.useEffect(() => {
        if (loading) return;
        const urlProductId = searchParams.get("product_id");
        const urlLocationId = searchParams.get("location_id");
        const urlIdentifier = searchParams.get("identifier");
        if (urlProductId && scannerFlow.step === "scanning") {
            const product = products.find(p => p.id === urlProductId);
            if (product) {
                const location = locations.find(l => l.id === urlLocationId);
                const prePopulated: QRScanResult = {
                    code: searchParams.get("qr_code") || "redirect",
                    productId: urlProductId,
                    locationId: urlLocationId || undefined,
                    identifier: urlIdentifier || undefined,
                    productName: product.name,
                    productSku: product.sku,
                    profile: product.profile,
                    engineType: product.engine_type,
                    trackingMode: product.tracking_mode,
                    quantity: product.quantity,
                    locationName: location?.name,
                };
                scannerFlow.goToResult(prePopulated);
            }
        }
    }, [loading, products, locations]);

    // Browser back button support
    React.useEffect(() => {
        const handlePopState = () => {
            if (scannerFlow.step !== "scanning") {
                scannerFlow.goBack();
            }
        };
        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, [scannerFlow.step, scannerFlow.goBack]);

    // Push history state on step change for back navigation
    React.useEffect(() => {
        if (scannerFlow.step !== "scanning") {
            window.history.pushState({ scannerStep: scannerFlow.step }, "");
        }
    }, [scannerFlow.step]);

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

    const scannerRootStyle: React.CSSProperties = {
        fontFamily: 'var(--pi-font, system-ui)',
        color: 'var(--pi-text, #f4f4f5)',
        backgroundColor: 'var(--pi-bg, #09090b)',
        minHeight: typeof CSS !== 'undefined' && CSS.supports?.('min-height', '100dvh') ? '100dvh' : '100vh',
    };

    const unitLabel = scannerFlow.scanResult?.profile === "BATCH_TRACKED" || scannerFlow.scanResult?.profile === "PERISHABLE"
        || scannerFlow.scanResult?.engineType === "bucket" ? t("units") : undefined;

    return (
        <div ref={rootRef} className="pi-theme" style={scannerRootStyle}>
            {/* Responsive wrapper: full-bleed mobile, centered card on md+ */}
            <div className="w-full h-full min-h-[100dvh] md:flex md:items-start md:justify-center md:p-6 lg:p-10">
                <div className="w-full md:max-w-md md:rounded-2xl md:shadow-xl md:overflow-hidden md:min-h-[80vh]" style={{ border: '1px solid var(--pi-border, rgba(255,255,255,0.06))' }}>
                    {scannerFlow.step === "scanning" && (
                        <QRScanner
                            apiKey={apiKey}
                            onScanComplete={scannerFlow.goToResult}
                        />
                    )}

                    {scannerFlow.step === "result" && scannerFlow.scanResult && (
                        <ScanResult
                            scanResult={scannerFlow.scanResult}
                            onSelectOperation={scannerFlow.goToQuantity}
                            onBack={scannerFlow.goBack}
                        />
                    )}

                    {scannerFlow.step === "quantity" && scannerFlow.scanResult && scannerFlow.operation && (() => {
                        const sr = scannerFlow.scanResult;
                        const isDim = sr.engineType === "dimension";
                        const isTB = sr.engineType === "time_based";
                        const calcConfig = (sr as any).calc_config;
                        const uiConf = calcConfig?.ui_config;
                        return (
                            <QuantityInput
                                scanResult={sr}
                                operation={scannerFlow.operation!}
                                onConfirm={(qty, note, metadata) => scannerFlow.goToConfirm(qty, note, metadata)}
                                onBack={scannerFlow.goBack}
                                unitLabel={unitLabel}
                                dimensionFields={isDim ? uiConf?.fields?.map((f: any) => ({ name: f.name, label: f.label, unit: f.unit })) : undefined}
                                dimensionFormula={isDim ? uiConf?.formula : undefined}
                                dimensionComputedUnit={isDim ? uiConf?.computed_unit : undefined}
                                showExpiryDate={isTB ? (uiConf?.expiry_tracking !== false) : undefined}
                                timeUnit={isTB ? uiConf?.time_unit : undefined}
                            />
                        );
                    })()}

                    {scannerFlow.step === "confirming" && scannerFlow.scanResult && scannerFlow.operation && (
                        <ConfirmationDialog
                            scanResult={scannerFlow.scanResult}
                            operation={scannerFlow.operation}
                            quantity={scannerFlow.quantity}
                            unitLabel={unitLabel}
                            onConfirm={(note) => scannerFlow.executeOperation(note)}
                            onCancel={scannerFlow.goBack}
                            isLoading={scannerFlow.isLoading}
                        />
                    )}

                    {scannerFlow.step === "success" && scannerFlow.scanResult && scannerFlow.operation && (
                        <SuccessFeedback
                            scanResult={scannerFlow.scanResult}
                            operation={scannerFlow.operation}
                            quantity={scannerFlow.quantity}
                            unitLabel={unitLabel}
                            previousQuantity={scannerFlow.previousQuantity}
                            onScanAnother={scannerFlow.resetFlow}
                        />
                    )}

                    {scannerFlow.step === "error" && (
                        <ErrorFeedback
                            errorMessage={scannerFlow.error || t("unknownError")}
                            onRetry={scannerFlow.goBack}
                            onCancel={scannerFlow.resetFlow}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
