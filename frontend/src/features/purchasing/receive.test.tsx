import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { PurchaseOrderReceive } from "./receive";
import { ToastProvider } from "../../components/ui/Toast";
import { renderWithI18n as render } from "../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ id: "po-001" }),
    };
});

const mockPo = {
    id: "po-001",
    number: "PO-0001",
    supplier_name: "Acme Supplies",
    status: "CONFIRMED",
    lines: [
        {
            id: "line-001",
            product_name: "Widget A",
            product_sku: "WID-001",
            product_profile: "STANDARD",
            quantity_ordered: "10",
            quantity_received: "4",
        },
        {
            id: "line-002",
            product_name: "Widget B",
            product_sku: "WID-002",
            product_profile: "STANDARD",
            quantity_ordered: "5",
            quantity_received: "0",
        },
    ],
};

const mockLocations = [
    { id: "loc-001", name: "Main Warehouse", type: "WAREHOUSE" },
];

const mockReceiveAsync = vi.fn().mockResolvedValue({});
const mockRefetch = vi.fn();

vi.mock("@refinedev/core", () => ({
    useOne: () => ({
        data: { data: mockPo },
        isLoading: false,
        refetch: mockRefetch,
    }),
    useList: () => ({
        data: { data: mockLocations },
        isLoading: false,
    }),
    useCustomMutation: () => ({
        mutateAsync: mockReceiveAsync,
        isLoading: false,
    }),
    useNotification: () => ({ open: vi.fn() }),
}));

function renderReceive() {
    return render(
        <ToastProvider>
            <BrowserRouter>
                <PurchaseOrderReceive />
            </BrowserRouter>
        </ToastProvider>,
    );
}

describe("PurchaseOrderReceive rendering", () => {
    beforeEach(() => {
        mockReceiveAsync.mockClear();
        mockRefetch.mockClear();
    });

    it("renders the order header with number, supplier and status badge", () => {
        renderReceive();
        expect(screen.getByText("PO-0001")).toBeInTheDocument();
        expect(screen.getByText("Acme Supplies")).toBeInTheDocument();
        expect(screen.getByText("Confirmed")).toBeInTheDocument();
    });

    it("renders one receivable card per line with pending quantity", () => {
        renderReceive();
        expect(screen.getByTestId("receive-line-line-001")).toBeInTheDocument();
        expect(screen.getByTestId("receive-line-line-002")).toBeInTheDocument();
        // line-001: ordered 10 - received 4 = 6 pending
        expect(screen.getByTestId("pending-line-001").textContent).toBe("6");
        // line-002: ordered 5 - received 0 = 5 pending
        expect(screen.getByTestId("pending-line-002").textContent).toBe("5");
    });

    it("renders a quantity-to-receive input for each line", () => {
        renderReceive();
        expect(screen.getByTestId("qty-line-001")).toBeInTheDocument();
        expect(screen.getByTestId("qty-line-002")).toBeInTheDocument();
    });
});

describe("PurchaseOrderReceive submit", () => {
    beforeEach(() => {
        mockReceiveAsync.mockClear();
        mockRefetch.mockClear();
    });

    it("POSTs only the lines with a quantity entered to /receive/", async () => {
        renderReceive();

        // Only fill line-001; line-002 stays empty and must be excluded.
        const qtyInput = screen.getByTestId("qty-line-001");
        fireEvent.change(qtyInput, { target: { value: "6" } });

        fireEvent.click(screen.getByRole("button", { name: "Receive goods" }));

        await waitFor(() => expect(mockReceiveAsync).toHaveBeenCalledTimes(1));

        const payload = mockReceiveAsync.mock.calls[0][0];
        expect(payload.method).toBe("post");
        expect(payload.url).toMatch(/\/purchase-orders\/po-001\/receive\/$/);
        expect(payload.values.location_id).toBe("loc-001");
        expect(payload.values.receipts).toHaveLength(1);
        expect(payload.values.receipts[0]).toEqual({
            line_id: "line-001",
            quantity: "6",
        });

        await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
    });

    it("includes every line that has a quantity in the payload", async () => {
        renderReceive();

        fireEvent.change(screen.getByTestId("qty-line-001"), {
            target: { value: "3" },
        });
        fireEvent.change(screen.getByTestId("qty-line-002"), {
            target: { value: "5" },
        });

        fireEvent.click(screen.getByRole("button", { name: "Receive goods" }));

        await waitFor(() => expect(mockReceiveAsync).toHaveBeenCalledTimes(1));
        const payload = mockReceiveAsync.mock.calls[0][0];
        expect(payload.values.receipts).toHaveLength(2);
        expect(payload.values.receipts.map((r: { line_id: string }) => r.line_id)).toEqual(
            expect.arrayContaining(["line-001", "line-002"]),
        );
    });

    it("does not POST when no quantity has been entered (submit disabled)", () => {
        renderReceive();
        const submitBtn = screen.getByRole("button", { name: "Receive goods" });
        fireEvent.click(submitBtn);
        expect(mockReceiveAsync).not.toHaveBeenCalled();
    });
});
