import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { PhysicalProductList } from "./list";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

// Mock data for products-poly (All Products tab)
const mockProductsPoly = [
    {
        id: "pm-001",
        name: "Widget Alpha",
        sku: "WA-001",
        profile: "SERIALIZED",
        engine_type: "tracker",
        tracking_mode: "INDIVIDUAL",
        stock_value: [{ id: "i1", identifier: "SN-001", qty: 1, location: "Main Warehouse" }],
        stock_total: 1,
        stock_breakdown: { "Main Warehouse": 1 },
    },
    {
        id: "pm-002",
        name: "Bulk Screws",
        sku: "BS-002",
        profile: "SIMPLE_COUNT",
        engine_type: "counter",
        tracking_mode: "BULK",
        stock_value: 500,
        stock_total: 500,
        stock_breakdown: { "Main Warehouse": 300, "Store Front": 200 },
    },
    {
        id: "pm-003",
        name: "Chemical Batch",
        sku: "CB-003",
        profile: "BATCH_TRACKED",
        engine_type: "bucket",
        tracking_mode: "BATCH",
        stock_value: [{ id: "b1", batch_identifier: "LOT-001", qty: 100, location: "Main Warehouse" }],
        stock_total: 100,
        stock_breakdown: { "Main Warehouse": 100 },
    },
    {
        id: "pm-004",
        name: "Caffè",
        sku: "CF-004",
        profile: "SIMPLE_COUNT",
        engine_type: "counter",
        tracking_mode: "BULK",
        stock_value: 4,
        stock_total: 4,
        stock_breakdown: { "Main Warehouse": 4 },
        unit: "Kg",
    },
];

// Mock data for physical-products (Individual Items tab)
const mockPhysicalProducts = [
    {
        id: "uuid-stock-001",
        identifier: "SN-12345",
        product_model: "pm-001",
        product_model_name: "Widget Alpha",
        status: "ACTIVE",
        location: "loc-001",
        location_name: "Main Warehouse",
        updated_at: "2026-04-20T12:00:00Z",
    },
    {
        id: "uuid-stock-002",
        identifier: "SN-67890",
        product_model: "pm-002",
        product_model_name: "Gadget Beta",
        status: "IN_USE",
        location: "loc-002",
        location_name: "Store Front",
        batch_identifier: "BATCH-001",
        quantity: 50,
        updated_at: "2026-04-22T08:00:00Z",
    },
];

const mockDeleteMutate = vi.fn();
const mockBulkDeleteAsync = vi.fn().mockResolvedValue({});
const mockPhysicalProductsRefetch = vi.fn();

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
    useList: ({ resource }: { resource: string }) => {
        if (resource === "products-poly") {
            return {
                data: { data: mockProductsPoly },
                isLoading: false,
                isError: false,
                refetch: vi.fn(),
            };
        }
        if (resource === "physical-products") {
            return {
                data: { data: mockPhysicalProducts },
                isLoading: false,
                isError: false,
                refetch: mockPhysicalProductsRefetch,
            };
        }
        // product-models check
        return {
            data: { data: [{ id: "pm-001" }] },
            isLoading: false,
        };
    },
    useDelete: () => ({
        mutate: mockDeleteMutate,
    }),
    useCustom: () => ({
        data: null,
        isLoading: false,
    }),
    useCustomMutation: () => ({
        mutateAsync: mockBulkDeleteAsync,
    }),
    useApiUrl: () => "http://localhost:8000/api/v1",
    useNotification: () => ({
        open: vi.fn(),
    }),
}));

function renderList() {
    return render(
        <BrowserRouter>
            <PhysicalProductList />
        </BrowserRouter>,
    );
}

