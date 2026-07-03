import { useEffect, useState } from "react";
import { Package, AlertTriangle } from "lucide-react";
import { useParams } from "react-router-dom";
import { API_URL } from "../../../config";
import { useWidgetApiKey } from "../hooks/useWidgetApiKey";
import type { WidgetData } from "../types";
import type { InventoryProfile } from "../../../types/api";
import { PROFILE_METADATA } from "../../../types/api";
import { buildTransactionPayload, resolveEngineType, buildBatchUpdatePayload } from "../payload";
import {
    CounterPanel,
    BucketPanel,
    TrackerPanel,
    DimensionPanel,
    TimeBasedPanel,
    BatchManagerPanel,
} from "../components/engines";

export const PolymorphicWidget = () => {
    const { id } = useParams<{ id: string }>();
    const [data, setData] = useState<WidgetData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Form State
    const [qty, setQty] = useState("");
    const [bucketData, setBucketData] = useState<Record<string, string>>({});
    const [dimensionValues, setDimensionValues] = useState<Record<string, string>>({});
    const [trackerStatus, setTrackerStatus] = useState("");
    const [trackerItemId, setTrackerItemId] = useState("");
    const [trackerNotes, setTrackerNotes] = useState("");
    const [expiryDate, setExpiryDate] = useState("");
    const [batchRef, setBatchRef] = useState("");

    const { apiKey, resolvingKey, keyError } = useWidgetApiKey();

    useEffect(() => {
        if (id && apiKey) {
            const ctrl = new AbortController();
            fetchConfig(ctrl.signal);
            return () => ctrl.abort();
        } else if (!apiKey && !resolvingKey) {
            setError(keyError || "Missing API Key");
            setLoading(false);
        }
    }, [id, apiKey, resolvingKey]);

    const fetchConfig = async (signal?: AbortSignal) => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/v1/widget/${id}/`, { headers: { "X-Api-Key": apiKey ?? "" }, signal });
            if (!res.ok) throw new Error("Failed to load widget config");
            const json = await res.json();
            setData(json);
            if (json.ui_config?.step) setQty(String(json.ui_config.step));
        } catch (err) {
            // Superseded by a newer id/apiKey — the effect aborted this one.
            if (err instanceof DOMException && err.name === 'AbortError') return;
            setError(err instanceof Error ? err.message : 'Failed to load widget config');
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    };

    const handleTransaction = async (operation: 'add' | 'subtract') => {
        setSubmitting(true);
        setMessage(null);

        try {
            // MOD-03: dispatch on the product profile (single source of truth),
            // falling back to the legacy engine string for pre-profile data.
            const payload = buildTransactionPayload(
                data?.profile,
                data?.engine,
                operation,
                { qty, bucketData, dimensionValues, trackerItemId, trackerStatus, trackerNotes, expiryDate, batchRef },
            );
            const engine = resolveEngineType(data?.profile, data?.engine);

            const res = await fetch(`${API_URL}/api/v1/widget/${id}/transaction/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Api-Key": apiKey ?? "" },
                body: JSON.stringify(payload)
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json.detail || json.error || "Transaction failed");

            setMessage({ type: 'success', text: `Updated! New Stock: ${json.new_stock_display}` });
            setData(prev => prev ? { ...prev, current_stock_display: json.new_stock_display } : null);

            // Clear inputs after operation
            if (operation === 'add') {
                if (engine !== 'bucket') setQty("");
                setBucketData({});
            }
            if (engine === 'tracker') {
                setTrackerStatus("");
                setTrackerNotes("");
            }
            if (engine === 'dimension') {
                setDimensionValues({});
            }
            if (engine === 'time_based') {
                setExpiryDate("");
                setBatchRef("");
                setQty("");
            }

        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Transaction failed' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleBatchTransaction = async (modelId: string | undefined, delta: number, identifier: string | null = null, physicalProductId: string | null = null, batchId: string | null = null) => {
        setSubmitting(true);
        setMessage(null);
        try {
            const payload = buildBatchUpdatePayload({
                productModelId: modelId,
                delta,
                physicalIdentifier: identifier,
                physicalProductId,
                batchId,
            });

            const res = await fetch(`${API_URL}/api/v1/widget/${id}/transaction/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Api-Key": apiKey ?? "" },
                body: JSON.stringify(payload)
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json.detail || json.error || "Update failed");

            setMessage({ type: 'success', text: "Updated successfully" });
            fetchConfig();

        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Update failed' });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#09090b' }}>
            <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
                <p className="text-sm font-medium" style={{ color: '#a1a1aa' }}>Loading Widget...</p>
            </div>
        </div>
    );
    if (error) return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#09090b' }}>
            <div className="w-full max-w-sm rounded-2xl p-6 text-center flex flex-col items-center gap-3" style={{ backgroundColor: '#18181b', border: '1px solid rgba(244,63,94,0.25)' }}>
                <AlertTriangle className="w-8 h-8" strokeWidth={2} style={{ color: '#f43f5e' }} />
                <p className="text-sm font-bold" style={{ color: '#f43f5e' }}>{error}</p>
            </div>
        </div>
    );
    if (!data) return null;

    // BATCH MANAGER — fully self-contained panel
    if (data.engine === 'batch_manager') {
        return (
            <BatchManagerPanel
                data={data}
                submitting={submitting}
                message={message}
                onBatchTransaction={handleBatchTransaction}
            />
        );
    }

    // STANDARD SINGLE PRODUCT WIDGET — route to engine-specific panel
    // Use profile-based routing when available, fall back to ui_config.input_type for legacy data
    const inputType = data.profile && PROFILE_METADATA[data.profile as InventoryProfile]
        ? PROFILE_METADATA[data.profile as InventoryProfile].widgetInputType
        : data.ui_config.input_type;

    const renderEnginePanel = () => {
        switch (inputType) {
            case 'number':
                return (
                    <CounterPanel
                        qty={qty}
                        setQty={setQty}
                        step={data.ui_config.step}
                        inputLabel={data.ui_config.input_label}
                        submitting={submitting}
                        onTransaction={handleTransaction}
                    />
                );
            case 'bucket_form':
                return (
                    <BucketPanel
                        fields={data.ui_config.fields || []}
                        bucketData={bucketData}
                        setBucketData={setBucketData}
                        qty={qty}
                        setQty={setQty}
                        submitting={submitting}
                        onTransaction={handleTransaction}
                    />
                );
            case 'tracker':
                return (
                    <TrackerPanel
                        fields={data.ui_config.fields || []}
                        trackerItemId={trackerItemId}
                        setTrackerItemId={setTrackerItemId}
                        trackerStatus={trackerStatus}
                        setTrackerStatus={setTrackerStatus}
                        trackerNotes={trackerNotes}
                        setTrackerNotes={setTrackerNotes}
                        submitting={submitting}
                        onTransaction={handleTransaction}
                    />
                );
            case 'dimension':
                return (
                    <DimensionPanel
                        fields={data.ui_config.fields || []}
                        formula={data.ui_config.formula || ''}
                        computedUnit={data.ui_config.computed_unit || ''}
                        dimensionValues={dimensionValues}
                        setDimensionValues={setDimensionValues}
                        submitting={submitting}
                        onTransaction={handleTransaction}
                    />
                );
            case 'time_based':
                return (
                    <TimeBasedPanel
                        qty={qty}
                        setQty={setQty}
                        step={data.ui_config.step}
                        expiryTracking={!!data.ui_config.expiry_tracking}
                        expiryDate={expiryDate}
                        setExpiryDate={setExpiryDate}
                        batchRef={batchRef}
                        setBatchRef={setBatchRef}
                        submitting={submitting}
                        onTransaction={handleTransaction}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="pi-theme min-h-screen flex flex-col items-center justify-center p-4" style={{ backgroundColor: 'var(--pi-bg, #09090b)', fontFamily: 'var(--pi-font, system-ui)', color: 'var(--pi-text, #f4f4f5)' }}>
            <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ backgroundColor: 'var(--pi-surface, #18181b)', border: '1px solid var(--pi-border, rgba(255,255,255,0.08))' }}>
                {/* Header */}
                <div className="p-6 text-center" style={{ borderBottom: '1px solid var(--pi-border, rgba(255,255,255,0.06))', background: 'linear-gradient(135deg, color-mix(in srgb, var(--pi-primary, #6366f1) 15%, transparent) 0%, color-mix(in srgb, var(--pi-primary, #6366f1) 5%, transparent) 100%)' }}>
                    <div className="flex items-center justify-center gap-1.5 mb-2">
                        <Package className="w-3.5 h-3.5" strokeWidth={2.5} style={{ color: 'var(--pi-muted, #a1a1aa)' }} />
                        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--pi-muted, #a1a1aa)' }}>Stock</p>
                    </div>
                    <h2 className="text-lg font-semibold leading-tight" style={{ color: 'var(--pi-text, #f4f4f5)' }}>{data.product_name}</h2>
                    <div className="mt-3 text-5xl font-mono font-bold tracking-tight" style={{ color: 'var(--pi-primary, #6366f1)' }} data-testid="stock-display">
                        {data.current_stock_display}
                    </div>
                </div>

                {/* Engine Panel */}
                <div className="p-6">
                    {renderEnginePanel()}

                    {/* Message */}
                    {message && (
                        <div className="mt-4 p-3 rounded-xl text-sm text-center font-medium animate-slideDown" style={message.type === 'success' ? { backgroundColor: 'rgba(16,185,129,0.1)', color: 'var(--pi-success, #10b981)', border: '1px solid rgba(16,185,129,0.2)' } : { backgroundColor: 'rgba(244,63,94,0.1)', color: 'var(--pi-danger, #f43f5e)', border: '1px solid rgba(244,63,94,0.2)' }}>
                            {message.text}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
