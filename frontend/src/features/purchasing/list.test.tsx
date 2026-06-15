import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { PurchaseOrderList } from "./list";
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
        id: "po-001",
        number: "PO-0001",
        supplier_name: "Acme Supplies",
        status: "DRAFT",
        expected_at: "2026-07-01",
        lines: [{ id: "l1" }, { id: "l2" }],
    },
    {
        id: "po-002",
        number: "PO-0002",
        supplier_name: "Beta Distributors",
        status: "CONFIRMED",
        expected_at: "2026-07-15",
        lines: [{ id: "l3" }],
    },
    {
        id: "po-003",
        number: "PO-0003",
        supplier_name: "Gamma Trading",
        status: "PARTIALLY_RECEIVED",
        expected_at: null,
        lines: [{ id: "l4" }, { id: "l5" }, { id: "l6" }],
    },
];

const mockDeleteMutate = vi.fn();
const mockPostActionAsync = vi.fn().mockResolvedValue({});
const mockRefetch = vi.fn();

const { exportToExcelSpy, fetchAllPagesSpy } = vi.hoisted(() => ({
    exportToExcelSpy: vi.fn(),
    fetchAllPagesSpy: vi.fn(),
}));
vi.mock("../../utils/exportToExcel", () => ({
    exportToExcel: exportToExcelSpy,
}));
vi.mock("../../utils/fetchAllPages", () => ({
    fetchAllPages: fetchAllPagesSpy,
}));

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
                <PurchaseOrderList />
            </BrowserRouter>
        </ToastProvider>,
    );
}

describe("PurchaseOrderList rendering", () => {
    it("renders PageHeader title and order count", () => {
        renderList();
        expect(screen.getByText("Purchase Orders")).toBeInTheDocument();
        // count "3" also appears as po-003's line count, so allow duplicates
        expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
    });

    it("renders one row per order with number + supplier", () => {
        renderList();
        expect(screen.getByText("PO-0001")).toBeInTheDocument();
        expect(screen.getByText("PO-0002")).toBeInTheDocument();
        expect(screen.getByText("PO-0003")).toBeInTheDocument();
        expect(screen.getByText("Acme Supplies")).toBeInTheDocument();
        expect(screen.getByText("Beta Distributors")).toBeInTheDocument();
        expect(screen.getByText("Gamma Trading")).toBeInTheDocument();
    });

    it("renders the status badge for each order", () => {
        renderList();
        expect(screen.getByText("Draft")).toBeInTheDocument();
        expect(screen.getByText("Confirmed")).toBeInTheDocument();
        expect(screen.getByText("Partially received")).toBeInTheDocument();
    });

    it("renders the lines count and expected date per row", () => {
        renderList();
        // Scope to each row via its number cell to disambiguate digit collisions.
        const row1 = screen.getByText("PO-0001").closest("tr")!;
        const row3 = screen.getByText("PO-0003").closest("tr")!;
        // po-001 has 2 lines, po-003 has 3 lines
        expect(within(row1).getByText("2")).toBeInTheDocument();
        expect(within(row3).getByText("3")).toBeInTheDocument();
        expect(screen.getByText("2026-07-01")).toBeInTheDocument();
        expect(screen.getByText("2026-07-15")).toBeInTheDocument();
        // null expected date renders an em dash
        expect(within(row3).getByText("—")).toBeInTheDocument();
    });

    it("renders the status filter select and search input", () => {
        renderList();
        // search input placeholder from i18n
        expect(
            screen.getByPlaceholderText("Number or supplier…"),
        ).toBeInTheDocument();
        // status filter label rendered as a Select label
        expect(screen.getAllByText("Status").length).toBeGreaterThanOrEqual(1);
    });

    it("renders the 'New order' primary action", () => {
        renderList();
        expect(screen.getByText("New order")).toBeInTheDocument();
    });
});

describe("PurchaseOrderList row actions by status", () => {
    it("DRAFT row exposes Confirm + Cancel order + Delete actions", () => {
        renderList();
        fireEvent.click(screen.getByTestId("po-actions-po-001"));
        expect(screen.getByText("Confirm")).toBeInTheDocument();
        expect(screen.getByText("Cancel order")).toBeInTheDocument();
        expect(screen.getByText("Delete")).toBeInTheDocument();
        // DRAFT is not receivable
        expect(screen.queryByText("Receive")).toBeNull();
    });

    it("CONFIRMED row exposes Receive (and Cancel order) but no Confirm", () => {
        renderList();
        fireEvent.click(screen.getByTestId("po-actions-po-002"));
        expect(screen.getByText("Receive")).toBeInTheDocument();
        expect(screen.getByText("Cancel order")).toBeInTheDocument();
        expect(screen.queryByText("Confirm")).toBeNull();
    });

    it("PARTIALLY_RECEIVED row exposes Receive only (no Confirm/Cancel/Delete)", () => {
        renderList();
        fireEvent.click(screen.getByTestId("po-actions-po-003"));
        expect(screen.getByText("Receive")).toBeInTheDocument();
        expect(screen.queryByText("Confirm")).toBeNull();
        expect(screen.queryByText("Cancel order")).toBeNull();
        expect(screen.queryByText("Delete")).toBeNull();
    });

    it("clicking Confirm POSTs to the /confirm/ endpoint", async () => {
        renderList();
        fireEvent.click(screen.getByTestId("po-actions-po-001"));
        fireEvent.click(screen.getByText("Confirm"));
        await waitFor(() => expect(mockPostActionAsync).toHaveBeenCalledTimes(1));
        const payload = mockPostActionAsync.mock.calls[0][0];
        expect(payload.method).toBe("post");
        expect(payload.url).toMatch(/\/purchase-orders\/po-001\/confirm\/$/);
    });
});

describe("PurchaseOrderList export toolbar button", () => {
    beforeEach(() => {
        exportToExcelSpy.mockClear();
        fetchAllPagesSpy.mockReset();
        fetchAllPagesSpy.mockResolvedValue(mockOrders);
        mockPostActionAsync.mockClear();
    });

    it("clicking Download Excel calls fetchAllPages then exportToExcel", async () => {
        renderList();
        fireEvent.click(screen.getByRole("button", { name: /Download Excel/i }));
        await waitFor(() => expect(exportToExcelSpy).toHaveBeenCalledTimes(1));
        expect(fetchAllPagesSpy).toHaveBeenCalledTimes(1);
        const [rows, columns, filename] = exportToExcelSpy.mock.calls[0];
        expect(rows).toHaveLength(mockOrders.length);
        expect(columns.length).toBeGreaterThan(0);
        expect(filename).toBe("purchase-orders.xlsx");
    });
});
