import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Html5Qrcode, Html5QrcodeScannerState, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, CameraOff, Flashlight, FlashlightOff, Keyboard, X, Loader2 } from "lucide-react";
import { API_URL } from "../../../config";

export interface QRScanResult {
    code: string;
    productId?: string;
    locationId?: string;
    identifier?: string;
    productName?: string;
    productSku?: string;
    profile?: import("../../../types/api").InventoryProfile;
    engineType?: string;
    trackingMode?: string;
    /** @deprecated Use profile instead */
    strategy?: any;
    quantity?: number;
    locationName?: string;
}

export type ScannerError =
    | "camera_denied"
    | "no_camera"
    | "invalid_qr"
    | "expired_code"
    | "locked_code"
    | "network_error"
    | "unknown";

interface QRScannerProps {
    apiKey: string | null;
    onScanComplete: (result: QRScanResult) => void;
    onError?: (error: ScannerError, message: string) => void;
}

const SCANNER_REGION_ID = "qr-scanner-region";

export const QRScanner: React.FC<QRScannerProps> = ({ apiKey, onScanComplete, onError }) => {
    const { t } = useTranslation("widget");
    const errorMessage = useCallback(
        (type: ScannerError): string => t(`scanner.errors.${type}`),
        [t]
    );
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [torchSupported, setTorchSupported] = useState(false);
    const [showManualEntry, setShowManualEntry] = useState(false);
    const [manualCode, setManualCode] = useState("");
    const [error, setError] = useState<{ type: ScannerError; message: string } | null>(null);
    const [resolving, setResolving] = useState(false);
    const isProcessingRef = useRef(false);

    const apiUrl = `${API_URL}/api/v1`;

    const resolveQRCode = useCallback(async (code: string): Promise<QRScanResult | null> => {
        if (!apiKey) {
            setError({ type: "network_error", message: t("scanner.errors.missingApiKey") });
            return null;
        }

        setResolving(true);
        setError(null);

        try {
            // Single resolution endpoint: matches a manufacturer EAN/UPC barcode
            // exactly, then falls back to a proprietary DynamicQRCode.code.
            const res = await fetch(
                `${apiUrl}/widget/resolve_barcode/?api_key=${apiKey}&code=${encodeURIComponent(code)}`,
            );
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const detail = data.detail || "";

                if (res.status === 404 || detail.toLowerCase().includes("invalid")) {
                    setError({ type: "invalid_qr", message: errorMessage("invalid_qr") });
                    onError?.("invalid_qr", errorMessage("invalid_qr"));
                    return null;
                }
                if (detail.toLowerCase().includes("expired")) {
                    setError({ type: "expired_code", message: errorMessage("expired_code") });
                    onError?.("expired_code", errorMessage("expired_code"));
                    return null;
                }
                if (detail.toLowerCase().includes("locked")) {
                    setError({ type: "locked_code", message: errorMessage("locked_code") });
                    onError?.("locked_code", errorMessage("locked_code"));
                    return null;
                }

                setError({ type: "unknown", message: detail || errorMessage("unknown") });
                onError?.("unknown", detail || errorMessage("unknown"));
                return null;
            }

            const data = await res.json();

            // resolve_barcode returns the widget-detail product payload directly
            // (same shape as widget/<id>/). Tolerate the legacy list shape too.
            const product = data.products?.[0] || data.product || data;
            const location = data.location || data.default_location;

            return {
                code,
                productId: product?.id,
                productName: product?.name || product?.product_name,
                productSku: product?.sku,
                profile: product?.profile,
                engineType: product?.engine_type,
                trackingMode: product?.tracking_mode,
                // strategy field removed — profile is the source of truth
                quantity: product?.quantity,
                locationId: location?.id,
                locationName: location?.name,
                identifier: data.identifier,
            };
        } catch (err) {
            setError({ type: "network_error", message: errorMessage("network_error") });
            onError?.("network_error", errorMessage("network_error"));
            return null;
        } finally {
            setResolving(false);
        }
    }, [apiKey, apiUrl, onError, t, errorMessage]);

    const handleDecodedResult = useCallback(async (decodedText: string) => {
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;

        // Extract code from URL if it's a full URL, otherwise use as-is
        let code = decodedText;
        try {
            const url = new URL(decodedText);
            const qrParam = url.searchParams.get("qr_code");
            const pathMatch = url.pathname.match(/\/go\/([^/]+)/);
            if (qrParam) {
                code = qrParam;
            } else if (pathMatch) {
                code = pathMatch[1];
            }
        } catch {
            // Not a URL, use raw value
        }

        const result = await resolveQRCode(code);
        if (result) {
            onScanComplete(result);
        }

        // Allow re-scanning after a delay
        setTimeout(() => {
            isProcessingRef.current = false;
        }, 2000);
    }, [resolveQRCode, onScanComplete]);

    const startScanner = useCallback(async () => {
        setError(null);

        try {
            const devices = await Html5Qrcode.getCameras();
            if (!devices || devices.length === 0) {
                setError({ type: "no_camera", message: errorMessage("no_camera") });
                onError?.("no_camera", errorMessage("no_camera"));
                return;
            }

            // Enable 1D barcode formats (EAN/UPC/CODE-128) alongside QR so the
            // camera decodes manufacturer barcodes, not just proprietary QR codes.
            // html5-qrcode wraps ZXing, which supports these natively.
            const scanner = new Html5Qrcode(SCANNER_REGION_ID, {
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.QR_CODE,
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.CODE_128,
                ],
                verbose: false,
            });
            scannerRef.current = scanner;

            await scanner.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1,
                },
                (decodedText) => {
                    handleDecodedResult(decodedText);
                },
                () => {
                    // Ignore scan failures (no QR in frame)
                }
            );

            setIsScanning(true);

            // Check torch support
            try {
                const capabilities = scanner.getRunningTrackCameraCapabilities();
                if (capabilities.torchFeature().isSupported()) {
                    setTorchSupported(true);
                }
            } catch {
                // Torch not supported
            }
        } catch (err: any) {
            const msg = err?.message || String(err);
            if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
                setError({ type: "camera_denied", message: errorMessage("camera_denied") });
                onError?.("camera_denied", errorMessage("camera_denied"));
            } else if (msg.includes("NotFoundError") || msg.includes("no camera")) {
                setError({ type: "no_camera", message: errorMessage("no_camera") });
                onError?.("no_camera", errorMessage("no_camera"));
            } else {
                setError({ type: "unknown", message: msg });
                onError?.("unknown", msg);
            }
        }
    }, [handleDecodedResult, onError, errorMessage]);

    const stopScanner = useCallback(async () => {
        const scanner = scannerRef.current;
        if (scanner) {
            try {
                const state = scanner.getState();
                if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
                    await scanner.stop();
                }
                scanner.clear();
            } catch {
                // Ignore cleanup errors
            }
            scannerRef.current = null;
        }
        setIsScanning(false);
        setTorchOn(false);
        setTorchSupported(false);
    }, []);

    const toggleTorch = useCallback(async () => {
        const scanner = scannerRef.current;
        if (!scanner || !torchSupported) return;

        try {
            const capabilities = scanner.getRunningTrackCameraCapabilities();
            const newState = !torchOn;
            await capabilities.torchFeature().apply(newState);
            setTorchOn(newState);
        } catch {
            // Torch toggle failed silently
        }
    }, [torchOn, torchSupported]);

    const handleManualSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = manualCode.trim();
        if (!trimmed) return;
        await handleDecodedResult(trimmed);
    }, [manualCode, handleDecodedResult]);

    // Start scanner on mount, stop on unmount
    useEffect(() => {
        if (!showManualEntry) {
            startScanner();
        }
        return () => {
            stopScanner();
        };
    }, [showManualEntry]);

    const handleRetry = useCallback(() => {
        setError(null);
        isProcessingRef.current = false;
        if (!showManualEntry) {
            stopScanner().then(() => startScanner());
        }
    }, [showManualEntry, stopScanner, startScanner]);

    return (
        <div className="flex flex-col h-full min-h-[400px]" data-testid="qr-scanner">
            {/* Header */}
            <div
                className="text-white p-4 text-center"
                style={{
                    background: "linear-gradient(to right, var(--pi-primary, #4f46e5), color-mix(in srgb, var(--pi-primary, #4f46e5), #7c3aed 50%))",
                }}
            >
                <div className="text-xs uppercase tracking-widest opacity-75 mb-1">{t("scanner.qrScanner")}</div>
                <h2 className="text-lg font-bold">{t("scanner.scanTitle")}</h2>
            </div>

            {/* Scanner / Manual Entry Area */}
            <div className="flex-1 flex flex-col items-center justify-center p-4 bg-slate-900 relative">
                {resolving && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
                        <div className="flex flex-col items-center gap-3 text-white">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <span className="text-sm font-medium">{t("scanner.resolving")}</span>
                        </div>
                    </div>
                )}

                {showManualEntry ? (
                    <div className="w-full max-w-sm">
                        <form onSubmit={handleManualSubmit} className="space-y-4">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">
                                {t("scanner.enterManually")}
                            </label>
                            <input
                                type="text"
                                value={manualCode}
                                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                                placeholder={t("scanner.manualPlaceholder")}
                                maxLength={8}
                                autoFocus
                                className="w-full p-4 bg-white border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none transition-colors font-mono text-center text-2xl tracking-widest uppercase"
                                aria-label={t("scanner.aria.manualEntry")}
                            />
                            <button
                                type="submit"
                                disabled={manualCode.trim().length === 0 || resolving}
                                className="w-full p-4 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                style={{ backgroundColor: "var(--pi-primary, #4f46e5)" }}
                                aria-label={t("scanner.aria.submitCode")}
                            >
                                {resolving ? t("scanner.looking") : t("scanner.lookUpCode")}
                            </button>
                        </form>
                    </div>
                ) : (
                    <>
                        {/* Camera viewfinder */}
                        <div className="relative w-full max-w-sm aspect-square">
                            <div id={SCANNER_REGION_ID} className="w-full h-full rounded-xl overflow-hidden" />
                            {isScanning && (
                                <div className="absolute inset-0 pointer-events-none">
                                    {/* Corner markers */}
                                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
                                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
                                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
                                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
                                    {/* Scan line animation */}
                                    <div className="absolute left-4 right-4 h-0.5 bg-green-400 opacity-75 animate-pulse top-1/2" />
                                </div>
                            )}
                        </div>

                        {!isScanning && !error && (
                            <div className="text-slate-400 text-sm mt-4 flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {t("scanner.startingCamera")}
                            </div>
                        )}
                    </>
                )}

                {/* Error display */}
                {error && (
                    <div className="w-full max-w-sm mt-4 p-4 bg-red-50 border border-red-200 rounded-xl animate-slideDown">
                        <div className="flex items-start gap-3">
                            <span className="text-xl">❌</span>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-red-800">{error.message}</p>
                                <button
                                    onClick={handleRetry}
                                    className="mt-2 text-sm font-bold text-red-600 hover:text-red-800 underline"
                                    aria-label={t("scanner.aria.retryScanning")}
                                >
                                    {t("scanner.tryAgain")}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom controls */}
            <div className="bg-slate-800 p-4 flex justify-center gap-4">
                {/* Torch toggle */}
                {torchSupported && isScanning && (
                    <button
                        onClick={toggleTorch}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-sm transition-colors min-w-[48px] min-h-[48px] justify-center ${
                            torchOn
                                ? "bg-yellow-400 text-yellow-900"
                                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                        }`}
                        aria-label={torchOn ? t("scanner.aria.turnOffFlashlight") : t("scanner.aria.turnOnFlashlight")}
                    >
                        {torchOn ? <FlashlightOff className="w-5 h-5" /> : <Flashlight className="w-5 h-5" />}
                        <span className="hidden sm:inline">{torchOn ? t("scanner.lightOff") : t("scanner.lightOn")}</span>
                    </button>
                )}

                {/* Manual entry toggle */}
                <button
                    onClick={() => {
                        if (showManualEntry) {
                            setShowManualEntry(false);
                            setManualCode("");
                        } else {
                            stopScanner();
                            setShowManualEntry(true);
                        }
                        setError(null);
                    }}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-sm transition-colors min-w-[48px] min-h-[48px] justify-center ${
                        showManualEntry
                            ? "bg-indigo-500 text-white"
                            : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    }`}
                    aria-label={showManualEntry ? t("scanner.aria.switchToCamera") : t("scanner.aria.enterCodeManually")}
                >
                    {showManualEntry ? (
                        <>
                            <Camera className="w-5 h-5" />
                            <span className="hidden sm:inline">{t("scanner.useCamera")}</span>
                        </>
                    ) : (
                        <>
                            <Keyboard className="w-5 h-5" />
                            <span className="hidden sm:inline">{t("scanner.typeCode")}</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
