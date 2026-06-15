import React, { useState } from "react";
import { ArrowLeft, Loader2, Package, MapPin, Hash, Layers } from "lucide-react";
import type { QRScanResult } from "./QRScanner";
import type { OperationType } from "./ScanResult";
import { useSwipeGesture } from "./useSwipeGesture";

interface ConfirmationDialogProps {
    scanResult: QRScanResult;
    operation: OperationType;
    quantity: number;
    unitLabel?: string;
    onConfirm: (note?: string) => void;
    onCancel: () => void;
    isLoading?: boolean;
}

const operationLabels: Record<string, string> = {
    add: "Add Stock",
    subtract: "Remove Stock",
    transfer: "Transfer",
    allocate: "Allocate",
    deallocate: "Deallocate",
    transfer_batch: "Transfer Batch",
    check_in: "Check In",
    check_out: "Check Out",
    start_work_order: "Start Work Order",
    complete_work_order: "Complete Work Order",
};

const operationColors: Record<string, { bg: string; text: string; border: string }> = {
    add: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    subtract: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
    transfer: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    allocate: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    deallocate: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
    transfer_batch: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    check_in: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    check_out: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
    start_work_order: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
    complete_work_order: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
};

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
    scanResult,
    operation,
    quantity,
    unitLabel = "units",
    onConfirm,
    onCancel,
    isLoading = false,
}) => {
    const [note, setNote] = useState("");
    const colors = operationColors[operation] || operationColors.add;

    // Swipe gestures: right to confirm, left to cancel
    const swipeRef = useSwipeGesture<HTMLDivElement>(
        {
            onSwipeRight: () => { if (!isLoading) onConfirm(note || undefined); },
            onSwipeLeft: () => { if (!isLoading) onCancel(); },
        },
        { enabled: !isLoading }
    );

    return (
        <div ref={swipeRef} className="flex flex-col h-full" data-testid="confirmation-dialog">
            {/* Header */}
            <div
                className="text-white p-4"
                style={{
                    background: "linear-gradient(to right, var(--pi-primary, #4f46e5), color-mix(in srgb, var(--pi-primary, #4f46e5), #7c3aed 50%))",
                }}
            >
                <div className="flex items-center gap-3">
                    <button
                        onClick={onCancel}
                        disabled={isLoading}
                        className="p-2 rounded-lg hover:bg-white/20 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-50"
                        aria-label="Back to quantity"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="text-xs uppercase tracking-widest opacity-75">{scanResult.productName}</div>
                        <h2 className="text-lg font-bold">Confirm Operation</h2>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col p-4 overflow-y-auto">
                {/* Operation Summary Card */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 shadow-sm" data-testid="operation-summary">
                    {/* Operation badge */}
                    <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${colors.bg} ${colors.text} ${colors.border} border mb-4`}>
                        {operationLabels[operation] || operation}
                    </div>

                    {/* Product info */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <Package className="w-5 h-5 text-slate-400 shrink-0" />
                            <div className="min-w-0">
                                <div className="text-xs text-slate-400 font-medium">Product</div>
                                <div className="font-bold text-slate-900 truncate" data-testid="confirm-product">
                                    {scanResult.productName || "Unknown Product"}
                                </div>
                            </div>
                        </div>

                        {scanResult.locationName && (
                            <div className="flex items-center gap-3">
                                <MapPin className="w-5 h-5 text-slate-400 shrink-0" />
                                <div className="min-w-0">
                                    <div className="text-xs text-slate-400 font-medium">Location</div>
                                    <div className="font-bold text-slate-900 truncate" data-testid="confirm-location">
                                        {scanResult.locationName}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-3">
                            <Hash className="w-5 h-5 text-slate-400 shrink-0" />
                            <div>
                                <div className="text-xs text-slate-400 font-medium">Quantity</div>
                                <div className="font-bold text-slate-900" data-testid="confirm-quantity">
                                    {quantity} {unitLabel}
                                </div>
                            </div>
                        </div>

                        {scanResult.engineType && (
                            <div className="flex items-center gap-3">
                                <Layers className="w-5 h-5 text-slate-400 shrink-0" />
                                <div>
                                    <div className="text-xs text-slate-400 font-medium">Engine</div>
                                    <div className="font-bold text-slate-900 capitalize">{scanResult.engineType}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Note field */}
                <div className="mb-4">
                    <label htmlFor="operation-note" className="block text-xs font-bold text-slate-400 uppercase mb-2">
                        Note (optional)
                    </label>
                    <textarea
                        id="operation-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        disabled={isLoading}
                        placeholder="Reason for adjustment..."
                        className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none resize-none text-sm disabled:opacity-50"
                        rows={2}
                        data-testid="note-input"
                        aria-label="Note for operation"
                    />
                </div>

                {/* Action Buttons */}
                <div className="mt-auto space-y-3">
                    <button
                        onClick={() => onConfirm(note || undefined)}
                        disabled={isLoading}
                        className="w-full p-4 rounded-xl font-bold text-white text-lg flex items-center justify-center gap-3 transition-colors duration-150 min-h-[56px] disabled:opacity-70 disabled:cursor-not-allowed"
                        style={{ backgroundColor: "var(--pi-primary, #4f46e5)" }}
                        data-testid="confirm-button"
                        aria-label="Confirm operation"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-6 h-6 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            "Confirm"
                        )}
                    </button>

                    <button
                        onClick={onCancel}
                        disabled={isLoading}
                        className="w-full p-3 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed"
                        data-testid="cancel-button"
                        aria-label="Cancel operation"
                    >
                        Cancel
                    </button>

                    {/* Swipe hint — visible on mobile only */}
                    <p className="text-center text-xs text-slate-400 mt-2 md:hidden" aria-hidden="true">
                        Swipe right to confirm &middot; left to cancel
                    </p>
                </div>
            </div>
        </div>
    );
};
