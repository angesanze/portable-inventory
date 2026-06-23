import { fireEvent, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { renderWithI18n } from "../../../../test-utils/i18n-wrapper";
import { ToastProvider } from "../../../../components/ui/Toast";
import { RestockBoard } from "../RestockBoard";
import type { BoardResponse, Bucket } from "../types";

// recharts has no layout box in jsdom; stub the pieces ProductCard +
// ProductDrawer use.
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

const buckets: Bucket[] = [
    "HEALTHY",
    "REORDER",
    "CRITICAL",
    "OUT",
    "OVERSTOCK",
];

const makeCard = (bucket: Bucket, idx: number) => ({
    id: `pm-${idx}`,
    sku: `SKU-${bucket}`,
    name: `Product ${bucket}`,
    qty: 10 + idx,
    reorder_threshold: 5,
    max_threshold: 50,
    bucket,
    urgency: idx,
    velocity_7d: 1.5,
    days_to_runout: 7,
    sparkline: [1, 2, 3, 4, 5],
});

const board: BoardResponse = {
    columns: Object.fromEntries(
        buckets.map((b, i) => [b, { count: 1, products: [makeCard(b, i)] }]),
    ) as BoardResponse["columns"],
    totals: { products: 5, needs_attention: 3 },
    generated_at: "2026-05-24T00:00:00Z",
};

const mockRefetch = vi.fn();
const updateMutate = vi.fn();
const identityMock = vi.fn(() => ({
    data: { capabilities: { manage_own_inventory: true, manage_thresholds: true } },
    isLoading: false,
}));

// Stable references prevent the ThresholdsTab useEffect from looping —
// it depends on `pm` identity, which would change every render if we
// allocated a new object inside the mock factory.
const stablePmData = {
    data: {
        id: "pm-0",
        reorder_threshold: 5,
        critical_threshold: 2,
        max_threshold: 50,
        reorder_qty: 10,
    },
};
const stableUseOne = { data: stablePmData, isLoading: false };
const stableUseUpdate = { mutate: updateMutate, isLoading: false };

vi.mock("@refinedev/core", () => ({
    useCustom: () => ({
        data: { data: board },
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
    }),
    useOne: () => stableUseOne,
    useUpdate: () => stableUseUpdate,
    useGetIdentity: () => identityMock(),
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

describe("RestockBoard", () => {
    beforeEach(() => {
        mockRefetch.mockClear();
        updateMutate.mockClear();
        identityMock.mockReturnValue({
            data: { capabilities: { manage_own_inventory: true, manage_thresholds: true } },
            isLoading: false,
        });
    });

    it("renders all five columns with one card each, SKU visible", () => {
        renderBoard();

        // Column headers — default labels from KanbanColumn.bucketDefaultLabel.
        expect(screen.getByText("Healthy")).toBeInTheDocument();
        expect(screen.getByText("Reorder")).toBeInTheDocument();
        expect(screen.getByText("Critical")).toBeInTheDocument();
        expect(screen.getByText("Out of stock")).toBeInTheDocument();
        expect(screen.getByText("Overstock")).toBeInTheDocument();

        // One card per bucket — SKU + product name.
        for (const b of buckets) {
            expect(screen.getByText(`SKU-${b}`)).toBeInTheDocument();
            expect(screen.getByText(`Product ${b}`)).toBeInTheDocument();
        }
    });

    it("renders totals chip and page title", () => {
        renderBoard();
        expect(screen.getByText("Restock Board")).toBeInTheDocument();
        expect(screen.getByText("3/5 need attention")).toBeInTheDocument();
    });

    it("renders an edit-thresholds pencil on every card when user can manage inventory", () => {
        renderBoard();
        expect(screen.getAllByTestId("card-edit-thresholds")).toHaveLength(
            buckets.length,
        );
    });

    it("hides the pencil when manage_own_inventory is false", () => {
        identityMock.mockReturnValue({
            data: { capabilities: { manage_own_inventory: false, manage_thresholds: false } },
            isLoading: false,
        });
        renderBoard();
        expect(
            screen.queryByTestId("card-edit-thresholds"),
        ).not.toBeInTheDocument();
    });

    it("pencil click opens the drawer on the Thresholds tab without firing card-click", () => {
        renderBoard();
        // Pick the HEALTHY card (first bucket → first pencil).
        const healthyCard = screen
            .getByText("Product HEALTHY")
            .closest('[role="button"]') as HTMLElement;
        const pencil = within(healthyCard).getByTestId(
            "card-edit-thresholds",
        );
        fireEvent.click(pencil);

        const drawer = screen.getByTestId("product-drawer");
        const thresholdsTab = within(drawer).getByRole("tab", {
            name: "Thresholds",
        });
        expect(thresholdsTab).toHaveAttribute("aria-selected", "true");
        expect(within(drawer).getByTestId("thresholds-form")).toBeInTheDocument();
    });

    it("clicking the card body (not pencil) opens the drawer on History", () => {
        renderBoard();
        const healthyCard = screen
            .getByText("Product HEALTHY")
            .closest('[role="button"]') as HTMLElement;
        fireEvent.click(healthyCard);

        const drawer = screen.getByTestId("product-drawer");
        const historyTab = within(drawer).getByRole("tab", { name: "History" });
        expect(historyTab).toHaveAttribute("aria-selected", "true");
    });

    it("renders the bulk-thresholds button when manage_thresholds is true", () => {
        renderBoard();
        expect(
            screen.getByTestId("bulk-thresholds-open"),
        ).toBeInTheDocument();
    });

    it("hides the bulk-thresholds button when manage_thresholds is false", () => {
        identityMock.mockReturnValue({
            data: { capabilities: { manage_own_inventory: false, manage_thresholds: false } },
            isLoading: false,
        });
        renderBoard();
        expect(
            screen.queryByTestId("bulk-thresholds-open"),
        ).not.toBeInTheDocument();
    });

    it("clicking the bulk-thresholds button opens the modal", () => {
        renderBoard();
        fireEvent.click(screen.getByTestId("bulk-thresholds-open"));
        expect(
            screen.getByTestId("bulk-thresholds-modal"),
        ).toBeInTheDocument();
    });
});
