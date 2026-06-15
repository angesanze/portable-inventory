import React from 'react';
import { ChevronLeft, Factory, Layers, ArrowDownToLine, ArrowUpFromLine, PackageCheck } from 'lucide-react';
import type { Product, PhysicalItem } from '../types';
import { PROFILE_METADATA } from '../../../types/api';
import { ProductSelector } from './ProductSelector';
import { QuantityControls } from './QuantityControls';
import { TrackerForm } from './TrackerForm';
import { TrackerStatusForm } from './TrackerStatusForm';
import { BatchComposition } from './BatchComposition';
import { DimensionForm } from './DimensionForm';
import { TimeBasedForm } from './TimeBasedForm';

interface OperationPanelProps {
    companyName: string;
    activeSubLocation: any;
    locationLocked: boolean;
    onBackToLocation: () => void;
    products: Product[];
    selectedProduct: string;
    productLocked: boolean;
    onProductChange: (id: string) => void;

    // Core Handlers
    handleMove: (isAdd: boolean, overrideProductId?: string) => Promise<void>;
    handleStatusChange?: (payload: { identifier: string; newStatus: string; notes?: string }) => Promise<void>;
    actionLoading: boolean;
    message: { type: 'success' | 'error'; text: string } | null;

    // State connections
    quantity: string;
    setQuantity: (q: string) => void;
    identifier: string;
    setIdentifier: (id: string) => void;
    identifierLocked: boolean;
    batchIdentifier: string;
    setBatchIdentifier: (id: string) => void;
    selectedBatchId?: string | null;

    // Profile-driven data
    availableItems: PhysicalItem[];
    batchData: any;
    setBatchData: (d: any) => void;
    expiryDate: string;
    setExpiryDate: (d: string) => void;
    batchRef: string;
    setBatchRef: (r: string) => void;

    // Batch manager config
    batchManagerData: any;
    expandedModelId: string | null;
    setExpandedModelId: (id: string | null) => void;
    loadComponentBatches: (modelId: string) => Promise<void>;
    loadAvailableItems: (prodId: string, locId: string) => Promise<void>;
    selectedLocation: string;
    setMessage: (msg: { type: 'success' | 'error'; text: string } | null) => void;

    // WorkOrder fulfillment (ASSEMBLED context only)
    onFulfillWorkOrder?: () => void;
    fulfillLabel?: string;
}

