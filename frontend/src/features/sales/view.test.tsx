import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { SalesOrderView } from "./view";
import { ToastProvider } from "../../components/ui/Toast";
import { renderWithI18n as render } from "../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ id: "so-001" }),
    };
});

const mockSo = {
    id: "so-001",
    number: "SO-0001",
    customer_name: "Alpha Retail",
    status: "CONFIRMED",
    lines: [
        {
            id: "line-001",
            product_name: "Widget A",
            product_sku: "WID-001",
            product_profile: "SIMPLE_COUNT",
            quantity_ordered: "8",
            quantity_shipped: "0",
        },
    ],
};

const mockPick = {
    number: "SO-0001",
    status: "CONFIRMED",
    lines: [
        {
            line_id: "line-001",
            product_sku: "WID-001",
            product_name: "Widget A",
            product_profile: "SIMPLE_COUNT",
            quantity_ordered: "8",
            quantity_shipped: "0",
            quantity_pending: "8",
            reserved: "8.0000",
            serials: [],
            batches: [],
        },
    ],
};

const mockLocations = [{ id: "loc-001", name: "Main Warehouse", type: "WAREHOUSE" }];

const mockActionAsync = vi.fn().mockResolvedValue({});
const mockRefetch = vi.fn();
const mockRefetchPick = vi.fn();

vi.mock("@refinedev/core", () => ({
    useOne: () => ({ data: { data: mockSo }, isLoading: false, refetch: mockRefetch }),
    useList: () => ({ data: { data: mockLocations }, isLoading: false }),
    useCustom: () => ({ data: { data: mockPick }, refetch: mockRefetchPick }),
    useCustomMutation: () => ({ mutateAsync: mockActionAsync, isLoading: false }),
    useNotification: () => ({ open: vi.fn() }),
}));

function renderView() {
    return render(
        <ToastProvider>
            <BrowserRouter>
                <SalesOrderView />
            </BrowserRouter>
        </ToastProvider>,
    );
}

describe("SalesOrderView", () => {
    beforeEach(() => {
        mockActionAsync.mockClear();
        mockRefetch.mockClear();
        mockRefetchPick.mockClear();
    });

    it("renders the order header and per-line ordered/reserved/shipped state", () => {
        renderView();
        expect(screen.getByText("SO-0001")).toBeInTheDocument();
        expect(screen.getByText("Alpha Retail")).toBeInTheDocument();
        // reserved 8 from the pick list
        expect(screen.getByTestId("reserved-line-001").textContent).toBe("8");
        expect(screen.getByTestId("shipped-line-001").textContent).toBe("0");
    });

    it("ship panel POSTs only lines with a quantity to /ship/", async () => {
        renderView();
        fireEvent.change(screen.getByTestId("qty-line-001"), { target: { value: "5" } });
        fireEvent.click(screen.getByTestId("ship-button"));
        await waitFor(() => expect(mockActionAsync).toHaveBeenCalledTimes(1));
        const payload = mockActionAsync.mock.calls[0][0];
        expect(payload.method).toBe("post");
        expect(payload.url).toMatch(/\/sales-orders\/so-001\/ship\/$/);
        expect(payload.values.shipments).toHaveLength(1);
        expect(payload.values.shipments[0]).toEqual({
            line_id: "line-001",
            quantity: "5",
        });
        await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
    });

    it("does not POST when no quantity entered (ship disabled)", () => {
        renderView();
        fireEvent.click(screen.getByTestId("ship-button"));
        expect(mockActionAsync).not.toHaveBeenCalled();
    });

    it("switches to the printable pick-list tab", () => {
        renderView();
        fireEvent.click(screen.getByTestId("tab-pick"));
        expect(screen.getByTestId("pick-line-line-001")).toBeInTheDocument();
    });
});
