import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ScanResult } from "../ScanResult";
import { getOperationsForProfile } from "../ScanResult.operations";
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

describe("ScanResult", () => {
    it("renders product info from scan result", () => {
        const onSelect = vi.fn();
        const onBack = vi.fn();

        render(<ScanResult scanResult={baseScanResult} onSelectOperation={onSelect} onBack={onBack} />);

        expect(screen.getByTestId("product-name")).toHaveTextContent("Test Widget");
        expect(screen.getByText("TW-001")).toBeInTheDocument();
        expect(screen.getByText("42")).toBeInTheDocument();
        expect(screen.getByText("Warehouse A")).toBeInTheDocument();
    });

    it("shows 'Unknown Product' when name missing", () => {
        const result: QRScanResult = { ...baseScanResult, productName: undefined };
        render(<ScanResult scanResult={result} onSelectOperation={vi.fn()} onBack={vi.fn()} />);

        expect(screen.getByTestId("product-name")).toHaveTextContent("Unknown Product");
    });

    it("displays identifier when present", () => {
        const result: QRScanResult = { ...baseScanResult, identifier: "SN-12345" };
        render(<ScanResult scanResult={result} onSelectOperation={vi.fn()} onBack={vi.fn()} />);

        expect(screen.getByText("SN-12345")).toBeInTheDocument();
    });

    it("calls onBack when back button clicked", () => {
        const onBack = vi.fn();
        render(<ScanResult scanResult={baseScanResult} onSelectOperation={vi.fn()} onBack={onBack} />);

        fireEvent.click(screen.getByLabelText("Back to scanner"));
        expect(onBack).toHaveBeenCalledOnce();
    });

    it("calls onBack when 'Scan Another Code' clicked", () => {
        const onBack = vi.fn();
        render(<ScanResult scanResult={baseScanResult} onSelectOperation={vi.fn()} onBack={onBack} />);

        fireEvent.click(screen.getByLabelText("Scan another code"));
        expect(onBack).toHaveBeenCalledOnce();
    });

    it("calls onSelectOperation with correct operation type", () => {
        const onSelect = vi.fn();
        render(<ScanResult scanResult={baseScanResult} onSelectOperation={onSelect} onBack={vi.fn()} />);

        fireEvent.click(screen.getByTestId("operation-add"));
        expect(onSelect).toHaveBeenCalledWith("add");
    });

    // --- Profile-based operation rendering ---

    it("shows Add/Subtract/Transfer for counter/default engine", () => {
        render(<ScanResult scanResult={baseScanResult} onSelectOperation={vi.fn()} onBack={vi.fn()} />);

        const buttons = screen.getByTestId("operation-buttons");
        expect(buttons).toBeInTheDocument();
        expect(screen.getByTestId("operation-add")).toBeInTheDocument();
        expect(screen.getByTestId("operation-subtract")).toBeInTheDocument();
        expect(screen.getByTestId("operation-transfer")).toBeInTheDocument();
    });

    it("shows Allocate/Deallocate/Transfer for BATCH_TRACKED profile", () => {
        const result: QRScanResult = { ...baseScanResult, profile: "BATCH_TRACKED" };
        render(<ScanResult scanResult={result} onSelectOperation={vi.fn()} onBack={vi.fn()} />);

        expect(screen.getByTestId("operation-allocate")).toBeInTheDocument();
        expect(screen.getByTestId("operation-deallocate")).toBeInTheDocument();
        expect(screen.getByTestId("operation-transfer_batch")).toBeInTheDocument();
    });

    it("shows Start/Complete for ASSEMBLED profile", () => {
        const result: QRScanResult = { ...baseScanResult, profile: "ASSEMBLED" };
        render(<ScanResult scanResult={result} onSelectOperation={vi.fn()} onBack={vi.fn()} />);

        expect(screen.getByTestId("operation-start_work_order")).toBeInTheDocument();
        expect(screen.getByTestId("operation-complete_work_order")).toBeInTheDocument();
    });

    it("shows Check In/Check Out/Transfer for SERIALIZED profile", () => {
        const result: QRScanResult = { ...baseScanResult, profile: "SERIALIZED" };
        render(<ScanResult scanResult={result} onSelectOperation={vi.fn()} onBack={vi.fn()} />);

        expect(screen.getByTestId("operation-check_in")).toBeInTheDocument();
        expect(screen.getByTestId("operation-check_out")).toBeInTheDocument();
        expect(screen.getByTestId("operation-transfer")).toBeInTheDocument();
    });

    it("shows tracker ops for engine_type=tracker fallback", () => {
        const result: QRScanResult = { ...baseScanResult, engineType: "tracker" };
        render(<ScanResult scanResult={result} onSelectOperation={vi.fn()} onBack={vi.fn()} />);

        expect(screen.getByTestId("operation-check_in")).toBeInTheDocument();
        expect(screen.getByTestId("operation-check_out")).toBeInTheDocument();
    });

    it("shows assembly ops for batch_manager engine type fallback", () => {
        const result: QRScanResult = { ...baseScanResult, engineType: "batch_manager" };
        render(<ScanResult scanResult={result} onSelectOperation={vi.fn()} onBack={vi.fn()} />);

        expect(screen.getByTestId("operation-start_work_order")).toBeInTheDocument();
        expect(screen.getByTestId("operation-complete_work_order")).toBeInTheDocument();
    });

    it("shows profile label badge", () => {
        const result: QRScanResult = { ...baseScanResult, profile: "UNIT_CONVERSION" };
        render(<ScanResult scanResult={result} onSelectOperation={vi.fn()} onBack={vi.fn()} />);

        expect(screen.getByText("Unit Conversion")).toBeInTheDocument();
    });
});

describe("getOperationsForProfile", () => {
    it("returns counter ops by default", () => {
        const ops = getOperationsForProfile(undefined, undefined);
        expect(ops.map(o => o.operation)).toEqual(["add", "subtract", "transfer"]);
    });

    it("returns bucket ops for BATCH_TRACKED profile", () => {
        const ops = getOperationsForProfile("BATCH_TRACKED");
        expect(ops.map(o => o.operation)).toEqual(["allocate", "deallocate", "transfer_batch"]);
    });

    it("returns assembly ops for ASSEMBLED profile", () => {
        const ops = getOperationsForProfile("ASSEMBLED");
        expect(ops.map(o => o.operation)).toEqual(["start_work_order", "complete_work_order"]);
    });

    it("returns tracker ops for SERIALIZED profile", () => {
        const ops = getOperationsForProfile("SERIALIZED");
        expect(ops.map(o => o.operation)).toEqual(["check_in", "check_out", "transfer"]);
    });

    it("falls back to engine_type when no profile", () => {
        const ops = getOperationsForProfile(undefined, "tracker");
        expect(ops.map(o => o.operation)).toEqual(["check_in", "check_out", "transfer"]);
    });
});
