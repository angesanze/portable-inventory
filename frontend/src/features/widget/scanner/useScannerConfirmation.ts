import { useState, useCallback } from "react";
import type { QRScanResult } from "./QRScanner";
import type { OperationType } from "./ScanResult";
import { PROFILE_METADATA } from "../../../types/api";
import type { InventoryProfile } from "../../../types/api";

type FlowStep = "scanning" | "result" | "quantity" | "confirming" | "success" | "error";

interface ScannerFlowState {
    step: FlowStep;
    scanResult: QRScanResult | null;
    operation: OperationType | null;
    quantity: number;
    note?: string;
    isLoading: boolean;
    error: string | null;
    previousQuantity?: number;
    dimensionValues?: Record<string, number>;
    expiryDate?: string;
    batchRef?: string;
}

interface UseScannerConfirmationOptions {
    apiKey: string | null;
    apiUrl: string;
    sendTransactionEvent?: (detail: {
        transactionType: string;
        productId: string | number;
        quantity: number;
        success: boolean;
    }) => void;
    sendErrorEvent?: (message: string) => void;
}

/**
 * Orchestrates the scanner confirmation flow:
 * scanning → result → quantity → confirming → success/error
 *
 * Reuses the same API endpoints as useWidgetOperations.handleMove()
 * without duplicating the transaction logic — builds the payload
 * from scanner context and calls /widget/move/ directly.
 */
export function useScannerConfirmation(options: UseScannerConfirmationOptions) {
    const { apiKey, apiUrl, sendTransactionEvent, sendErrorEvent } = options;

    const [state, setState] = useState<ScannerFlowState>({
        step: "scanning",
        scanResult: null,
        operation: null,
        quantity: 0,
        isLoading: false,
        error: null,
    });

    const goToResult = useCallback((scanResult: QRScanResult) => {
        setState((prev) => ({
            ...prev,
            step: "result",
            scanResult,
            operation: null,
            quantity: 0,
            error: null,
        }));
    }, []);

    const goToQuantity = useCallback((operation: OperationType) => {
        setState((prev) => ({ ...prev, step: "quantity", operation }));
    }, []);

    const goToConfirm = useCallback((quantity: number, note?: string, metadata?: { dimensionValues?: Record<string, number>; expiryDate?: string; batchRef?: string }) => {
        setState((prev) => ({
            ...prev,
            step: "confirming",
            quantity,
            note,
            dimensionValues: metadata?.dimensionValues,
            expiryDate: metadata?.expiryDate,
            batchRef: metadata?.batchRef,
        }));
    }, []);

    const goBack = useCallback(() => {
        setState((prev) => {
            switch (prev.step) {
                case "result":
                    return { ...prev, step: "scanning" as FlowStep, scanResult: null };
                case "quantity":
                    return { ...prev, step: "result" as FlowStep };
                case "confirming":
                    return { ...prev, step: "quantity" as FlowStep };
                case "error":
                    return { ...prev, step: "confirming" as FlowStep, error: null };
                default:
                    return prev;
            }
        });
    }, []);

    const resetFlow = useCallback(() => {
        setState({
            step: "scanning",
            scanResult: null,
            operation: null,
            quantity: 0,
            isLoading: false,
            error: null,
        });
    }, []);

    const executeOperation = useCallback(async (note?: string) => {
        const { scanResult, operation, quantity } = state;
        if (!scanResult || !operation || !apiKey) return;

        const isAdd = ["add", "allocate", "check_in", "start_work_order"].includes(operation);
        const productId = scanResult.productId;
        const locationId = scanResult.locationId;

        if (!productId || !locationId) {
            setState((prev) => ({ ...prev, step: "error", error: "Missing product or location context" }));
            return;
        }

        setState((prev) => ({ ...prev, isLoading: true }));

        // Profile-first detection with legacy fallback
        const profile: InventoryProfile | undefined = scanResult.profile;
        const meta = profile ? PROFILE_METADATA[profile] : undefined;

        const isSerialised = meta?.supportsSerials
            ?? (scanResult.engineType === "tracker" || scanResult.trackingMode === "INDIVIDUAL");

        const payload: Record<string, unknown> = {
            api_key: apiKey,
            product_id: productId,
            location_id: locationId,
            quantity: isSerialised ? (isAdd ? 1 : -1) : (isAdd ? quantity : -quantity),
            reason: note || "Scanner Adjustment",
            physical_identifier: scanResult.identifier || undefined,
        };

        // Profile-based calculator payload dispatch
        if (profile) {
            switch (profile) {
                case "BATCH_TRACKED":
                    payload.calculator_payload = {
                        operation: isAdd ? "add" : "subtract",
                        quantity,
                    };
                    break;
                case "PERISHABLE":
                    payload.calculator_payload = {
                        operation: isAdd ? "add" : "subtract",
                        quantity,
                        expiry_date: state.expiryDate || undefined,
                        batch_ref: state.batchRef || undefined,
                    };
                    break;
                case "DIMENSIONAL":
                    if (state.dimensionValues) {
                        payload.calculator_payload = {
                            operation: isAdd ? "add" : "subtract",
                            dimension_values: state.dimensionValues,
                        };
                    }
                    break;
                // SIMPLE_COUNT, UNIT_CONVERSION, SERIALIZED, ASSEMBLED — no calculator_payload needed
            }
        } else {
            // Legacy fallback for QR codes without profile data
            if (scanResult.engineType === "bucket") {
                payload.calculator_payload = {
                    operation: isAdd ? "add" : "subtract",
                    quantity,
                };
            } else if (scanResult.engineType === "dimension" && state.dimensionValues) {
                payload.calculator_payload = {
                    operation: isAdd ? "add" : "subtract",
                    dimension_values: state.dimensionValues,
                };
            } else if (scanResult.engineType === "time_based") {
                payload.calculator_payload = {
                    operation: isAdd ? "add" : "subtract",
                    quantity,
                    expiry_date: state.expiryDate || undefined,
                    batch_ref: state.batchRef || undefined,
                };
            }
        }

        try {
            const res = await fetch(`${apiUrl}/widget/move/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();

            if (res.ok) {
                sendTransactionEvent?.({
                    transactionType: isAdd ? "check_in" : "check_out",
                    productId,
                    quantity,
                    success: true,
                });
                setState((prev) => ({
                    ...prev,
                    step: "success",
                    isLoading: false,
                    previousQuantity: scanResult.quantity,
                }));
            } else {
                const errorMsg = data.detail || data[0] || "Operation failed";
                sendTransactionEvent?.({
                    transactionType: isAdd ? "check_in" : "check_out",
                    productId,
                    quantity,
                    success: false,
                });
                sendErrorEvent?.(errorMsg);
                setState((prev) => ({
                    ...prev,
                    step: "error",
                    isLoading: false,
                    error: errorMsg,
                }));
            }
        } catch (err) {
            const errorMsg = (err instanceof Error ? err.message : undefined) || "Network error";
            sendErrorEvent?.(errorMsg);
            setState((prev) => ({
                ...prev,
                step: "error",
                isLoading: false,
                error: errorMsg,
            }));
        }
    }, [state, apiKey, apiUrl, sendTransactionEvent, sendErrorEvent]);

    return {
        ...state,
        goToResult,
        goToQuantity,
        goToConfirm,
        goBack,
        resetFlow,
        executeOperation,
    };
}
