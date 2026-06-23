import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { WorkOrderList } from "./list";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { renderWithI18n as render } from "../../../test-utils/i18n-wrapper";

// Mirrors WorkOrderListSerializer: flat `product_model_name`/`product_model_sku`
// (no nested `product_model` object), `updated_at`, and NO `contents_summary`
// (that field is detail-only — the list "Line items" column degrades to "—").
const mockOrders = [
    {
        id: "uuid-wo-001",
        name: "Spring Restock Kit",
        product_model_name: "Widget A",
        product_model_sku: "WA-001",
        status: "OPEN",
        created_at: "2026-04-20T10:30:00Z",
        updated_at: "2026-04-21T08:00:00Z",
    },
    {
        id: "uuid-wo-002",
        name: "Q1 Cleanup Batch",
        product_model_name: "Widget B",
        product_model_sku: "WB-002",
        status: "CLOSED",
        created_at: "2026-04-18T14:00:00Z",
        updated_at: "2026-04-19T16:00:00Z",
    },
    {
        id: "uuid-wo-003",
        name: "Archive Test Order",
        product_model_name: "Widget C",
        product_model_sku: "WC-003",
        status: "ARCHIVED",
        created_at: "2026-03-01T09:00:00Z",
        updated_at: null,
    },
];

const mockListData: { current: { data: typeof mockOrders } } = {
    current: { data: mockOrders },
};
const mockBulkDeleteAsync = vi.fn().mockResolvedValue({});
const mockRefetch = vi.fn();

const { exportToExcelSpy, fetchAllPagesSpy } = vi.hoisted(() => ({
    exportToExcelSpy: vi.fn(),
    fetchAllPagesSpy: vi.fn(),
}));
vi.mock("../../../utils/exportToExcel", () => ({
    exportToExcel: exportToExcelSpy,
}));
vi.mock("../../../utils/fetchAllPages", () => ({
    fetchAllPages: fetchAllPagesSpy,
}));

