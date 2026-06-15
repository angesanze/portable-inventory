import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { SalesOrderList } from "./list";
import { ToastProvider } from "../../components/ui/Toast";
import { renderWithI18n as render } from "../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockOrders = [
    {
        id: "so-001",
        number: "SO-0001",
        customer_name: "Alpha Retail",
        status: "DRAFT",
        promised_at: "2026-07-01",
        lines: [{ id: "l1" }, { id: "l2" }],
    },
    {
        id: "so-002",
        number: "SO-0002",
        customer_name: "Beta Stores",
        status: "CONFIRMED",
        promised_at: null,
        lines: [{ id: "l3" }],
    },
];

const mockDeleteMutate = vi.fn();
const mockPostActionAsync = vi.fn().mockResolvedValue({});
const mockRefetch = vi.fn();

const { exportToExcelSpy, fetchAllPagesSpy } = vi.hoisted(() => ({
    exportToExcelSpy: vi.fn(),
    fetchAllPagesSpy: vi.fn(),
}));
vi.mock("../../utils/exportToExcel", () => ({ exportToExcel: exportToExcelSpy }));
vi.mock("../../utils/fetchAllPages", () => ({ fetchAllPages: fetchAllPagesSpy }));

vi.mock("@refinedev/core", () => ({
    useList: () => ({
        data: { data: mockOrders },
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
    }),
    useDelete: () => ({ mutate: mockDeleteMutate }),
    useCustomMutation: () => ({ mutateAsync: mockPostActionAsync }),
    useNotification: () => ({ open: vi.fn() }),
}));

function renderList() {
    return render(
        <ToastProvider>
            <BrowserRouter>
                <SalesOrderList />
            </BrowserRouter>
        </ToastProvider>,
    );
}

describe("SalesOrderList rendering", () => {
    beforeEach(() => {
        mockPostActionAsync.mockClear();
        mockRefetch.mockClear();
        exportToExcelSpy.mockClear();
        fetchAllPagesSpy.mockReset();
        fetchAllPagesSpy.mockResolvedValue(mockOrders);
    });

    it("renders title and one row per order with number + customer", () => {
        renderList();
        expect(screen.getByText("Sales Orders")).toBeInTheDocument();
        expect(screen.getByText("SO-0001")).toBeInTheDocument();
        const row = screen.getByText("SO-0002").closest("tr")!;
        expect(within(row).getByText("Beta Stores")).toBeInTheDocument();
    });

    it("DRAFT row navigates to edit, non-DRAFT to the order view", () => {
        renderList();
        fireEvent.click(screen.getByText("SO-0001").closest("tr")!);
        expect(mockNavigate).toHaveBeenCalledWith("/sales/edit/so-001");
        fireEvent.click(screen.getByText("SO-0002").closest("tr")!);
        expect(mockNavigate).toHaveBeenCalledWith("/sales/so-002");
    });

    it("clicking Download Excel exports sales-orders.xlsx", async () => {
        renderList();
        fireEvent.click(screen.getByRole("button", { name: /Download Excel/i }));
        await waitFor(() => expect(exportToExcelSpy).toHaveBeenCalledTimes(1));
        const [, , filename] = exportToExcelSpy.mock.calls[0];
        expect(filename).toBe("sales-orders.xlsx");
    });
});

describe("SalesOrderList cancel action", () => {
    beforeEach(() => {
        mockPostActionAsync.mockClear();
        mockRefetch.mockClear();
    });

    it("a CONFIRMED row can be cancelled, POSTing to /cancel/", async () => {
        renderList();
        fireEvent.click(screen.getByTestId("so-actions-so-002"));
        fireEvent.click(screen.getByText("Cancel order"));
        // ConfirmDialog
        const confirmBtn = await screen.findByRole("button", { name: "Cancel order" });
        fireEvent.click(confirmBtn);
        await waitFor(() => expect(mockPostActionAsync).toHaveBeenCalledTimes(1));
        const payload = mockPostActionAsync.mock.calls[0][0];
        expect(payload.url).toMatch(/\/sales-orders\/so-002\/cancel\/$/);
    });
});
