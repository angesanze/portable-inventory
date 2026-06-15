import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QuantityInput } from "../QuantityInput";
import type { QRScanResult } from "../QRScanner";

const baseScanResult: QRScanResult = {
    code: "AB12CD34",
    productId: "prod-1",
    productName: "Test Widget",
    productSku: "TW-001",
    quantity: 42,
    locationId: "loc-1",
    locationName: "Warehouse A",
};

describe("QuantityInput", () => {
    it("renders with initial display of 0", () => {
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
            />
        );

        expect(screen.getByTestId("display-value")).toHaveTextContent("0");
    });

    it("shows operation label in header", () => {
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="subtract"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
            />
        );

        expect(screen.getByText("Remove Stock")).toBeInTheDocument();
    });

    it("shows product name in header", () => {
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
            />
        );

        expect(screen.getByText("Test Widget")).toBeInTheDocument();
    });

    it("updates display when number keys pressed", () => {
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
            />
        );

        fireEvent.click(screen.getByTestId("key-5"));
        expect(screen.getByTestId("display-value")).toHaveTextContent("5");

        fireEvent.click(screen.getByTestId("key-3"));
        expect(screen.getByTestId("display-value")).toHaveTextContent("53");
    });

    it("handles delete key", () => {
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
            />
        );

        fireEvent.click(screen.getByTestId("key-4"));
        fireEvent.click(screen.getByTestId("key-2"));
        expect(screen.getByTestId("display-value")).toHaveTextContent("42");

        fireEvent.click(screen.getByTestId("key-del"));
        expect(screen.getByTestId("display-value")).toHaveTextContent("4");

        fireEvent.click(screen.getByTestId("key-del"));
        expect(screen.getByTestId("display-value")).toHaveTextContent("0");
    });

    it("replaces leading zero with first digit", () => {
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
            />
        );

        expect(screen.getByTestId("display-value")).toHaveTextContent("0");
        fireEvent.click(screen.getByTestId("key-7"));
        expect(screen.getByTestId("display-value")).toHaveTextContent("7");
    });

    it("blocks decimal when step is integer", () => {
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
                step={1}
            />
        );

        fireEvent.click(screen.getByTestId("key-5"));
        fireEvent.click(screen.getByTestId("key-."));
        fireEvent.click(screen.getByTestId("key-3"));
        // Decimal should be ignored — display should be "53"
        expect(screen.getByTestId("display-value")).toHaveTextContent("53");
    });

    it("allows decimal when step is fractional", () => {
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
                step={0.5}
            />
        );

        fireEvent.click(screen.getByTestId("key-5"));
        fireEvent.click(screen.getByTestId("key-."));
        fireEvent.click(screen.getByTestId("key-5"));
        expect(screen.getByTestId("display-value")).toHaveTextContent("5.5");
    });

    it("prevents double decimal", () => {
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
                step={0.1}
            />
        );

        fireEvent.click(screen.getByTestId("key-1"));
        fireEvent.click(screen.getByTestId("key-."));
        fireEvent.click(screen.getByTestId("key-."));
        fireEvent.click(screen.getByTestId("key-5"));
        expect(screen.getByTestId("display-value")).toHaveTextContent("1.5");
    });

    it("quick-add buttons increment value", () => {
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
            />
        );

        fireEvent.click(screen.getByTestId("quick-add-10"));
        expect(screen.getByTestId("display-value")).toHaveTextContent("10");

        fireEvent.click(screen.getByTestId("quick-add-5"));
        expect(screen.getByTestId("display-value")).toHaveTextContent("15");
    });

    it("confirm button disabled when value is 0", () => {
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
            />
        );

        expect(screen.getByTestId("confirm-quantity")).toBeDisabled();
    });

    it("confirm button enabled with valid value", () => {
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
            />
        );

        fireEvent.click(screen.getByTestId("key-5"));
        expect(screen.getByTestId("confirm-quantity")).not.toBeDisabled();
    });

    it("calls onConfirm with numeric value", () => {
        const onConfirm = vi.fn();
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={onConfirm}
                onBack={vi.fn()}
            />
        );

        fireEvent.click(screen.getByTestId("key-2"));
        fireEvent.click(screen.getByTestId("key-5"));
        fireEvent.click(screen.getByTestId("confirm-quantity"));

        expect(onConfirm).toHaveBeenCalledWith(25);
    });

    it("calls onBack when back button clicked", () => {
        const onBack = vi.fn();
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={onBack}
            />
        );

        fireEvent.click(screen.getByLabelText("Back to operations"));
        expect(onBack).toHaveBeenCalledOnce();
    });

    it("shows unit label", () => {
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
                unitLabel="bottles"
            />
        );

        expect(screen.getAllByText("bottles").length).toBeGreaterThan(0);
    });

    it("shows converter preview with conversion factor", () => {
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
                unitLabel="gallons"
                secondaryUnitLabel="liters"
                conversionFactor={3.785}
                step={0.1}
            />
        );

        fireEvent.click(screen.getByTestId("key-2"));
        const preview = screen.getByTestId("converter-preview");
        expect(preview).toHaveTextContent("7.57");
        expect(preview).toHaveTextContent("liters");
    });

    it("shows max validation error", () => {
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
                max={10}
            />
        );

        fireEvent.click(screen.getByTestId("key-2"));
        fireEvent.click(screen.getByTestId("key-0"));
        expect(screen.getByTestId("validation-max")).toHaveTextContent("Maximum: 10 units");
        expect(screen.getByTestId("confirm-quantity")).toBeDisabled();
    });

    it("shows batch selector for deallocate operation", () => {
        const batches = [
            { id: "b1", batch_identifier: "BATCH-001", quantity: 50 },
            { id: "b2", batch_identifier: "BATCH-002", quantity: 30 },
        ];

        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="deallocate"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
                availableBatches={batches}
                onBatchSelect={vi.fn()}
            />
        );

        const trigger = screen.getByRole("combobox", { name: /select batch/i });
        expect(trigger).toBeInTheDocument();
        // Options render in the portal dropdown only once it is opened.
        fireEvent.click(trigger);
        expect(screen.getByText("BATCH-001 (qty: 50)")).toBeInTheDocument();
        expect(screen.getByText("BATCH-002 (qty: 30)")).toBeInTheDocument();
    });

    it("calls onBatchSelect when batch chosen", () => {
        const onBatchSelect = vi.fn();
        const batches = [
            { id: "b1", batch_identifier: "BATCH-001", quantity: 50 },
        ];

        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="subtract"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
                availableBatches={batches}
                onBatchSelect={onBatchSelect}
            />
        );

        fireEvent.click(screen.getByRole("combobox", { name: /select batch/i }));
        fireEvent.click(screen.getByText("BATCH-001 (qty: 50)"));
        expect(onBatchSelect).toHaveBeenCalledWith("b1");
    });

    it("does not show batch selector for add operation", () => {
        const batches = [
            { id: "b1", batch_identifier: "BATCH-001", quantity: 50 },
        ];

        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
                availableBatches={batches}
            />
        );

        expect(screen.queryByRole("combobox", { name: /select batch/i })).not.toBeInTheDocument();
    });

    it("renders all 12 keypad buttons", () => {
        render(
            <QuantityInput
                scanResult={baseScanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
            />
        );

        const keypad = screen.getByTestId("keypad");
        expect(keypad.children).toHaveLength(12);
    });
});