describe("PhysicalProductList", () => {
    it("renders PageHeader with title", () => {
        renderList();
        expect(screen.getByText("Inventory")).toBeInTheDocument();
    });

    it("renders Register Item action button", () => {
        renderList();
        expect(screen.getByText("Register Item")).toBeInTheDocument();
    });

    it("renders tab switcher with All Products and Individual Items", () => {
        renderList();
        expect(screen.getByText("All Products")).toBeInTheDocument();
        expect(screen.getByText("Individual Items")).toBeInTheDocument();
    });

    it("defaults to All Products tab", () => {
        renderList();
        // All Products tab should show product names from products-poly
        expect(screen.getByText("Widget Alpha")).toBeInTheDocument();
        expect(screen.getByText("Bulk Screws")).toBeInTheDocument();
        expect(screen.getByText("Chemical Batch")).toBeInTheDocument();
    });

    it("shows KPI cards on All Products tab", () => {
        renderList();
        expect(screen.getByText("Products in Stock")).toBeInTheDocument();
        expect(screen.getByText("Active Locations")).toBeInTheDocument();
        expect(screen.getByText("Zero Stock")).toBeInTheDocument();
    });

    it("shows KPI values computed from product data", () => {
        renderList();
        // 4 products all with stock > 0
        expect(screen.getByText("4")).toBeInTheDocument();
        // 2 locations: Main Warehouse, Store Front
        expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("shows profile badges in All Products tab", () => {
        renderList();
        // Profile labels appear in both badges and filter dropdown options
        expect(screen.getAllByText("Serialized / Individual").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Simple Count").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Batch / Lot Tracked").length).toBeGreaterThanOrEqual(1);
    });

    it("shows stock totals with tracking-mode-appropriate format", () => {
        renderList();
        expect(screen.getByText("1 item")).toBeInTheDocument();
        expect(screen.getByText("500")).toBeInTheDocument();
        expect(screen.getByText("100 in 1 batch")).toBeInTheDocument();
    });

    it("appends unit suffix when row.unit is present", () => {
        renderList();
        expect(screen.getByText("4 Kg")).toBeInTheDocument();
    });

    it("omits unit suffix when row.unit is null/absent", () => {
        renderList();
        // Bulk Screws row (no unit) should still be bare number
        expect(screen.getByText("500")).toBeInTheDocument();
        expect(screen.queryByText("500 Kg")).not.toBeInTheDocument();
    });

    it("shows primary location for products", () => {
        renderList();
        // Main Warehouse appears in multiple rows
        const warehouses = screen.getAllByText("Main Warehouse");
        expect(warehouses.length).toBeGreaterThanOrEqual(1);
    });

    it("shows stock status indicators", () => {
        renderList();
        const inStockLabels = screen.getAllByText("In stock");
        expect(inStockLabels.length).toBe(4);
    });

    it("expands row to show location breakdown on toggle click", () => {
        renderList();
        const expandButtons = screen.getAllByLabelText("Expand locations");
        // Click first expand button
        fireEvent.click(expandButtons[0]);
        expect(screen.getByText("Per-Location Breakdown")).toBeInTheDocument();
    });

    it("navigates to product detail on row click", () => {
        renderList();
        const row = screen.getByText("Widget Alpha").closest("tr")!;
        fireEvent.click(row);
        expect(mockNavigate).toHaveBeenCalledWith("/products/pm-001");
    });

    it("switches to Individual Items tab", () => {
        renderList();
        fireEvent.click(screen.getByText("Individual Items"));
        // Should show individual item data
        expect(screen.getByText("SN-12345")).toBeInTheDocument();
        expect(screen.getByText("SN-67890")).toBeInTheDocument();
    });

    it("renders Individual Items tab with correct columns", () => {
        renderList();
        fireEvent.click(screen.getByText("Individual Items"));
        const headers = screen.getAllByRole("columnheader");
        const headerTexts = headers.map((h) => h.textContent);
        expect(headerTexts).toContain("Identifier / Name");
        expect(headerTexts).toContain("Product Model");
        expect(headerTexts).toContain("Status");
        expect(headerTexts).toContain("Location");
        expect(headerTexts).toContain("Batch");
        expect(headerTexts).toContain("Updated");
        expect(headerTexts).toContain("Actions");
    });

    it("navigates to stock detail on individual item row click", () => {
        renderList();
        fireEvent.click(screen.getByText("Individual Items"));
        mockNavigate.mockClear();
        const row = screen.getByText("SN-12345").closest("tr")!;
        fireEvent.click(row);
        expect(mockNavigate).toHaveBeenCalledWith("/stock/uuid-stock-001");
    });

    it("renders filter bar on All Products tab", () => {
        renderList();
        expect(screen.getByPlaceholderText("Search by name or SKU...")).toBeInTheDocument();
    });

    it("renders filter bar on Individual Items tab", () => {
        renderList();
        fireEvent.click(screen.getByText("Individual Items"));
        expect(screen.getByPlaceholderText("Search by identifier...")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Filter by product...")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Filter by location...")).toBeInTheDocument();
    });
});

describe("PhysicalProductList export toolbar button", () => {
    beforeEach(() => {
        exportToExcelSpy.mockClear();
        fetchAllPagesSpy.mockReset();
        fetchAllPagesSpy.mockResolvedValue(mockPhysicalProducts);
    });

    it("clicking Download Excel on Individual Items tab calls exportToExcel with 5 cols + stock.xlsx", async () => {
        renderList();
        fireEvent.click(screen.getByText("Individual Items"));
        fireEvent.click(screen.getByRole("button", { name: /Download Excel/i }));
        await waitFor(() => expect(exportToExcelSpy).toHaveBeenCalledTimes(1));
        const [rows, columns, filename] = exportToExcelSpy.mock.calls[0];
        expect(rows).toHaveLength(mockPhysicalProducts.length);
        expect(columns).toHaveLength(5);
        expect(filename).toBe("stock.xlsx");
    });
});

describe("PhysicalProductList bulk-delete flow", () => {
    beforeEach(() => {
        mockBulkDeleteAsync.mockClear();
        mockPhysicalProductsRefetch.mockClear();
    });

    it("selects 2 rows on Individual Items tab, confirms modal, POSTs {ids, preserve_movements: true}", async () => {
        renderList();
        fireEvent.click(screen.getByText("Individual Items"));

        fireEvent.click(screen.getByLabelText("Select SN-12345"));
        fireEvent.click(screen.getByLabelText("Select SN-67890"));

        const bar = screen.getByRole("region", { name: /selected/i });
        fireEvent.click(within(bar).getByRole("button", { name: "Delete" }));

        const confirmBtn = await screen.findByTestId("bulk-delete-confirm");
        fireEvent.click(confirmBtn);

        await waitFor(() => expect(mockBulkDeleteAsync).toHaveBeenCalledTimes(1));

        const payload = mockBulkDeleteAsync.mock.calls[0][0];
        expect(payload.method).toBe("post");
        expect(payload.url).toMatch(/\/api\/v1\/physical-products\/bulk-delete\/$/);
        expect(payload.values.preserve_movements).toBe(true);
        expect(payload.values.ids).toHaveLength(2);
        expect(payload.values.ids).toEqual(
            expect.arrayContaining(["uuid-stock-001", "uuid-stock-002"]),
        );

        await waitFor(() => expect(mockPhysicalProductsRefetch).toHaveBeenCalled());
    });
});
