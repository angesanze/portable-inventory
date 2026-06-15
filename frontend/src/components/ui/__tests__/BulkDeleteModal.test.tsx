import { fireEvent, screen, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BulkDeleteModal } from "../BulkDeleteModal";
import { renderWithI18n as render } from "../../../test-utils/i18n-wrapper";

const fiveItems = [
    { id: "1", label: "Alpha" },
    { id: "2", label: "Beta" },
    { id: "3", label: "Gamma" },
    { id: "4", label: "Delta" },
    { id: "5", label: "Epsilon" },
];

describe("BulkDeleteModal", () => {
    it("renders the title with the item count", () => {
        render(
            <BulkDeleteModal
                open
                onClose={vi.fn()}
                items={fiveItems.slice(0, 3)}
                onConfirm={vi.fn().mockResolvedValue(undefined)}
            />,
        );
        expect(screen.getByText("Delete 3 items?")).toBeInTheDocument();
    });

    it("lists each item label", () => {
        render(
            <BulkDeleteModal
                open
                onClose={vi.fn()}
                items={fiveItems.slice(0, 3)}
                onConfirm={vi.fn().mockResolvedValue(undefined)}
            />,
        );
        expect(screen.getByText("Alpha")).toBeInTheDocument();
        expect(screen.getByText("Beta")).toBeInTheDocument();
        expect(screen.getByText("Gamma")).toBeInTheDocument();
    });

    it("truncates to first 5 items and shows '...and N more' for the rest", () => {
        const items = [
            ...fiveItems,
            { id: "6", label: "Zeta" },
            { id: "7", label: "Eta" },
        ];
        render(
            <BulkDeleteModal
                open
                onClose={vi.fn()}
                items={items}
                onConfirm={vi.fn().mockResolvedValue(undefined)}
            />,
        );
        expect(screen.getByText("Alpha")).toBeInTheDocument();
        expect(screen.getByText("Epsilon")).toBeInTheDocument();
        expect(screen.queryByText("Zeta")).toBeNull();
        expect(screen.queryByText("Eta")).toBeNull();
        expect(screen.getByTestId("bulk-delete-overflow").textContent).toContain("2");
    });

    it("renders the cascade toggle defaulting to ON when cascadeDefault is true", () => {
        render(
            <BulkDeleteModal
                open
                onClose={vi.fn()}
                items={fiveItems.slice(0, 1)}
                cascadeLabel="Keep movement history (recommended)"
                cascadeDefault
                onConfirm={vi.fn().mockResolvedValue(undefined)}
            />,
        );
        const toggle = screen.getByLabelText(
            "Keep movement history (recommended)",
        ) as HTMLInputElement;
        expect(toggle.checked).toBe(true);
    });

    it("hides the toggle entirely when cascadeLabel is undefined", () => {
        render(
            <BulkDeleteModal
                open
                onClose={vi.fn()}
                items={fiveItems.slice(0, 1)}
                onConfirm={vi.fn().mockResolvedValue(undefined)}
            />,
        );
        expect(screen.queryByTestId("bulk-delete-cascade-label")).toBeNull();
    });

    it("confirm fires onConfirm with the toggle's current value (true when default ON)", async () => {
        const onConfirm = vi.fn().mockResolvedValue(undefined);
        render(
            <BulkDeleteModal
                open
                onClose={vi.fn()}
                items={fiveItems.slice(0, 1)}
                cascadeLabel="Keep movement history (recommended)"
                cascadeDefault
                onConfirm={onConfirm}
            />,
        );
        fireEvent.click(screen.getByTestId("bulk-delete-confirm"));
        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
        expect(onConfirm).toHaveBeenCalledWith(true);
    });

    it("confirm fires onConfirm with false after toggling off", async () => {
        const onConfirm = vi.fn().mockResolvedValue(undefined);
        render(
            <BulkDeleteModal
                open
                onClose={vi.fn()}
                items={fiveItems.slice(0, 1)}
                cascadeLabel="Keep movement history (recommended)"
                cascadeDefault
                onConfirm={onConfirm}
            />,
        );
        fireEvent.click(
            screen.getByLabelText("Keep movement history (recommended)"),
        );
        fireEvent.click(screen.getByTestId("bulk-delete-confirm"));
        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
        expect(onConfirm).toHaveBeenCalledWith(false);
    });

    it("shows the spinner while onConfirm is in flight and disables the button", async () => {
        let resolveOuter: () => void = () => {};
        const pending = new Promise<void>((resolve) => {
            resolveOuter = resolve;
        });
        const onConfirm = vi.fn().mockReturnValue(pending);
        render(
            <BulkDeleteModal
                open
                onClose={vi.fn()}
                items={fiveItems.slice(0, 1)}
                onConfirm={onConfirm}
            />,
        );
        const btn = screen.getByTestId("bulk-delete-confirm") as HTMLButtonElement;
        fireEvent.click(btn);
        await waitFor(() => expect(btn.disabled).toBe(true));
        expect(btn.querySelector(".animate-spin")).not.toBeNull();
        await act(async () => {
            resolveOuter();
            await pending;
        });
    });

    it("cancel button closes without firing onConfirm", () => {
        const onClose = vi.fn();
        const onConfirm = vi.fn();
        render(
            <BulkDeleteModal
                open
                onClose={onClose}
                items={fiveItems.slice(0, 1)}
                onConfirm={onConfirm}
            />,
        );
        fireEvent.click(screen.getByTestId("bulk-delete-cancel"));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("backdrop click closes without firing onConfirm", () => {
        const onClose = vi.fn();
        const onConfirm = vi.fn();
        render(
            <BulkDeleteModal
                open
                onClose={onClose}
                items={fiveItems.slice(0, 1)}
                onConfirm={onConfirm}
            />,
        );
        fireEvent.click(screen.getByTestId("modal-overlay"));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("surfaces the error inline when onConfirm rejects", async () => {
        const onConfirm = vi.fn().mockRejectedValue(new Error("boom"));
        render(
            <BulkDeleteModal
                open
                onClose={vi.fn()}
                items={fiveItems.slice(0, 1)}
                onConfirm={onConfirm}
            />,
        );
        fireEvent.click(screen.getByTestId("bulk-delete-confirm"));
        await waitFor(() =>
            expect(screen.getByTestId("bulk-delete-error").textContent).toBe("boom"),
        );
        const btn = screen.getByTestId("bulk-delete-confirm") as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
    });
});