vi.mock("@refinedev/core", () => ({
    useList: () => ({
        data: { data: mockListData.current.data },
        isLoading: false,
        refetch: mockRefetch,
    }),
    useDelete: () => ({ mutate: vi.fn() }),
    useCustomMutation: () => ({ mutateAsync: mockBulkDeleteAsync }),
    useCustom: () => ({
        data: {
            data: [
                { product_name: "Item A", sku: "SKU-A", quantity: 3 },
                { product_name: "Item B", sku: "SKU-B", quantity: 7 },
            ],
        },
        isLoading: false,
    }),
    useApiUrl: () => "http://localhost:8000/api",
    useNotification: () => ({ open: vi.fn() }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

function renderList() {
    return render(
        <BrowserRouter>
            <WorkOrderList />
        </BrowserRouter>,
    );
}

describe("WorkOrderList", () => {
    beforeEach(() => {
        mockNavigate.mockClear();
    });

    it("renders PageHeader with title and count", () => {
        renderList();
        expect(screen.getByText("Work Orders")).toBeInTheDocument();
        expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("renders table with correct column headers + leading checkbox column", () => {
        renderList();
        const headers = screen.getAllByRole("columnheader");
        const headerTexts = headers.map((h) => h.textContent);
        expect(headerTexts).toContain("Name");
        expect(headerTexts).toContain("Product Model");
        expect(headerTexts).toContain("Status");
        expect(headerTexts).toContain("Line Items");
        expect(headerTexts).toContain("Created");
        expect(headerTexts).toContain("Updated");
        expect(headerTexts).toContain("Actions");
        expect(headers.length).toBe(8);
        expect(screen.getByLabelText("Select all rows")).toBeInTheDocument();
    });

    it("renders work order rows with names", () => {
        renderList();
        expect(screen.getByText("Spring Restock Kit")).toBeInTheDocument();
        expect(screen.getByText("Q1 Cleanup Batch")).toBeInTheDocument();
        expect(screen.getByText("Archive Test Order")).toBeInTheDocument();
    });

    it("displays product model names", () => {
        renderList();
        expect(screen.getByText("Widget A")).toBeInTheDocument();
        expect(screen.getByText("Widget B")).toBeInTheDocument();
        expect(screen.getByText("Widget C")).toBeInTheDocument();
    });

    it("shows status badges", () => {
        renderList();
        // Status values appear both in badges and in filter select options
        expect(screen.getAllByText("OPEN").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("CLOSED").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("ARCHIVED").length).toBeGreaterThanOrEqual(1);
    });

    it("degrades the Line Items column to — (contents_summary is detail-only)", () => {
        // WorkOrderListSerializer does not emit `contents_summary`; the list
        // column reads it but falls back to "—" for every row.
        renderList();
        const dashes = screen.getAllByText("—");
        expect(dashes.length).toBeGreaterThanOrEqual(mockOrders.length);
    });

    it("renders filter bar with name search and status select", () => {
        renderList();
        expect(
            screen.getByPlaceholderText("Search work orders..."),
        ).toBeInTheDocument();
    });

    it("renders create button", () => {
        renderList();
        expect(screen.getByText("New Work Order")).toBeInTheDocument();
    });

    it("expands row to show contents on expand button click", () => {
        renderList();
        // Find expand buttons (Eye icons)
        const expandButtons = screen.getAllByTitle("Expand contents");
        expect(expandButtons.length).toBeGreaterThanOrEqual(1);

        fireEvent.click(expandButtons[0]);

        // After expanding, contents should load
        expect(screen.getByText("Contents Breakdown")).toBeInTheDocument();
        expect(screen.getByText("Item A")).toBeInTheDocument();
        expect(screen.getByText("SKU-A")).toBeInTheDocument();
    });

    it("collapses expanded row on second click", () => {
        renderList();
        const expandButtons = screen.getAllByTitle("Expand contents");
        fireEvent.click(expandButtons[0]);
        expect(screen.getByText("Contents Breakdown")).toBeInTheDocument();

        const collapseButton = screen.getByTitle("Collapse");
        fireEvent.click(collapseButton);
        expect(screen.queryByText("Contents Breakdown")).not.toBeInTheDocument();
    });

    it("shows purpose-clarifying dismissable hint", () => {
        renderList();
        expect(
            screen.getByText(/Work orders group products for operations/),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/They don't move stock automatically/),
        ).toBeInTheDocument();
    });
});

describe("WorkOrderList export toolbar button", () => {
    beforeEach(() => {
        exportToExcelSpy.mockClear();
        fetchAllPagesSpy.mockReset();
        fetchAllPagesSpy.mockResolvedValue(mockOrders);
    });

    it("clicking Download Excel calls exportToExcel with 4 cols + work-orders.xlsx", async () => {
        renderList();
        fireEvent.click(screen.getByRole("button", { name: /Download Excel/i }));
        await waitFor(() => expect(exportToExcelSpy).toHaveBeenCalledTimes(1));
        const [rows, columns, filename] = exportToExcelSpy.mock.calls[0];
        expect(rows).toHaveLength(mockOrders.length);
        expect(columns).toHaveLength(4);
        expect(filename).toBe("work-orders.xlsx");
    });
});

describe("WorkOrderList bulk-delete flow", () => {
    beforeEach(() => {
        mockBulkDeleteAsync.mockClear();
        mockRefetch.mockClear();
    });

    it("selects 2 rows, confirms modal (cascade off), POSTs {ids, cascade: false}", async () => {
        renderList();

        fireEvent.click(screen.getByLabelText("Select Spring Restock Kit"));
        fireEvent.click(screen.getByLabelText("Select Q1 Cleanup Batch"));

        const bar = screen.getByRole("region", { name: /selected/i });
        fireEvent.click(within(bar).getByRole("button", { name: "Delete" }));

        const confirmBtn = await screen.findByTestId("bulk-delete-confirm");
        fireEvent.click(confirmBtn);

        await waitFor(() => expect(mockBulkDeleteAsync).toHaveBeenCalledTimes(1));

        const payload = mockBulkDeleteAsync.mock.calls[0][0];
        expect(payload.method).toBe("post");
        expect(payload.url).toMatch(/\/api\/v1\/work-orders\/bulk-delete\/$/);
        expect(payload.values.cascade).toBe(false);
        expect(payload.values.ids).toHaveLength(2);
        expect(payload.values.ids).toEqual(
            expect.arrayContaining(["uuid-wo-001", "uuid-wo-002"]),
        );

        await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
    });

    it("ticking cascade triggers second confirm; accepting POSTs cascade=true", async () => {
        renderList();

        fireEvent.click(screen.getByLabelText("Select Archive Test Order"));

        const bar = screen.getByRole("region", { name: /selected/i });
        fireEvent.click(within(bar).getByRole("button", { name: "Delete" }));

        const cascadeLabel = await screen.findByTestId("bulk-delete-cascade-label");
        fireEvent.click(within(cascadeLabel).getByRole("checkbox"));

        fireEvent.click(screen.getByTestId("bulk-delete-confirm"));

        const secondConfirm = await screen.findByTestId("confirm-dialog-confirm");
        expect(mockBulkDeleteAsync).not.toHaveBeenCalled();
        fireEvent.click(secondConfirm);

        await waitFor(() => expect(mockBulkDeleteAsync).toHaveBeenCalledTimes(1));
        const payload = mockBulkDeleteAsync.mock.calls[0][0];
        expect(payload.values.cascade).toBe(true);
        expect(payload.values.ids).toEqual(["uuid-wo-003"]);
    });

    it("cancelling the cascade confirm aborts the delete", async () => {
        renderList();

        fireEvent.click(screen.getByLabelText("Select Spring Restock Kit"));

        const bar = screen.getByRole("region", { name: /selected/i });
        fireEvent.click(within(bar).getByRole("button", { name: "Delete" }));

        const cascadeLabel = await screen.findByTestId("bulk-delete-cascade-label");
        fireEvent.click(within(cascadeLabel).getByRole("checkbox"));

        fireEvent.click(screen.getByTestId("bulk-delete-confirm"));

        const cancelBtn = await screen.findByTestId("confirm-dialog-cancel");
        fireEvent.click(cancelBtn);

        await waitFor(() =>
            expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument(),
        );
        expect(mockBulkDeleteAsync).not.toHaveBeenCalled();
    });
});

describe("WorkOrderList empty state", () => {
    beforeEach(() => {
        mockListData.current = { data: [] };
    });

    afterEach(() => {
        mockListData.current = { data: mockOrders };
    });

    it("shows descriptive empty state with use-case help items", () => {
        renderList();

        expect(screen.getByText("No work orders yet")).toBeInTheDocument();
        expect(
            screen.getByText(/Work orders help you plan and track operations/),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Assembly — collect components to build a finished product/),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Kitting — group items into a package or set/),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Fulfillment — prepare items for a customer order/),
        ).toBeInTheDocument();
    });
});