export const OperationPanel: React.FC<OperationPanelProps> = (props) => {
    const {
        companyName,
        activeSubLocation,
        locationLocked,
        onBackToLocation,
        products,
        selectedProduct,
        productLocked,
        onProductChange,
        handleMove,
        handleStatusChange,
        actionLoading,
        message,
        quantity,
        setQuantity,
        identifier,
        setIdentifier,
        identifierLocked,
        availableItems,
        batchData,
        setBatchData,
        expiryDate,
        setExpiryDate,
        batchRef,
        setBatchRef,
        batchManagerData,
        expandedModelId,
        setExpandedModelId,
        loadComponentBatches,
        loadAvailableItems,
        selectedLocation,
        setMessage,
        onFulfillWorkOrder,
        fulfillLabel,
    } = props;

    const activeProduct = products.find(p => p.id === selectedProduct);
    const uiConfig = activeProduct?.calc_config?.ui_config;

    const batchCompositionProps = {
        expandedModelId,
        setExpandedModelId,
        setIdentifier,
        setQuantity,
        setMessage,
        quantity,
        identifier,
        availableItems,
        handleMove,
        loadComponentBatches,
        loadAvailableItems,
        selectedLocation,
        actionLoading,
    };

    // Dispatcher contract (verified by OperationPanel.matrix.test.tsx):
    // Branches are evaluated top-to-bottom; first match wins.
    //   1. supportsSerials + handleStatusChange + product-level status_transitions
    //      → TrackerStatusForm (status-machine flow; transitions must come from the
    //      product preset, NOT engine defaults — see widget_product.py).
    //   2. supportsSerials (no transitions) → TrackerForm (numeric check-in/out).
    //   3. profile === 'ASSEMBLED' → Work Order Management (BatchComposition + CHECK IN/OUT).
    //   4. profile === 'BATCH_TRACKED' → BatchComposition (component-grouped contents).
    //   5. profile === 'DIMENSIONAL' → DimensionForm (computed-from-dimensions).
    //   6. profile === 'PERISHABLE' → TimeBasedForm (qty + expiry + batch ref).
    //   7. fallback (SIMPLE_COUNT, UNIT_CONVERSION, missing profile) → QuantityControls.
    const renderStrategyPanel = () => {
        if (!activeProduct) return null;

        const profile = activeProduct.profile;
        const meta = profile ? PROFILE_METADATA[profile] : null;

        // Use ONLY the explicit product-level field (set by widget_product.py when the product
        // has a preset/engine_config with status_transitions). Do NOT fall back to
        // ui_config.status_transitions — TrackerEngine.get_ui_config() returns a DEFAULT state
        // machine for every SERIALIZED product, which would hijack the numeric check-in/out
        // flow even when no preset is configured.
        const transitions: Record<string, string[]> | undefined =
            activeProduct?.calc_config?.status_transitions ?? undefined;

        if (meta?.supportsSerials && handleStatusChange && transitions && Object.keys(transitions).length > 0) {
            return (
                <TrackerStatusForm
                    identifier={identifier}
                    setIdentifier={setIdentifier}
                    identifierLocked={identifierLocked}
                    availableItems={availableItems}
                    transitions={transitions}
                    onStatusChange={handleStatusChange}
                    actionLoading={actionLoading}
                />
            );
        }

        // Serialized: individual item tracking with serial numbers (numeric check-in/out fallback)
        if (meta?.supportsSerials) {
            return (
                <TrackerForm
                    identifier={identifier}
                    setIdentifier={setIdentifier}
                    identifierLocked={identifierLocked}
                    availableItems={availableItems}
                    activeProduct={activeProduct}
                    batchData={batchData}
                    setBatchData={setBatchData}
                    handleMove={handleMove}
                    actionLoading={actionLoading}
                />
            );
        }

        // Assembled: multi-component work order management
        if (profile === 'ASSEMBLED') {
            return (
                <div className="mb-6 p-4 rounded-lg" data-testid="panel-work-order" style={{ backgroundColor: 'var(--pi-surface)', border: '1px solid var(--pi-border)' }}>
                    <h3 className="text-sm font-semibold uppercase tracking-wider mb-3 pb-2 flex items-center gap-2" style={{ color: 'var(--pi-primary, #6366f1)', borderBottom: '1px solid var(--pi-border)' }}>
                        <Factory className="w-5 h-5" strokeWidth={2} /> Work Order Management
                    </h3>
                    {batchManagerData && (
                        <>
                            <BatchComposition dataSource={batchManagerData} {...batchCompositionProps} />
                            <div className="grid grid-cols-2 gap-3 mt-6">
                                <button
                                    onClick={() => handleMove(true)}
                                    disabled={actionLoading}
                                    className="pi-btn-accent flex-col gap-1 py-4"
                                >
                                    <span className="flex items-center gap-2 text-sm uppercase tracking-wider">
                                        <ArrowDownToLine className="w-4 h-4" strokeWidth={2.5} /> CHECK IN
                                    </span>
                                    <span className="text-xs opacity-75">Add to Batch</span>
                                </button>
                                <button
                                    onClick={() => handleMove(false)}
                                    disabled={actionLoading}
                                    className="pi-btn-ghost flex-col gap-1 py-4"
                                >
                                    <span className="flex items-center gap-2 text-sm uppercase tracking-wider">
                                        <ArrowUpFromLine className="w-4 h-4" strokeWidth={2.5} /> CHECK OUT
                                    </span>
                                    <span className="text-xs opacity-60">Remove from Batch</span>
                                </button>
                            </div>
                            {onFulfillWorkOrder && (
                                <button
                                    onClick={onFulfillWorkOrder}
                                    disabled={actionLoading}
                                    className="pi-btn-primary w-full mt-3 uppercase tracking-wider text-sm"
                                >
                                    <PackageCheck className="w-5 h-5" strokeWidth={2} /> {fulfillLabel || 'Fulfill order'}
                                </button>
                            )}
                        </>
                    )}
                </div>
            );
        }

        // Batch-tracked: batch contents with component grouping
        if (profile === 'BATCH_TRACKED') {
            const grouped: any = {};
            if (activeProduct?.components) {
                activeProduct.components.forEach((comp: any) => {
                    grouped[comp.child_id] = {
                        model: {
                            id: comp.child_id,
                            name: comp.child_name,
                            sku: comp.child_sku,
                            tracking_mode: comp.child_tracking_mode,
                        },
                        items: [],
                    };
                });
            }
            return (
                <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: 'var(--pi-surface)', border: '1px solid var(--pi-border)' }}>
                    <h3 className="text-sm font-semibold uppercase tracking-wider mb-3 pb-2 flex items-center gap-2" style={{ color: 'var(--pi-primary, #6366f1)', borderBottom: '1px solid var(--pi-border)' }}>
                        <Layers className="w-5 h-5" strokeWidth={2} /> Batch Contents
                    </h3>
                    <div className="space-y-4">
                        <BatchComposition dataSource={{ grouped_items: grouped }} {...batchCompositionProps} />
                    </div>
                </div>
            );
        }

        // Dimensional: computed stock from dimensions
        if (profile === 'DIMENSIONAL') {
            return (
                <DimensionForm
                    uiConfig={uiConfig}
                    batchData={batchData}
                    setBatchData={setBatchData}
                    handleMove={handleMove}
                    actionLoading={actionLoading}
                />
            );
        }

        // Perishable: batch tracking with expiry dates
        if (profile === 'PERISHABLE') {
            return (
                <TimeBasedForm
                    quantity={quantity}
                    setQuantity={setQuantity}
                    expiryDate={expiryDate}
                    setExpiryDate={setExpiryDate}
                    batchRef={batchRef}
                    setBatchRef={setBatchRef}
                    uiConfig={uiConfig}
                    handleMove={handleMove}
                    actionLoading={actionLoading}
                />
            );
        }

        // Default (SIMPLE_COUNT, UNIT_CONVERSION, or missing profile): basic quantity controls
        return (
            <QuantityControls
                quantity={quantity}
                setQuantity={setQuantity}
                uiConfig={uiConfig}
                handleMove={handleMove}
                actionLoading={actionLoading}
                onHand={typeof activeProduct?.quantity === 'number' ? activeProduct.quantity : null}
                unit={activeProduct?.unit ?? null}
            />
        );
    };

    return (
        <div className="flex flex-col h-full font-sans" style={{ backgroundColor: 'var(--pi-bg, #09090b)', color: 'var(--pi-text, #f4f4f5)' }}>
            <div className="p-3 flex justify-between items-center sticky top-0 z-10" style={{ backgroundColor: 'var(--pi-surface, #18181b)', borderBottom: '1px solid var(--pi-border, rgba(255,255,255,0.06))' }}>
                <div className="flex items-center gap-2">
                    {!locationLocked && (
                        <button onClick={onBackToLocation} className="pi-hover-tint p-2 -ml-1 rounded-lg transition-colors" style={{ color: 'var(--pi-muted, #a1a1aa)' }} aria-label="Back to location selection">
                            <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
                        </button>
                    )}
                    <div>
                        <div className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--pi-muted, #a1a1aa)' }}>{companyName}</div>
                        <div className="font-medium leading-tight" style={{ color: 'var(--pi-text, #f4f4f5)' }}>{activeSubLocation?.name}</div>
                    </div>
                </div>
            </div>

            <div className="p-4 max-w-md mx-auto w-full flex-1">
                <ProductSelector
                    products={products}
                    selectedProduct={selectedProduct}
                    productLocked={productLocked}
                    onProductChange={onProductChange}
                    activeProduct={activeProduct}
                />

                {activeProduct && (
                    <div className={`transition-all duration-300 ${!selectedProduct ? 'opacity-40 pointer-events-none blur-[1px]' : ''}`}>
                        {renderStrategyPanel()}
                    </div>
                )}

                {message && (
                    <div
                        className="mt-6 p-4 rounded-xl text-center font-medium animate-slideDown"
                        style={message.type === 'success'
                            ? { backgroundColor: 'rgba(16,185,129,0.1)', color: 'var(--pi-success, #10b981)', border: '1px solid rgba(16,185,129,0.2)' }
                            : { backgroundColor: 'rgba(244,63,94,0.1)', color: 'var(--pi-danger, #f43f5e)', border: '1px solid rgba(244,63,94,0.2)' }
                        }
                    >
                        {message.text}
                    </div>
                )}
            </div>
        </div>
    );
};
