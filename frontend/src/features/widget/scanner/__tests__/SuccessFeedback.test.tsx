import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SuccessFeedback, ErrorFeedback } from "../SuccessFeedback";
import type { QRScanResult } from "../QRScanner";

const baseScanResult: QRScanResult = {
    code: "AB12CD34",
    productId: "prod-1",
    productName: "Test Widget",
    productSku: "TW-001",
    engineType: undefined,
    trackingMode: "BULK",
    quantity: 42,
    locationId: "loc-1",
    locationName: "Warehouse A",
};

describe("SuccessFeedback", () => {
    beforeEach(() => {
        // Mock navigator.vibrate
        Object.defineProperty(navigator, "vibrate", {
            value: vi.fn(),
            writable: true,
            configurable: true,
        });
    });

    const defaultProps = {
        scanResult: baseScanResult,
        operation: "add" as const,
        quantity: 10,
        unitLabel: "units",
        onScanAnother: vi.fn(),
    };

    it("renders success icon and title", () => {
        render(<SuccessFeedback {...defaultProps} />);

        expect(screen.getByTestId("success-icon")).toBeInTheDocument();
        expect(screen.getByTestId("success-title")).toHaveTextContent("Added!");
    });

    it("shows quantity and product in detail", () => {
        render(<SuccessFeedback {...defaultProps} />);

        expect(screen.getByTestId("success-detail")).toHaveTextContent("10 units — Test Widget");
    });

    it("triggers haptic feedback on mount", () => {
        render(<SuccessFeedback {...defaultProps} />);
        expect(navigator.vibrate).toHaveBeenCalledWith(200);
    });

    it("shows before → after stock when previousQuantity provided", () => {
        render(<SuccessFeedback {...defaultProps} previousQuantity={42} />);

        expect(screen.getByTestId("stock-change")).toBeInTheDocument();
        expect(screen.getByTestId("previous-quantity")).toHaveTextContent("42");
        expect(screen.getByTestId("new-quantity")).toHaveTextContent("52");
    });

    it("calculates subtract correctly", () => {
        render(<SuccessFeedback {...defaultProps} operation="subtract" previousQuantity={42} />);

        expect(screen.getByTestId("new-quantity")).toHaveTextContent("32");
    });

    it("hides stock change when no previousQuantity", () => {
        render(<SuccessFeedback {...defaultProps} />);

        expect(screen.queryByTestId("stock-change")).not.toBeInTheDocument();
    });

    it("calls onScanAnother when button clicked", () => {
        const onScanAnother = vi.fn();
        render(<SuccessFeedback {...defaultProps} onScanAnother={onScanAnother} />);

        fireEvent.click(screen.getByTestId("scan-another-button"));
        expect(onScanAnother).toHaveBeenCalledOnce();
    });

    it("shows View Details when handler provided", () => {
        const onViewDetails = vi.fn();
        render(<SuccessFeedback {...defaultProps} onViewDetails={onViewDetails} />);

        const btn = screen.getByTestId("view-details-button");
        expect(btn).toBeInTheDocument();
        fireEvent.click(btn);
        expect(onViewDetails).toHaveBeenCalledOnce();
    });

    it("hides View Details when no handler", () => {
        render(<SuccessFeedback {...defaultProps} />);
        expect(screen.queryByTestId("view-details-button")).not.toBeInTheDocument();
    });

    it("shows correct past tense for each operation", () => {
        const ops = [
            { op: "add", label: "Added!" },
            { op: "subtract", label: "Removed!" },
            { op: "check_in", label: "Checked In!" },
            { op: "check_out", label: "Checked Out!" },
        ] as const;

        ops.forEach(({ op, label }) => {
            const { unmount } = render(<SuccessFeedback {...defaultProps} operation={op} />);
            expect(screen.getByTestId("success-title")).toHaveTextContent(label);
            unmount();
        });
    });
});

describe("ErrorFeedback", () => {
    const defaultProps = {
        errorMessage: "Insufficient stock",
        onRetry: vi.fn(),
        onCancel: vi.fn(),
    };

    it("renders error icon and message", () => {
        render(<ErrorFeedback {...defaultProps} />);

        expect(screen.getByTestId("error-icon")).toBeInTheDocument();
        expect(screen.getByTestId("error-message")).toHaveTextContent("Insufficient stock");
        expect(screen.getByText("Operation Failed")).toBeInTheDocument();
    });

    it("calls onRetry when retry clicked", () => {
        const onRetry = vi.fn();
        render(<ErrorFeedback {...defaultProps} onRetry={onRetry} />);

        fireEvent.click(screen.getByTestId("retry-button"));
        expect(onRetry).toHaveBeenCalledOnce();
    });

    it("calls onCancel when cancel clicked", () => {
        const onCancel = vi.fn();
        render(<ErrorFeedback {...defaultProps} onCancel={onCancel} />);

        fireEvent.click(screen.getByTestId("cancel-error-button"));
        expect(onCancel).toHaveBeenCalledOnce();
    });
});
