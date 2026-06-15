import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConfirmationDialog } from "../ConfirmationDialog";
import type { QRScanResult } from "../QRScanner";
import type { OperationType } from "../ScanResult";

const baseScanResult: QRScanResult = {
    code: "AB12CD34",
    productId: "prod-1",
    productName: "Test Widget",
    productSku: "TW-001",
    engineType: "counter",
    trackingMode: "BULK",
    quantity: 42,
    locationId: "loc-1",
    locationName: "Warehouse A",
};

describe("ConfirmationDialog", () => {
    const defaultProps = {
        scanResult: baseScanResult,
        operation: "add" as OperationType,
        quantity: 10,
        unitLabel: "units",
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
    };

    it("renders operation summary with product, location, quantity", () => {
        render(<ConfirmationDialog {...defaultProps} />);

        expect(screen.getByTestId("confirm-product")).toHaveTextContent("Test Widget");
        expect(screen.getByTestId("confirm-location")).toHaveTextContent("Warehouse A");
        expect(screen.getByTestId("confirm-quantity")).toHaveTextContent("10 units");
    });

    it("shows operation type badge", () => {
        render(<ConfirmationDialog {...defaultProps} operation="subtract" />);
        expect(screen.getByText("Remove Stock")).toBeInTheDocument();
    });

    it("shows 'Unknown Product' when name missing", () => {
        const result = { ...baseScanResult, productName: undefined };
        render(<ConfirmationDialog {...defaultProps} scanResult={result} />);
        expect(screen.getByTestId("confirm-product")).toHaveTextContent("Unknown Product");
    });

    it("hides location when not provided", () => {
        const result = { ...baseScanResult, locationName: undefined };
        render(<ConfirmationDialog {...defaultProps} scanResult={result} />);
        expect(screen.queryByTestId("confirm-location")).not.toBeInTheDocument();
    });

    it("calls onConfirm with no note when note empty", () => {
        const onConfirm = vi.fn();
        render(<ConfirmationDialog {...defaultProps} onConfirm={onConfirm} />);

        fireEvent.click(screen.getByTestId("confirm-button"));
        expect(onConfirm).toHaveBeenCalledWith(undefined);
    });

    it("calls onConfirm with note text", () => {
        const onConfirm = vi.fn();
        render(<ConfirmationDialog {...defaultProps} onConfirm={onConfirm} />);

        fireEvent.change(screen.getByTestId("note-input"), { target: { value: "Restock" } });
        fireEvent.click(screen.getByTestId("confirm-button"));
        expect(onConfirm).toHaveBeenCalledWith("Restock");
    });

    it("calls onCancel when cancel clicked", () => {
        const onCancel = vi.fn();
        render(<ConfirmationDialog {...defaultProps} onCancel={onCancel} />);

        fireEvent.click(screen.getByTestId("cancel-button"));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it("calls onCancel when back arrow clicked", () => {
        const onCancel = vi.fn();
        render(<ConfirmationDialog {...defaultProps} onCancel={onCancel} />);

        fireEvent.click(screen.getByLabelText("Back to quantity"));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it("shows loading state with spinner", () => {
        render(<ConfirmationDialog {...defaultProps} isLoading={true} />);

        expect(screen.getByText("Processing...")).toBeInTheDocument();
        expect(screen.getByTestId("confirm-button")).toBeDisabled();
        expect(screen.getByTestId("cancel-button")).toBeDisabled();
    });

    it("disables note input during loading", () => {
        render(<ConfirmationDialog {...defaultProps} isLoading={true} />);

        expect(screen.getByTestId("note-input")).toBeDisabled();
    });

    it("renders all operation label variants", () => {
        const operations: OperationType[] = [
            "add", "subtract", "transfer", "allocate", "deallocate",
            "transfer_batch", "check_in", "check_out", "start_work_order", "complete_work_order",
        ];
        const labels = [
            "Add Stock", "Remove Stock", "Transfer", "Allocate", "Deallocate",
            "Transfer Batch", "Check In", "Check Out", "Start Work Order", "Complete Work Order",
        ];

        operations.forEach((op, i) => {
            const { unmount } = render(<ConfirmationDialog {...defaultProps} operation={op} />);
            expect(screen.getByText(labels[i])).toBeInTheDocument();
            unmount();
        });
    });

    it("shows engine type when present", () => {
        render(<ConfirmationDialog {...defaultProps} />);
        expect(screen.getByText("counter")).toBeInTheDocument();
    });
});
