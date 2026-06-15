import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConfirmDialog, useConfirmDialog } from "../ConfirmDialog";
import { useState } from "react";

describe("ConfirmDialog", () => {
    const defaultProps = {
        isOpen: true,
        title: "Delete Item",
        message: "Are you sure you want to delete this?",
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
    };

    it("renders nothing when closed", () => {
        const { container } = render(
            <ConfirmDialog {...defaultProps} isOpen={false} />
        );
        expect(container.innerHTML).toBe("");
    });

    it("renders title and message when open", () => {
        render(<ConfirmDialog {...defaultProps} />);
        expect(screen.getByText("Delete Item")).toBeTruthy();
        expect(screen.getByText("Are you sure you want to delete this?")).toBeTruthy();
    });

    it("shows default button labels", () => {
        render(<ConfirmDialog {...defaultProps} />);
        expect(screen.getByTestId("confirm-dialog-confirm").textContent).toBe("Confirm");
        expect(screen.getByTestId("confirm-dialog-cancel").textContent).toBe("Cancel");
    });

    it("shows custom button labels", () => {
        render(
            <ConfirmDialog {...defaultProps} confirmLabel="Delete" cancelLabel="Keep" />
        );
        expect(screen.getByTestId("confirm-dialog-confirm").textContent).toBe("Delete");
        expect(screen.getByTestId("confirm-dialog-cancel").textContent).toBe("Keep");
    });

    it("calls onConfirm when confirm button clicked", () => {
        const onConfirm = vi.fn();
        render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
        fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
        expect(onConfirm).toHaveBeenCalledOnce();
    });

    it("calls onCancel when cancel button clicked", () => {
        const onCancel = vi.fn();
        render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
        fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it("calls onCancel when overlay clicked", () => {
        const onCancel = vi.fn();
        render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
        fireEvent.click(screen.getByTestId("confirm-dialog-overlay"));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it("does not call onCancel when dialog body clicked", () => {
        const onCancel = vi.fn();
        render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
        fireEvent.click(screen.getByTestId("confirm-dialog"));
        expect(onCancel).not.toHaveBeenCalled();
    });

    it("shows warning icon for danger variant", () => {
        const { container } = render(
            <ConfirmDialog {...defaultProps} variant="danger" />
        );
        // AlertTriangle icon renders as svg
        expect(container.querySelector("svg")).toBeTruthy();
    });

    it("preserves newlines in message via whitespace-pre-line", () => {
        render(
            <ConfirmDialog {...defaultProps} message={"Line 1\nLine 2"} />
        );
        const messageEl = screen.getByText(/Line 1/);
        expect(messageEl.className).toContain("whitespace-pre-line");
    });
});

describe("useConfirmDialog", () => {
    function TestHarness() {
        const { confirm, dialogProps } = useConfirmDialog();
        const [result, setResult] = useState<string>("pending");

        return (
            <div>
                <button
                    data-testid="trigger"
                    onClick={async () => {
                        const ok = await confirm({
                            title: "Test",
                            message: "Confirm?",
                            variant: "danger",
                            confirmLabel: "Yes",
                        });
                        setResult(ok ? "confirmed" : "cancelled");
                    }}
                />
                <span data-testid="result">{result}</span>
                <ConfirmDialog {...dialogProps} />
            </div>
        );
    }

    it("resolves true when confirmed", async () => {
        render(<TestHarness />);
        expect(screen.getByTestId("result").textContent).toBe("pending");

        // Open dialog
        await act(async () => {
            fireEvent.click(screen.getByTestId("trigger"));
        });

        expect(screen.getByText("Test")).toBeTruthy();
        expect(screen.getByText("Confirm?")).toBeTruthy();

        // Confirm
        await act(async () => {
            fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
        });

        expect(screen.getByTestId("result").textContent).toBe("confirmed");
    });

    it("resolves false when cancelled", async () => {
        render(<TestHarness />);

        await act(async () => {
            fireEvent.click(screen.getByTestId("trigger"));
        });

        await act(async () => {
            fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));
        });

        expect(screen.getByTestId("result").textContent).toBe("cancelled");
    });

    it("resolves false when overlay clicked", async () => {
        render(<TestHarness />);

        await act(async () => {
            fireEvent.click(screen.getByTestId("trigger"));
        });

        await act(async () => {
            fireEvent.click(screen.getByTestId("confirm-dialog-overlay"));
        });

        expect(screen.getByTestId("result").textContent).toBe("cancelled");
    });
});
