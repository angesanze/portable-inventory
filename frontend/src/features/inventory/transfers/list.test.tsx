import { screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { TransferOrderList } from "./list";
import { ToastProvider } from "../../../components/ui/Toast";
import { renderWithI18n as render } from "../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return { ...actual, useNavigate: () => mockNavigate };
});

const TWO_DAYS_AGO = new Date(Date.now() - 2 * 86_400_000).toISOString();

const mockOrders = [
    {
        id: "to-1",
        number: "TR-2026-0001",
        from_location_name: "Warehouse",
        to_location_name: "Store",
        status: "IN_TRANSIT",
        shipped_at: TWO_DAYS_AGO,
        lines: [{ id: "l1" }, { id: "l2" }],
    },
    {
        id: "to-2",
        number: "TR-2026-0002",
        from_location_name: "Store",
        to_location_name: "Warehouse",
        status: "DRAFT",
        shipped_at: null,
        lines: [{ id: "l3" }],
    },
];

const mockInTransit = {
    total: "12",
    by_product: [{ product_id: "p1", sku: "SKU-1", name: "Widget A", quantity: "12" }],
};

vi.mock("@refinedev/core", () => ({
    useList: () => ({
        data: { data: mockOrders },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
    }),
    useCustom: () => ({ data: { data: mockInTransit } }),
    useDelete: () => ({ mutate: vi.fn() }),
    useCustomMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({}) }),
}));

function renderList() {
    return render(
        <ToastProvider>
            <BrowserRouter>
                <TransferOrderList />
            </BrowserRouter>
        </ToastProvider>,
    );
}

describe("TransferOrderList", () => {
    beforeEach(() => mockNavigate.mockClear());

    it("renders one row per transfer with its route", () => {
        renderList();
        expect(screen.getByText("TR-2026-0001")).toBeInTheDocument();
        expect(screen.getByText("TR-2026-0002")).toBeInTheDocument();
        expect(screen.getByText("Warehouse → Store")).toBeInTheDocument();
    });

    it("shows an 'in transit for N days' badge for shipped transfers", () => {
        renderList();
        const badge = screen.getByTestId("transit-days-to-1");
        expect(badge.textContent).toContain("2");
        // DRAFT order has no transit badge
        expect(screen.queryByTestId("transit-days-to-2")).toBeNull();
    });

    it("renders the In Transit widget reading the virtual location", () => {
        renderList();
        const widget = screen.getByTestId("in-transit-widget");
        expect(widget).toBeInTheDocument();
        expect(widget.textContent).toContain("Widget A");
        expect(widget.textContent).toContain("12");
    });
});
