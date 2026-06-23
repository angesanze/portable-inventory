import { useWidgetOperations } from "../hooks/useWidgetOperations";
import { useState, useRef, useCallback } from "react";
import { Select, type SelectOption } from "../../../components/ui/Select";
import { useWidgetData } from "../hooks/useWidgetData";
import { useWidgetApiKey } from "../hooks/useWidgetApiKey";
import { useTheme } from "../hooks/useTheme";
import { useHostCommunication, useWidgetResize } from "../hooks/useHostCommunication";

export const QRConfigWidget = () => {
    const rootRef = useRef<HTMLDivElement>(null);
    useTheme(rootRef);

    const { apiKey, resolvingKey } = useWidgetApiKey();

    const {
        apiUrl,
        loading,
        setLoading,
        setActionLoading,
        error,
        companyName,
        locations,
        products,
        batches,
        setBatches,
        selectedLocation,
        setSelectedLocation,
        selectedProduct,
        setSelectedProduct,
        identifier,
        setIdentifier,
        selectedBatchId,
        batchManagerData,
        qrCode,
        loadBatches,
        loadAvailableItems,
        loadBatchManagerData,
    } = useWidgetData(apiKey, resolvingKey);

    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [qrConfiguring, setQrConfiguring] = useState(false);
    const [qrLocking, setQrLocking] = useState(false);
    const [qrConfigured, setQrConfigured] = useState(false);

    // Derived state
    const activeProduct = products.find(p => p.id === selectedProduct);
    const isTrackerProfile = activeProduct?.profile === 'SERIALIZED' || activeProduct?.engine_type === 'tracker';

    const productOptions: SelectOption[] = products.map(p => ({
        value: String(p.id),
        label: `${p.name} (${p.sku})`,
    }));
    const locationOptions: SelectOption[] = [
        { value: "", label: "-- No Specific Warehouse --" },
        ...locations.map(l => ({
            value: String(l.id),
            label: l.name,
        })),
    ];

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

    useWidgetResize([qrConfigured, selectedProduct, message]);

    // Stub state needed by useWidgetOperations interface
    const widgetState = {
        quantity: "1", setQuantity: () => {}, identifier, setIdentifier,
        batchIdentifier: "", batchData: {}, setMessage,
        componentBatches: {}, setComponentBatches: () => {},
        setQrConfiguring, setQrConfigured, setQrLocking,
        sendTransactionEvent, sendErrorEvent,
        expiryDate: "", batchRef: "",
        fulfillSuccessText: "", fulfillFailedText: "",
    };

    const widgetDataBag = {
        products, batches, setBatches, selectedProduct, selectedLocation,
        selectedBatchId, batchManagerData, loadBatches, loadAvailableItems,
        loadBatchManagerData, setLoading, setActionLoading, qrCode,
    };

    const { handleConfigureQR, handleLockQR } = useWidgetOperations(apiKey, apiUrl, widgetDataBag, widgetState);

    if (loading) return (
        <div ref={rootRef} className="pi-theme flex justify-center items-center h-screen" style={{ backgroundColor: 'var(--pi-bg, #09090b)', fontFamily: 'var(--pi-font, system-ui)' }}>
            <div className="animate-spin h-8 w-8 border-2 rounded-full border-t-transparent" style={{ borderColor: 'var(--pi-primary, #6366f1)' }}></div>
        </div>
    );

    if (error) return (
        <div ref={rootRef} className="pi-theme p-8 text-center h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--pi-bg, #09090b)', fontFamily: 'var(--pi-font, system-ui)' }}>
            <div className="p-6 rounded-xl" style={{ backgroundColor: 'var(--pi-surface, #18181b)', border: '1px solid rgba(244,63,94,0.2)' }}>
                <div className="font-bold text-lg mb-2" style={{ color: 'var(--pi-danger, #f43f5e)' }}>Access Denied</div>
                <p style={{ color: 'var(--pi-muted, #a1a1aa)' }}>{error}</p>
            </div>
        </div>
    );

    if (!qrCode) return (
        <div ref={rootRef} className="pi-theme p-8 text-center h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--pi-bg, #09090b)', fontFamily: 'var(--pi-font, system-ui)' }}>
            <div className="p-6 rounded-xl" style={{ backgroundColor: 'var(--pi-surface, #18181b)', border: '1px solid rgba(244,63,94,0.2)' }}>
                <div className="font-bold text-lg mb-2" style={{ color: 'var(--pi-danger, #f43f5e)' }}>No QR Code</div>
                <p style={{ color: 'var(--pi-muted, #a1a1aa)' }}>No QR code found for configuration.</p>
            </div>
        </div>
    );

    return (
        <div ref={rootRef} className="pi-theme w-full font-sans min-h-screen flex flex-col" style={{ backgroundColor: 'var(--pi-bg, #09090b)', fontFamily: 'var(--pi-font, system-ui)', color: 'var(--pi-text, #f4f4f5)' }}>
            <div
                className="p-6 text-center"
                style={{
                    color: '#fff',
                    background: `linear-gradient(to right, var(--pi-primary, #6366f1), color-mix(in srgb, var(--pi-primary, #6366f1), #7c3aed 50%))`,
                }}
            >
                <div className="text-xs uppercase tracking-widest opacity-75 mb-1">QR Code Configuration</div>
                <h1 className="text-2xl font-bold">{companyName}</h1>
                <div
                    className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--pi-text, #ffffff) 20%, transparent)' }}
                >
                    <span className="font-mono font-bold">{qrCode}</span>
                    <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: '#fbbf24', color: '#000' }}
                    >
                        Virgin
                    </span>
                </div>
            </div>

            <div className="p-6 max-w-md mx-auto w-full flex-1">
                <div className="rounded-xl p-4 mb-6" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">⚙️</span>
                        <div>
                            <div className="font-bold" style={{ color: '#fbbf24' }}>Configure This QR Code</div>
                            <p className="text-sm mt-1" style={{ color: 'var(--pi-muted, #a1a1aa)' }}>
                                This QR code is new and not yet configured. Select a product to link it, then lock to prevent changes.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div>
                        <label htmlFor="qr-config-product" className="pi-label block text-xs font-bold uppercase mb-2">Link to Product</label>
                        <Select
                            custom
                            id="qr-config-product"
                            value={selectedProduct}
                            onChange={val => setSelectedProduct(String(val))}
                            options={productOptions}
                            placeholder="-- Select Product --"
                        />
                    </div>

                    <div>
                        <label htmlFor="qr-config-warehouse" className="pi-label block text-xs font-bold uppercase mb-2">Assign to Warehouse (Optional)</label>
                        <Select
                            custom
                            id="qr-config-warehouse"
                            value={selectedLocation || ""}
                            onChange={val => setSelectedLocation(String(val))}
                            options={locationOptions}
                            placeholder="-- No Specific Warehouse --"
                        />
                        <p className="text-xs mt-2" style={{ color: 'var(--pi-muted, #a1a1aa)' }}>If set, scanning this QR will bypass the warehouse selection screen.</p>
                    </div>

                    {selectedProduct && isTrackerProfile && (
                        <div>
                            <label className="pi-label block text-xs font-bold uppercase mb-2">Specific Item ID (Optional)</label>
                            <input
                                type="text"
                                value={identifier}
                                onChange={e => setIdentifier(e.target.value)}
                                placeholder="Serial Number / Asset Tag"
                                className="pi-input font-mono min-h-[48px]"
                                aria-label="Item serial number or asset tag"
                            />
                            <p className="text-xs mt-1" style={{ color: 'var(--pi-muted, #a1a1aa)' }}>Leave empty to link to product type only</p>
                        </div>
                    )}

                    {message && (
                        <div
                            className="p-4 rounded-xl text-center font-medium"
                            style={message.type === 'success'
                                ? { backgroundColor: 'rgba(16,185,129,0.1)', color: 'var(--pi-success, #10b981)', border: '1px solid rgba(16,185,129,0.2)' }
                                : { backgroundColor: 'rgba(244,63,94,0.1)', color: 'var(--pi-danger, #f43f5e)', border: '1px solid rgba(244,63,94,0.2)' }
                            }
                        >
                            {message.text}
                        </div>
                    )}

                    <div className="space-y-3 pt-4">
                        {!qrConfigured ? (
                            <button
                                onClick={handleConfigureQR}
                                disabled={!selectedProduct || qrConfiguring}
                                className="pi-btn-accent w-full p-4 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg min-h-[48px]"
                                aria-label="Save QR code configuration"
                            >
                                {qrConfiguring ? "Configuring..." : "✓ Save Configuration"}
                            </button>
                        ) : (
                            <button
                                onClick={handleLockQR}
                                disabled={qrLocking}
                                className="w-full p-4 disabled:opacity-50 font-bold rounded-xl text-lg min-h-[48px]"
                                style={{ background: 'linear-gradient(to right, #f59e0b, #f97316)', color: '#fff' }}
                                aria-label="Lock QR code permanently"
                            >
                                {qrLocking ? "Locking..." : "🔒 Lock QR Code (Permanent)"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
