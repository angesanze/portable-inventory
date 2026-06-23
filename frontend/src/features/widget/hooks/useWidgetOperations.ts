import { PROFILE_METADATA } from '../../../types/api';
import type { InventoryProfile } from '../../../types/api';
import type { Product, ProductBatch, ProductComponent, BatchManagerData } from '../types';
import { buildMoveCalculatorPayload } from '../payload';

type WidgetMessage = { type: 'success' | 'error'; text: string } | null;

interface TransactionEvent {
    transactionType: string;
    productId: string;
    quantity: number;
    success: boolean;
}

/** State + actions the data hook owns (products, batches, loaders). */
interface WidgetDataBag {
    products: Product[];
    batches: ProductBatch[];
    setBatches: (updater: (prev: ProductBatch[]) => ProductBatch[]) => void;
    selectedProduct: string;
    selectedLocation: string;
    selectedBatchId: string;
    // Backend-shaped batch-manager payload (grouped child items).
    batchManagerData: BatchManagerData | null;
    loadBatches: (productId: string, locationId: string) => void;
    loadAvailableItems: (productId: string, locationId: string) => void;
    loadBatchManagerData: (productId: string, locationId: string) => void;
    loadProductsForLocation?: (locationId: string) => void;
    setLoading: (v: boolean) => void;
    setActionLoading: (v: boolean) => void;
    qrCode: string | null;
}

/** Form state + callbacks the widget shell owns. */
interface WidgetStateBag {
    quantity: string;
    setQuantity: (v: string) => void;
    identifier: string;
    setIdentifier: (v: string) => void;
    batchIdentifier: string;
    batchData: Record<string, string>;
    setMessage: (m: WidgetMessage) => void;
    componentBatches: Record<string, unknown>;
    setComponentBatches: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
    setQrConfiguring: (v: boolean) => void;
    setQrConfigured: (v: boolean) => void;
    setQrLocking: (v: boolean) => void;
    sendTransactionEvent?: (e: TransactionEvent) => void;
    sendErrorEvent?: (msg: string) => void;
    expiryDate: string;
    batchRef: string;
    fulfillSuccessText: string;
    fulfillFailedText: string;
}

/** Per-engine calculation envelope nested inside a move payload. */
interface CalculatorPayload {
    operation: 'add' | 'subtract';
    quantity?: number | string;
    dimension_values?: Record<string, number>;
    expiry_date?: string;
    batch_ref?: string;
    batch_data?: Record<string, string>;
    batch_id?: string;
}

/** Body posted to `/widget/move/`. */
interface MovePayload {
    api_key: string | null;
    product_id: string;
    location_id: string;
    quantity: number;
    reason: string;
    physical_identifier?: string;
    work_order_id?: string;
    calculator_payload?: CalculatorPayload;
}

/** A grouped child bucket built for the batch-manager composition view. */
interface GroupedEntry {
    model: { id: string; name?: string; sku?: string; tracking_mode?: string };
    items: Array<Record<string, unknown>>;
}

/** One row from `GET /work-orders/{id}/contents/`. */
interface WorkOrderContentItem {
    type?: string;
    product_id: string;
    product_name?: string;
    sku?: string;
    item_id?: string;
    identifier?: string;
    batch_id?: string;
    batch_identifier?: string;
    quantity?: number;
    meta?: Record<string, unknown>;
}

