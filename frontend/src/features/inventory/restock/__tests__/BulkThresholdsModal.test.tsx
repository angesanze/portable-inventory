import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithI18n } from "../../../../test-utils/i18n-wrapper";
import { ToastProvider } from "../../../../components/ui/Toast";
import { BulkThresholdsModal } from "../BulkThresholdsModal";

const productModels = [
    {
        id: "pm-1",
        sku: "SKU-A",
        name: "Alpha",
        reorder_threshold: 10,
        critical_threshold: 5,
        max_threshold: 50,
        reorder_qty: 20,
    },
    {
        id: "pm-2",
        sku: "SKU-B",
        name: "Beta",
        reorder_threshold: null,
        critical_threshold: null,
        max_threshold: null,
        reorder_qty: null,
    },
    {
        id: "pm-3",
        sku: "SKU-C",
        name: "Gamma",
        reorder_threshold: 3,
        critical_threshold: 1,
        max_threshold: 20,
        reorder_qty: 5,
    },
];

const postMock = vi.fn((..._args: unknown[]) =>
    Promise.resolve({ data: { updated: ["pm-1", "pm-3"] } }),
);
const getMock = vi.fn((..._args: unknown[]) =>
    Promise.resolve({
        data: { results: productModels, next: null, count: productModels.length },
    }),
);
vi.mock("../../../../providers/axios-client", () => ({
    axiosInstance: {
        post: (...args: unknown[]) => postMock(...args),
        get: (...args: unknown[]) => getMock(...args),
    },
}));

const renderModal = (props?: Partial<React.ComponentProps<typeof BulkThresholdsModal>>) =>
    renderWithI18n(
        <ToastProvider>
            <BulkThresholdsModal
                isOpen
                onClose={() => {}}
                onSaved={() => {}}
                {...props}
            />
        </ToastProvider>,
    );

