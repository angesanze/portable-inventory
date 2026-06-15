import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Modal } from "../Modal";

describe("Modal", () => {
    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        title: "My Modal",
    };

    it("renders nothing when closed", () => {
        const { container } = render(
            <Modal {...defaultProps} isOpen={false}>
                <p>Body</p>
            </Modal>
        );
        expect(container.innerHTML).toBe("");
        expect(screen.queryByTestId("modal-overlay")).toBeNull();
    });

    it("renders title and children when open", () => {
        render(
            <Modal {...defaultProps}>
                <p>Body content</p>
            </Modal>
        );
        expect(screen.getByText("My Modal")).toBeTruthy();
        expect(screen.getByText("Body content")).toBeTruthy();
        expect(screen.getByTestId("modal")).toBeTruthy();
    });

    it("renders footer when provided", () => {
        render(
            <Modal {...defaultProps} footer={<button>Save</button>}>
                <p>Body</p>
            </Modal>
        );
        expect(screen.getByText("Save")).toBeTruthy();
    });

    it("does not render close button when no title", () => {
        render(
            <Modal isOpen onClose={vi.fn()}>
                <p>Body</p>
            </Modal>
        );
        expect(screen.queryByTestId("modal-close")).toBeNull();
    });

    it("calls onClose when backdrop clicked", () => {
        const onClose = vi.fn();
        render(
            <Modal {...defaultProps} onClose={onClose}>
                <p>Body</p>
            </Modal>
        );
        fireEvent.click(screen.getByTestId("modal-overlay"));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("does not call onClose when panel clicked", () => {
        const onClose = vi.fn();
        render(
            <Modal {...defaultProps} onClose={onClose}>
                <p>Body</p>
            </Modal>
        );
        fireEvent.click(screen.getByTestId("modal"));
        expect(onClose).not.toHaveBeenCalled();
    });

    it("does not call onClose on backdrop click when closeOnBackdrop is false", () => {
        const onClose = vi.fn();
        render(
            <Modal {...defaultProps} onClose={onClose} closeOnBackdrop={false}>
                <p>Body</p>
            </Modal>
        );
        fireEvent.click(screen.getByTestId("modal-overlay"));
        expect(onClose).not.toHaveBeenCalled();
    });

    it("calls onClose when close button clicked", () => {
        const onClose = vi.fn();
        render(
            <Modal {...defaultProps} onClose={onClose}>
                <p>Body</p>
            </Modal>
        );
        fireEvent.click(screen.getByTestId("modal-close"));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("calls onClose when Escape pressed", () => {
        const onClose = vi.fn();
        render(
            <Modal {...defaultProps} onClose={onClose}>
                <p>Body</p>
            </Modal>
        );
        fireEvent.keyDown(document, { key: "Escape" });
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("does not call onClose for other keys", () => {
        const onClose = vi.fn();
        render(
            <Modal {...defaultProps} onClose={onClose}>
                <p>Body</p>
            </Modal>
        );
        fireEvent.keyDown(document, { key: "Enter" });
        expect(onClose).not.toHaveBeenCalled();
    });
});
