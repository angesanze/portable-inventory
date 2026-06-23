import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { renderWithI18n } from "../../../../test-utils/i18n-wrapper";
import { ToastProvider } from "../../../../components/ui/Toast";
import { RestockBoard } from "../RestockBoard";
import type { BoardResponse } from "../types";

// recharts has no layout in jsdom; passthrough every primitive the board,
// card sparklines and drawer history chart touch.
vi.mock("recharts", () => {
    const passthrough = ({ children }: { children?: React.ReactNode }) => (
        <div>{children}</div>
    );
    return {
        ResponsiveContainer: passthrough,
        LineChart: passthrough,
        ComposedChart: passthrough,
        Line: () => <div />,
        CartesianGrid: () => <div />,
        XAxis: () => <div />,
        YAxis: () => <div />,
        Tooltip: () => <div />,
        Area: () => <div />,
        Bar: () => <div />,
        ReferenceLine: () => <div />,
    };
});

// Board fixture: 1 CRITICAL with two cards sorted urgency desc, plus one card
// in each of the other buckets so the board renders all five columns. The
// integration flow targets the first CRITICAL card (highest urgency).
const board: BoardResponse = {
    columns: {
        HEALTHY: {
            count: 1,
            products: [
                {
                    id: "pm-healthy",
                    sku: "SKU-H",
                    name: "Healthy widget",
                    qty: 40,
                    reorder_threshold: 10,
                    max_threshold: 60,
                    bucket: "HEALTHY",
                    urgency: 0.1,
                    velocity_7d: 0.5,
                    days_to_runout: null,
                    sparkline: [42, 41, 40, 40, 40],
                },
            ],
        },
        REORDER: {
            count: 1,
            products: [
                {
                    id: "pm-reorder",
                    sku: "SKU-R",
                    name: "Reorder widget",
                    qty: 8,
                    reorder_threshold: 10,
                    max_threshold: 60,
                    bucket: "REORDER",
                    urgency: 0.5,
                    velocity_7d: 1.0,
                    days_to_runout: 8,
                    sparkline: [12, 11, 10, 9, 8],
                },
            ],
        },
        CRITICAL: {
            count: 2,
            products: [
                {
                    id: "pm-crit-1",
                    sku: "SKU-C1",
                    name: "Critical alpha",
                    qty: 2,
                    reorder_threshold: 10,
                    max_threshold: 60,
                    bucket: "CRITICAL",
                    urgency: 0.95,
                    velocity_7d: 2.5,
                    days_to_runout: 1,
                    sparkline: [12, 9, 6, 4, 2],
                },
                {
                    id: "pm-crit-2",
                    sku: "SKU-C2",
                    name: "Critical beta",
                    qty: 3,
                    reorder_threshold: 10,
                    max_threshold: 60,
                    bucket: "CRITICAL",
                    urgency: 0.8,
                    velocity_7d: 2.0,
                    days_to_runout: 2,
                    sparkline: [10, 8, 6, 5, 3],
                },
            ],
        },
        OUT: {
            count: 1,
            products: [
                {
                    id: "pm-out",
                    sku: "SKU-O",
                    name: "Out widget",
                    qty: 0,
                    reorder_threshold: 5,
                    max_threshold: 30,
                    bucket: "OUT",
                    urgency: 1.0,
                    velocity_7d: 1.0,
                    days_to_runout: 0,
                    sparkline: [3, 2, 1, 0, 0],
                },
            ],
        },
        OVERSTOCK: {
            count: 1,
            products: [
                {
                    id: "pm-over",
                    sku: "SKU-OV",
                    name: "Overstock widget",
                    qty: 120,
                    reorder_threshold: 10,
                    max_threshold: 60,
                    bucket: "OVERSTOCK",
                    urgency: 0.0,
                    velocity_7d: 0.1,
                    days_to_runout: null,
                    sparkline: [118, 119, 120, 120, 120],
                },
            ],
        },
    },
    totals: { products: 6, needs_attention: 4 },
    generated_at: "2026-05-24T00:00:00Z",
};

// Stable ProductModel record for the targeted CRITICAL card. The Thresholds
// tab fetches this via useOne to prefill the form.
const pmRecord = {
    id: "pm-crit-1",
    reorder_threshold: 10,
    critical_threshold: 4,
    max_threshold: 60,
    reorder_qty: 25,
};