export const useWidgetOperations = (
    apiKey: string | null,
    apiUrl: string,
    widgetData: WidgetDataBag,
    widgetState: WidgetStateBag
) => {
    const {
        products, batches, setBatches, selectedProduct, selectedLocation,
        selectedBatchId, batchManagerData, loadBatches, loadAvailableItems,
        loadBatchManagerData, loadProductsForLocation, setLoading, setActionLoading, qrCode,
    } = widgetData;

    const {
        quantity, setQuantity, identifier, setIdentifier, batchIdentifier,
        batchData, setMessage, componentBatches, setComponentBatches,
        setQrConfiguring, setQrConfigured, setQrLocking,
        sendTransactionEvent, sendErrorEvent,
        expiryDate, batchRef,
        fulfillSuccessText, fulfillFailedText,
    } = widgetState;

    const activeProduct = products.find((p) => p.id ===selectedProduct);
    const activeMeta = activeProduct?.profile ? PROFILE_METADATA[activeProduct.profile as InventoryProfile] : null;
    const isBucketStrategy = activeMeta?.supportsBatches ?? false;

    const loadComponentBatches = async (modelId: string) => {
        if (componentBatches[modelId]) return;
        try {
            const url = `${apiUrl}/widget/batches/?product_id=${modelId}&location_id=${selectedLocation}`;
            const res = await fetch(url, { headers: { "X-Api-Key": apiKey ?? "" } });
            if (res.ok) {
                const data = await res.json();
                setComponentBatches((prev) => ({ ...prev, [modelId]: data }));
            }
        } catch (e) {
            console.error("Failed to load component batches", e);
        }
    };

    const fetchBatchDetails = async (force = false) => {
        if (!selectedBatchId || !isBucketStrategy) return;

        const batch = batches.find((b) => b.id === selectedBatchId);
        if (!force && batch?.data?.grouped_items) return;

        setLoading(true);
        try {
            const grouped: Record<string, GroupedEntry> = {};
            if (activeProduct?.components) {
                activeProduct.components.forEach((comp: ProductComponent) => {
                    grouped[comp.child_id] = {
                        model: {
                            id: comp.child_id,
                            name: comp.child_name,
                            sku: comp.child_sku,
                            tracking_mode: comp.child_tracking_mode
                        },
                        items: []
                    };
                });
            }

            let contents: WorkOrderContentItem[] = [];
            if (batch?.work_order) {
                const compositionUrl = `${apiUrl}/work-orders/${batch.work_order}/contents/`;
                const res = await fetch(compositionUrl, { headers: { "X-Api-Key": apiKey ?? "" } });
                if (res.ok) {
                    contents = await res.json();
                }
            }

            contents.forEach((item) => {
                const modelId = item.product_id;
                if (!grouped[modelId]) {
                    grouped[modelId] = {
                        model: {
                            id: modelId,
                            name: item.product_name,
                            sku: item.sku,
                            tracking_mode: item.type === 'ITEM' ? 'INDIVIDUAL' : 'BULK'
                        },
                        items: []
                    };
                }

                if (item.type === 'ITEM') {
                    grouped[modelId].items.push({
                        id: item.item_id,
                        identifier: item.identifier,
                        quantity: 1,
                        status: 'ACTIVE'
                    });
                } else {
                    grouped[modelId].items.push({
                        id: item.batch_id,
                        batch_identifier: item.batch_identifier,
                        quantity: item.quantity,
                        data: item.meta
                    });
                }
            });

            setBatches((prev) => prev.map((b) => {
                if (b.id === selectedBatchId) {
                    return { ...b, data: { ...b.data, grouped_items: grouped } };
                }
                return b;
            }));
        } catch (e) {
            console.error("Failed to load batch composition", e);
        } finally {
            setLoading(false);
        }
    };

    const handleMove = async (isAdd: boolean, overrideProductId?: string) => {
        const targetProductId = overrideProductId || selectedProduct;
        if (!targetProductId || !selectedLocation) return;

        let targetProduct = products.find((p) => p.id === targetProductId);

        if (!targetProduct && batchManagerData?.grouped_items) {
            const found = Object.values(batchManagerData.grouped_items).find((g) => g.model?.id === targetProductId);
            if (found?.model) {
                targetProduct = {
                    id: found.model.id,
                    sku: found.model.sku ?? '',
                    name: found.model.name ?? '',
                    quantity: 0,
                    profile: found.model.tracking_mode === 'INDIVIDUAL' ? 'SERIALIZED' : 'BATCH_TRACKED',
                } satisfies Product;
            }
        }

        if (!targetProduct) return;

        const qty = parseFloat(quantity);
        if (isNaN(qty) || qty <= 0) {
            setMessage({ type: 'error', text: "Invalid quantity" });
            return;
        }

        const payload: MovePayload = {
            api_key: apiKey,
            product_id: targetProductId,
            location_id: selectedLocation,
            quantity: isAdd ? qty : -qty,
            reason: "App Adjustment",
            physical_identifier: identifier,
            work_order_id: undefined
        };

        const targetMeta = targetProduct.profile ? PROFILE_METADATA[targetProduct.profile as InventoryProfile] : null;
        const isTargetBucket = targetMeta?.supportsBatches ?? false;
        const isTargetTracker = targetMeta?.supportsSerials ?? false;
        const isTargetDimension = targetProduct.profile === 'DIMENSIONAL';
        const isTargetTimeBased = targetProduct.profile === 'PERISHABLE';

        // BATCH_TRACKED specifically — PERISHABLE is also supportsBatches but is
        // handled by buildMoveCalculatorPayload's profile precedence (expiry, not
        // a selected batch).
        const isBatchTracked = isTargetBucket && !isTargetDimension && !isTargetTimeBased;
        if (isTargetTracker) {
            if (!identifier) {
                setMessage({ type: 'error', text: "Identifier / Serial Number is required" });
                return;
            }
            payload.quantity = isAdd ? 1 : -1;
        } else {
            if (isBatchTracked && !isAdd && !selectedBatchId) {
                setMessage({ type: 'error', text: "Please select a batch to consume from" });
                return;
            }
            // Per-engine calculator envelope — the per-profile field rules live in
            // payload.ts so the move and transaction paths can't drift (MOD-03).
            const calc = buildMoveCalculatorPayload(
                targetProduct.profile,
                isAdd ? 'add' : 'subtract',
                { qty, batchData, batchIdentifier, selectedBatchId, expiryDate, batchRef, hasCalcConfig: !!targetProduct.calc_config },
            );
            if (calc) payload.calculator_payload = calc;
        }

        setActionLoading(true);
        setMessage(null);

        try {
            const isBatchRefill = isTargetBucket && isAdd && !!selectedBatchId;
            const activeBatch = batches.find((b) => b.id === selectedBatchId);
            let workOrderId = activeBatch?.work_order;

            const parentProduct = products.find((p) => p.id ===selectedProduct);
            const isParentBatchManager = parentProduct?.profile === 'ASSEMBLED';
            if (isParentBatchManager && selectedProduct) {
                workOrderId = selectedProduct;
            }

            let url = `${apiUrl}/widget/move/`;
            // finalPayload may be swapped for a transfer / batch-update body below,
            // each a distinct shape, so it is the JSON-serialisable bag type.
            let finalPayload: Record<string, unknown> = { ...payload };

            if (isBatchRefill && workOrderId) {
                url = `${apiUrl}/widget/transfer/`;
                finalPayload = {
                    api_key: apiKey,
                    product_id: targetProductId,
                    from_location_id: selectedLocation,
                    to_location_id: selectedLocation,
                    work_order_id: workOrderId,
                    quantity: qty,
                    reason: "Batch Refill"
                };
            } else if (isParentBatchManager && workOrderId) {
                url = `${apiUrl}/widget/${workOrderId}/transaction/`;
                finalPayload = {
                    operation: 'batch_update_item',
                    product_model_id: targetProductId,
                    delta: isAdd ? qty : -qty,
                    physical_identifier: identifier,
                    batch_id: selectedBatchId || undefined
                };
            } else if (!isAdd && workOrderId) {
                payload.work_order_id = workOrderId;
            }

            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Api-Key": apiKey ?? "" },
                body: JSON.stringify(finalPayload)
            });
            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: isAdd ? "Added successfully" : "Removed successfully" });
                sendTransactionEvent?.({
                    transactionType: isAdd ? 'check_in' : 'check_out',
                    productId: targetProductId,
                    quantity: qty,
                    success: true,
                });
                setIdentifier("");
                setQuantity("1");
                setQrConfigured(false);

                if (isTargetBucket) {
                    if (selectedBatchId) fetchBatchDetails();
                    loadBatches(selectedProduct, selectedLocation);
                }
                if (isTargetTracker) {
                    loadAvailableItems(targetProductId, selectedLocation);
                }
                if (isParentBatchManager) {
                    loadBatchManagerData(selectedProduct, selectedLocation);
                    if (targetProductId) {
                        loadAvailableItems(targetProductId, selectedLocation);
                    }
                }
                // Always refresh product stock so "On Hand" reflects the move.
                // For SIMPLE_COUNT/UNIT_CONVERSION/DIMENSIONAL/PERISHABLE this is the
                // only signal that brings the displayed quantity up to date.
                loadProductsForLocation?.(selectedLocation);
            } else {
                const errorMsg = data.detail || data.error || data[0] || (isAdd ? "Check-in failed" : "Check-out failed");
                setMessage({ type: 'error', text: errorMsg });
                sendTransactionEvent?.({
                    transactionType: isAdd ? 'check_in' : 'check_out',
                    productId: targetProductId,
                    quantity: qty,
                    success: false,
                });
                sendErrorEvent?.(errorMsg);
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Network error";
            setMessage({ type: 'error', text: errorMsg });
            sendErrorEvent?.(errorMsg);
        } finally {
            setActionLoading(false);
        }
    };

    const handleStatusChange = async ({ identifier: ident, newStatus, notes }: { identifier: string; newStatus: string; notes?: string }) => {
        if (!selectedProduct || !ident || !newStatus) return;
        setActionLoading(true);
        setMessage(null);
        try {
            const res = await fetch(`${apiUrl}/widget/${selectedProduct}/transaction/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Api-Key": apiKey ?? "" },
                body: JSON.stringify({
                    operation: "status_change",
                    physical_identifier: ident,
                    new_status: newStatus,
                    notes,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                const errorMsg = json.detail || json.error || json[0] || "Status change failed";
                setMessage({ type: 'error', text: errorMsg });
                sendErrorEvent?.(errorMsg);
                return;
            }
            setMessage({ type: 'success', text: "Status updated" });
            sendTransactionEvent?.({
                transactionType: 'check_in',
                productId: selectedProduct,
                quantity: 0,
                success: true,
            });
            setIdentifier("");
            loadAvailableItems?.(selectedProduct, selectedLocation);
            loadProductsForLocation?.(selectedLocation);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Network error";
            setMessage({ type: 'error', text: errorMsg });
            sendErrorEvent?.(errorMsg);
        } finally {
            setActionLoading(false);
        }
    };

    const handleFulfillWorkOrder = async (workOrderId: string) => {
        if (!workOrderId) return;

        setActionLoading(true);
        setMessage(null);

        try {
            const url = `${apiUrl}/widget/${workOrderId}/transaction/`;
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Api-Key": apiKey ?? "" },
                body: JSON.stringify({ operation: 'fulfill' })
            });
            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: fulfillSuccessText });
                sendTransactionEvent?.({
                    transactionType: 'check_out',
                    productId: workOrderId,
                    quantity: 0,
                    success: true,
                });
                loadBatchManagerData(selectedProduct, selectedLocation);
            } else {
                const errorMsg = data.detail || data.error || data[0] || fulfillFailedText;
                setMessage({ type: 'error', text: errorMsg });
                sendErrorEvent?.(errorMsg);
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Network error";
            setMessage({ type: 'error', text: errorMsg });
            sendErrorEvent?.(errorMsg);
        } finally {
            setActionLoading(false);
        }
    };

    const handleConfigureQR = async () => {
        if (!selectedProduct) {
            setMessage({ type: 'error', text: "Please select a product first" });
            return;
        }
        setQrConfiguring(true);
        setMessage(null);
        try {
            const res = await fetch(`${apiUrl}/widget/configure_qr/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: apiKey,
                    qr_code: qrCode,
                    product_model_id: selectedProduct,
                    physical_identifier: identifier || null,
                    location_id: selectedLocation || null
                })
            });
            const data = await res.json();
            if (res.ok) {
                setQrConfigured(true);
                setMessage({ type: 'success', text: "QR code configured successfully!" });
            } else {
                setMessage({ type: 'error', text: data.detail || data[0] || "Configuration failed" });
            }
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : "Network error" });
        } finally {
            setQrConfiguring(false);
        }
    };

    const handleLockQR = async () => {
        setQrLocking(true);
        setMessage(null);
        try {
            const res = await fetch(`${apiUrl}/widget/lock_qr/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: apiKey,
                    qr_code: qrCode
                })
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: "🔒 QR code locked! It will now always redirect to this configuration." });
                setTimeout(() => {
                    // SEC-04: stash the credential in sessionStorage rather than
                    // putting it in the URL (history/Referer/logs). useWidgetApiKey
                    // reads `pi-widget-key:direct` as a fallback source.
                    if (apiKey) sessionStorage.setItem("pi-widget-key:direct", apiKey);
                    let redirectUrl = `/widget?product_id=${selectedProduct}`;
                    if (selectedLocation) {
                        redirectUrl += `&location_id=${selectedLocation}`;
                    }
                    window.location.href = redirectUrl;
                }, 2000);
            } else {
                setMessage({ type: 'error', text: data.detail || data[0] || "Lock failed" });
            }
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : "Network error" });
        } finally {
            setQrLocking(false);
        }
    };

    return {
        loadComponentBatches,
        fetchBatchDetails,
        handleMove,
        handleStatusChange,
        handleFulfillWorkOrder,
        handleConfigureQR,
        handleLockQR
    };
};