describe("BulkThresholdsModal", () => {
    beforeEach(() => {
        postMock.mockClear();
        postMock.mockResolvedValue({ data: { updated: ["pm-1", "pm-3"] } });
        getMock.mockClear();
        getMock.mockResolvedValue({
            data: { results: productModels, next: null, count: productModels.length },
        });
        document.body.innerHTML = "";
    });

    it("renders a row per product with prefilled threshold inputs", async () => {
        renderModal();
        expect(
            screen.getByTestId("bulk-thresholds-modal"),
        ).toBeInTheDocument();
        // Rows arrive after the async page fetch.
        for (const pm of productModels) {
            expect(
                await screen.findByTestId(`bulk-row-${pm.id}`),
            ).toBeInTheDocument();
        }
        expect(getMock).toHaveBeenCalledWith(
            expect.stringMatching(/\/api\/v1\/product-models\/\?page=1&page_size=200$/),
        );
        const reorderA = screen.getByTestId(
            "bulk-reorder_threshold-pm-1",
        ) as HTMLInputElement;
        expect(reorderA.value).toBe("10");
        const reorderB = screen.getByTestId(
            "bulk-reorder_threshold-pm-2",
        ) as HTMLInputElement;
        expect(reorderB.value).toBe("");
    });

    it("save is disabled until something changes", async () => {
        renderModal();
        const save = screen.getByTestId("bulk-thresholds-save");
        expect(save).toBeDisabled();
        expect(
            await screen.findByTestId("bulk-thresholds-nochanges"),
        ).toBeInTheDocument();

        fireEvent.change(await screen.findByTestId("bulk-reorder_threshold-pm-1"), {
            target: { value: "12" },
        });
        expect(save).not.toBeDisabled();
    });

    it("posts only changed rows and changed fields to the bulk endpoint", async () => {
        const onSaved = vi.fn();
        const onClose = vi.fn();
        renderModal({ onSaved, onClose });

        // Change reorder_threshold on pm-1 from 10 → 12
        fireEvent.change(await screen.findByTestId("bulk-reorder_threshold-pm-1"), {
            target: { value: "12" },
        });
        // Fill reorder_threshold on pm-2 from null → 7
        fireEvent.change(screen.getByTestId("bulk-reorder_threshold-pm-2"), {
            target: { value: "7" },
        });
        // pm-3 untouched → must NOT appear in payload

        fireEvent.click(screen.getByTestId("bulk-thresholds-save"));

        await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
        const [url, body] = postMock.mock.calls[0] as [string, unknown];
        expect(url).toContain("/api/v1/restock/thresholds/bulk/");
        expect(body).toEqual([
            { id: "pm-1", reorder_threshold: 12 },
            { id: "pm-2", reorder_threshold: 7 },
        ]);
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("clearing a populated input sends null", async () => {
        renderModal();
        fireEvent.change(await screen.findByTestId("bulk-reorder_qty-pm-1"), {
            target: { value: "" },
        });
        fireEvent.click(screen.getByTestId("bulk-thresholds-save"));

        await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
        const [, body] = postMock.mock.calls[0] as [string, unknown];
        expect(body).toEqual([{ id: "pm-1", reorder_qty: null }]);
    });

    it("flags invalid rows and disables save", async () => {
        renderModal();
        // critical (5) > new reorder (3) on pm-1
        fireEvent.change(await screen.findByTestId("bulk-reorder_threshold-pm-1"), {
            target: { value: "3" },
        });
        const row = screen.getByTestId("bulk-row-pm-1");
        expect(row).toHaveAttribute("data-invalid", "true");
        expect(screen.getByTestId("bulk-thresholds-error")).toBeInTheDocument();
        expect(screen.getByTestId("bulk-thresholds-save")).toBeDisabled();
        expect(postMock).not.toHaveBeenCalled();
    });

    it("search filters rows by SKU and name", async () => {
        renderModal();
        await screen.findByTestId("bulk-row-pm-1");
        const search = screen.getByTestId(
            "bulk-thresholds-search",
        ) as HTMLInputElement;
        fireEvent.change(search, { target: { value: "beta" } });

        expect(screen.queryByTestId("bulk-row-pm-1")).not.toBeInTheDocument();
        expect(screen.getByTestId("bulk-row-pm-2")).toBeInTheDocument();
        expect(screen.queryByTestId("bulk-row-pm-3")).not.toBeInTheDocument();

        fireEvent.change(search, { target: { value: "no-match-xyz" } });
        expect(
            screen.getByTestId("bulk-thresholds-nomatch"),
        ).toBeInTheDocument();
    });

    it("shows error toast and does not close on POST failure", async () => {
        const onClose = vi.fn();
        postMock.mockRejectedValueOnce(new Error("boom"));
        renderModal({ onClose });

        fireEvent.change(await screen.findByTestId("bulk-reorder_threshold-pm-1"), {
            target: { value: "12" },
        });
        fireEvent.click(screen.getByTestId("bulk-thresholds-save"));

        const toast = await screen.findByTestId("toast");
        expect(toast).toHaveTextContent("Could not save thresholds");
        expect(onClose).not.toHaveBeenCalled();
    });

    it("does not query the list while closed", () => {
        // The fetch effect is gated on isOpen, so no GET fires while hidden.
        renderWithI18n(
            <ToastProvider>
                <BulkThresholdsModal isOpen={false} onClose={() => {}} />
            </ToastProvider>,
        );
        expect(
            screen.queryByTestId("bulk-thresholds-modal"),
        ).not.toBeInTheDocument();
        expect(getMock).not.toHaveBeenCalled();
    });

    it("renders empty state when no products exist", async () => {
        getMock.mockResolvedValueOnce({
            data: { results: [], next: null, count: 0 },
        });
        renderModal();
        expect(await screen.findByText("No products yet")).toBeInTheDocument();
    });

    it("close button calls onClose and does not POST", () => {
        const onClose = vi.fn();
        renderModal({ onClose });
        fireEvent.click(screen.getByTestId("bulk-thresholds-cancel"));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(postMock).not.toHaveBeenCalled();
    });

    it("only renders the open button affordance when used via RestockBoard", () => {
        // sanity guard documenting the contract — this component itself does
        // not render the open button; it is the caller's responsibility.
        const { container } = renderModal({ isOpen: false });
        expect(
            within(container).queryByTestId("bulk-thresholds-open"),
        ).not.toBeInTheDocument();
    });
});