const mockRefetch = vi.fn();
const updateMutate = vi.fn(
    (_args: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
        opts?.onSuccess?.({ data: {} });
    },
);

// useCustom is called by both useRestockBoard ("/restock/board/") and
// useProductSeries ("/products/<id>/stock-series/"). Route by URL so each
// hook gets its own payload — board endpoint mocked exactly once.
const boardSpy = vi.fn();
const seriesSpy = vi.fn();

vi.mock("@refinedev/core", () => ({
    useCustom: (args: { url: string }) => {
        if (args.url.endsWith("/restock/board/")) {
            boardSpy(args.url);
            return {
                data: { data: board },
                isLoading: false,
                isError: false,
                refetch: mockRefetch,
            };
        }
        seriesSpy(args.url);
        return {
            data: {
                data: {
                    product_id: "pm-crit-1",
                    days: 90,
                    series: [],
                    velocity: { "7d": 2.5, "30d": 1.8, "90d": 1.2 },
                    projection: {
                        current_qty: 2,
                        daily_burn: 2.5,
                        days_to_reorder: 0,
                        days_to_critical: 0,
                        days_to_out: 1,
                        suggested_reorder_qty: 30,
                    },
                },
            },
            isLoading: false,
            isError: false,
        };
    },
    useOne: () => ({ data: { data: pmRecord }, isLoading: false }),
    useUpdate: () => ({ mutate: updateMutate, isLoading: false }),
    useGetIdentity: () => ({
        data: { capabilities: { manage_own_inventory: true } },
        isLoading: false,
    }),
    useList: () => ({ data: { data: [] }, isLoading: false }),
}));

const renderBoard = () =>
    renderWithI18n(
        <MemoryRouter>
            <ToastProvider>
                <RestockBoard />
            </ToastProvider>
        </MemoryRouter>,
    );

describe("RestockBoard integration — card → drawer → threshold PATCH", () => {
    beforeEach(() => {
        mockRefetch.mockClear();
        updateMutate.mockClear();
        boardSpy.mockClear();
        seriesSpy.mockClear();
        document.body.innerHTML = "";
    });

    it("opens drawer for the first CRITICAL card, edits a threshold, fires PATCH-equivalent mutate, and refetches the board", async () => {
        renderBoard();

        // Board endpoint hit exactly once on mount.
        expect(boardSpy).toHaveBeenCalledTimes(1);

        // First CRITICAL card by urgency desc is pm-crit-1 (urgency 0.95).
        const firstCritical = screen
            .getByText("Critical alpha")
            .closest('[role="button"]') as HTMLElement;
        expect(firstCritical).not.toBeNull();
        fireEvent.click(firstCritical);

        // Drawer mounted on default History tab; verify it's the right product.
        const drawer = await screen.findByTestId("product-drawer");
        expect(within(drawer).getByText("SKU-C1")).toBeInTheDocument();
        expect(within(drawer).getByText("Critical alpha")).toBeInTheDocument();

        // Switch to Thresholds tab.
        const thresholdsTab = within(drawer).getByRole("tab", {
            name: "Thresholds",
        });
        fireEvent.click(thresholdsTab);
        expect(thresholdsTab).toHaveAttribute("aria-selected", "true");

        // Form prefills from useOne payload — wait for the effect to settle.
        const reorder = within(drawer).getByTestId(
            "threshold-reorder",
        ) as HTMLInputElement;
        await waitFor(() => expect(reorder.value).toBe("10"));

        // Edit reorder_threshold 10 → 18 and submit.
        fireEvent.change(reorder, { target: { value: "18" } });
        fireEvent.click(within(drawer).getByTestId("threshold-save"));

        // useUpdate.mutate is what refine's safe-data-provider turns into
        // PATCH /api/v1/product-models/<id>/. Assert the equivalent args.
        expect(updateMutate).toHaveBeenCalledTimes(1);
        const [args] = updateMutate.mock.calls[0];
        expect(args).toEqual({
            resource: "product-models",
            id: "pm-crit-1",
            values: {
                reorder_threshold: 18,
                critical_threshold: 4,
                max_threshold: 60,
                reorder_qty: 25,
            },
        });

        // onSuccess fires onSaved → RestockBoard refetches the board.
        await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    });
});
