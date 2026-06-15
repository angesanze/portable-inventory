import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { TransferOrderReceive } from "./receive";
import { ToastProvider } from "../../../components/ui/Toast";
import { renderWithI18n as render } from "../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ id: "to-001" }),
    };
});

const mockOrder = {
    id: "to-001",
    number: "TR-2026-0001",
    from_location_name: "Warehouse",
    to_location_name: "Store",
    status: "IN_TRANSIT",
    lines: [
        {
            id: "line-001",
            product_name: "Widget A",
            product_sku: "WID-001",
            quantity_sent: "10",
            quantity_received: "0",
            quantity_shortage: "0",
        },
        {
            id: "line-002",
            product_name: "Widget B",
            product_sku: "WID-002",
            quantity_sent: "5",
            quantity_received: "2",
            quantity_shortage: "0",
        },
    ],
};

const mockPostAction = vi.fn().mockResolvedValue({});
const mockRefetch = vi.fn();
const mockConfirm = vi.fn().mockResolvedValue(true);

vi.mock("@refinedev/core", () => ({
    useOne: () => ({ data: { data: mockOrder }, isLoading: false, refetch: mockRefetch }),
    useCustomMutation: () => ({ mutateAsync: mockPostAction, isLoading: false }),
    useNotification: () => ({ open: vi.fn() }),
}));

vi.mock("../../../components/ui/ConfirmDialog", () => ({
    ConfirmDialog: () => null,
    useConfirmDialog: () => ({ confirm: mockConfirm, dialogProps: {} }),
}));

function renderReceive() {
    return render(
        <ToastProvider>
            <BrowserRouter>
                <TransferOrderReceive />
            </BrowserRouter>
        </ToastProvider>,
    );
}

describe("TransferOrderReceive rendering", () => {
    beforeEach(() => {
        mockPostAction.mockClear();
        mockRefetch.mockClear();
        mockConfirm.mockClear();
    });

    it("renders the transfer header with number, route and status", () => {
        renderReceive();
        expect(screen.getByText("TR-2026-0001")).toBeInTheDocument();
        expect(screen.getByText("Warehouse → Store")).toBeInTheDocument();
        expect(screen.getByText("In transit")).toBeInTheDocument();
    });

    it("renders one card per open line with its in-transit quantity", () => {
        renderReceive();
        expect(screen.getByTestId("receive-line-line-001")).toBeInTheDocument();
        // line-001: sent 10 - received 0 - shortage 0 = 10 in transit
        expect(screen.getByTestId("transit-line-001").textContent).toBe("10");
        // line-002: sent 5 - received 2 = 3 in transit
        expect(screen.getByTestId("transit-line-002").textContent).toBe("3");
    });
});

describe("TransferOrderReceive submit", () => {
    beforeEach(() => {
        mockPostAction.mockClear();
        mockRefetch.mockClear();
        mockConfirm.mockClear();
    });

    it("POSTs only the lines with a quantity entered to /receive/", async () => {
        renderReceive();
        fireEvent.change(screen.getByTestId("qty-line-001"), { target: { value: "6" } });
        fireEvent.click(screen.getByRole("button", { name: "Receive goods" }));

        await waitFor(() => expect(mockPostAction).toHaveBeenCalledTimes(1));
        const payload = mockPostAction.mock.calls[0][0];
        expect(payload.method).toBe("post");
        expect(payload.url).toMatch(/\/transfer-orders\/to-001\/receive\/$/);
        expect(payload.values.receipts).toEqual([{ line_id: "line-001", quantity: "6" }]);
        await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
    });

    it("POSTs the residual to /shortage/ when reporting a shortage", async () => {
        renderReceive();
        fireEvent.click(screen.getByTestId("shortage-line-001"));

        await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
        await waitFor(() => expect(mockPostAction).toHaveBeenCalledTimes(1));
        const payload = mockPostAction.mock.calls[0][0];
        expect(payload.url).toMatch(/\/transfer-orders\/to-001\/shortage\/$/);
        expect(payload.values).toEqual({ line_id: "line-001", quantity: "10" });
    });

    it("does not POST when no quantity has been entered (submit disabled)", () => {
        renderReceive();
        fireEvent.click(screen.getByRole("button", { name: "Receive goods" }));
        expect(mockPostAction).not.toHaveBeenCalled();
    });
});
