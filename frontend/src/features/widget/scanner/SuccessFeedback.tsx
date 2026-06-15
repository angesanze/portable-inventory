import React, { useEffect } from "react";
import { CheckCircle2, Scan, ExternalLink, XCircle, RotateCcw } from "lucide-react";
import type { QRScanResult } from "./QRScanner";
import type { OperationType } from "./ScanResult";

interface SuccessFeedbackProps {
    scanResult: QRScanResult;
    operation: OperationType;
    quantity: number;
    unitLabel?: string;
    previousQuantity?: number;
    onScanAnother: () => void;
    onViewDetails?: () => void;
}

interface ErrorFeedbackProps {
    errorMessage: string;
    onRetry: () => void;
    onCancel: () => void;
}

const operationLabels: Record<string, string> = {
    add: "Added",
    subtract: "Removed",
    transfer: "Transferred",
    allocate: "Allocated",
    deallocate: "Deallocated",
    transfer_batch: "Transferred Batch",
    check_in: "Checked In",
    check_out: "Checked Out",
    start_work_order: "Started",
    complete_work_order: "Completed",
};

export const SuccessFeedback: React.FC<SuccessFeedbackProps> = ({
    scanResult,
    operation,
    quantity,
    unitLabel = "units",
    previousQuantity,
    onScanAnother,
    onViewDetails,
}) => {
    useEffect(() => {
        // Haptic feedback on success
        if (navigator.vibrate) {
            navigator.vibrate(200);
        }
    }, []);

    const newQuantity = previousQuantity !== undefined
        ? (["add", "allocate", "check_in"].includes(operation)
            ? previousQuantity + quantity
            : previousQuantity - quantity)
        : undefined;

    return (
        <div className="flex flex-col h-full items-center justify-center p-6" data-testid="success-feedback">
            {/* Animated checkmark */}
            <div className="mb-6 animate-in zoom-in duration-300">
                <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-14 h-14 text-emerald-500" data-testid="success-icon" />
                </div>
            </div>

            {/* Success message */}
            <h2 className="text-2xl font-bold text-slate-900 mb-2" data-testid="success-title">
                {operationLabels[operation] || "Success"}!
            </h2>
            <p className="text-slate-500 text-center mb-6" data-testid="success-detail">
                {quantity} {unitLabel} — {scanResult.productName}
            </p>

            {/* Before → After display */}
            {previousQuantity !== undefined && newQuantity !== undefined && (
                <div
                    className="bg-white rounded-xl border border-slate-200 p-4 mb-6 w-full max-w-xs shadow-sm"
                    data-testid="stock-change"
                >
                    <div className="text-xs font-bold text-slate-400 uppercase text-center mb-3">Stock Updated</div>
                    <div className="flex items-center justify-center gap-3">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-slate-400 font-mono" data-testid="previous-quantity">
                                {previousQuantity}
                            </div>
                            <div className="text-xs text-slate-400">Before</div>
                        </div>
                        <div className="text-slate-300 text-xl">→</div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-emerald-600 font-mono" data-testid="new-quantity">
                                {newQuantity}
                            </div>
                            <div className="text-xs text-slate-400">After</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Action buttons */}
            <div className="w-full max-w-xs space-y-3">
                <button
                    onClick={onScanAnother}
                    className="w-full p-4 rounded-xl font-bold text-white text-lg flex items-center justify-center gap-3 transition-colors duration-150 min-h-[56px]"
                    style={{ backgroundColor: "var(--pi-primary, #4f46e5)" }}
                    data-testid="scan-another-button"
                    aria-label="Scan another code"
                >
                    <Scan className="w-5 h-5" />
                    Scan Another
                </button>

                {onViewDetails && (
                    <button
                        onClick={onViewDetails}
                        className="w-full p-3 rounded-xl font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 min-h-[48px]"
                        data-testid="view-details-button"
                        aria-label="View product details"
                    >
                        <ExternalLink className="w-4 h-4" />
                        View Details
                    </button>
                )}
            </div>
        </div>
    );
};

export const ErrorFeedback: React.FC<ErrorFeedbackProps> = ({
    errorMessage,
    onRetry,
    onCancel,
}) => {
    return (
        <div className="flex flex-col h-full items-center justify-center p-6" data-testid="error-feedback">
            {/* Animated error icon */}
            <div className="mb-6 animate-in zoom-in duration-300">
                <div className="w-24 h-24 rounded-full bg-red-100 flex items-center justify-center animate-shake">
                    <XCircle className="w-14 h-14 text-red-500" data-testid="error-icon" />
                </div>
            </div>

            {/* Error message */}
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Operation Failed</h2>
            <p className="text-red-600 text-center mb-6 font-medium" data-testid="error-message">
                {errorMessage}
            </p>

            {/* Action buttons */}
            <div className="w-full max-w-xs space-y-3">
                <button
                    onClick={onRetry}
                    className="w-full p-4 rounded-xl font-bold text-white text-lg flex items-center justify-center gap-3 transition-colors duration-150 min-h-[56px]"
                    style={{ backgroundColor: "var(--pi-primary, #4f46e5)" }}
                    data-testid="retry-button"
                    aria-label="Retry operation"
                >
                    <RotateCcw className="w-5 h-5" />
                    Retry
                </button>

                <button
                    onClick={onCancel}
                    className="w-full p-3 rounded-xl font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors min-h-[48px]"
                    data-testid="cancel-error-button"
                    aria-label="Cancel and go back"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
};
