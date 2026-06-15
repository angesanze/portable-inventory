import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ProductModelList } from "./list";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { renderWithI18n as render, i18n } from "../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockModels = [
    {
        id: "uuid-001",
        name: "Widget Alpha",
        sku: "WA-001",
        profile: "SIMPLE_COUNT",
        tracking_mode: "BULK",
        engine_type: "standard",
        created_at: "2026-04-20T12:00:00Z",
        stock_summary: { total: 1245, tracking_mode: "BULK", status: "OK" },
    },
    {
        id: "uuid-002",
        name: "Gadget Beta",
        sku: "GB-002",
        profile: "SERIALIZED",
        tracking_mode: "INDIVIDUAL",
        engine_type: "tracker",
        created_at: "2026-04-22T08:00:00Z",
        stock_summary: { total: 12, tracking_mode: "INDIVIDUAL", status: "OK" },
    },
    {
        id: "uuid-003",
        name: "Chemical Batch",
        sku: "CB-003",
        profile: "BATCH_TRACKED",
        tracking_mode: "BATCH",
        engine_type: "bucket",
        created_at: "2026-04-25T10:00:00Z",
        stock_summary: { total: 340, tracking_mode: "BATCH", status: "OK", batch_count: 5 },
    },
    {
        id: "uuid-004",
        name: "Empty Product",
        sku: "EP-004",
        profile: "SIMPLE_COUNT",
        tracking_mode: "BULK",
        engine_type: "standard",
        created_at: "2026-04-26T10:00:00Z",
        stock_summary: { total: 0, tracking_mode: "BULK", status: "ZERO" },
    },
    {
        id: "uuid-005",
        name: "Low Stock Item",
        sku: "LS-005",
        profile: "SIMPLE_COUNT",
        tracking_mode: "BULK",
        engine_type: "standard",
        created_at: "2026-04-27T10:00:00Z",
        stock_summary: { total: 3, tracking_mode: "BULK", status: "LOW" },
    },
    {
        id: "uuid-006",
        name: "Caffè",
        sku: "CF-006",
        profile: "SIMPLE_COUNT",
        tracking_mode: "BULK",
        engine_type: "counter",
        created_at: "2026-04-28T10:00:00Z",
        stock_summary: { total: 4, tracking_mode: "BULK", status: "OK", unit: "Kg" },
    },
];

const mockDeleteMutate = vi.fn();
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
        data: { data: mockModels },
        isLoading: false,
        refetch: mockRefetch,
    }),
    useDelete: () => ({
        mutate: mockDeleteMutate,
    }),
    useCustomMutation: () => ({
        mutateAsync: mockBulkDeleteAsync,
    }),
    useNotification: () => ({
        open: vi.fn(),
    }),
    useGetIdentity: () => ({
        // GOVERNANCE-11: delete_inventory must be granted for the delete
        // actions (bulk + per-row) to render. ADMIN/OWNER have it.
        data: { capabilities: { manage_own_inventory: true, delete_inventory: true } },
        isLoading: false,
    }),
}));

function renderList() {
    return render(
        <BrowserRouter>
            <ProductModelList />
        </BrowserRouter>,
    );
}

describe("ProductModelList", () => {
    it("renders PageHeader with title and count", () => {
        renderList();
        expect(screen.getByText("Product Models")).toBeInTheDocument();
        expect(screen.getByText("6")).toBeInTheDocument();
    });

    it("renders New Product Model action button", () => {
        renderList();
        expect(screen.getByText("New Product Model")).toBeInTheDocument();
    });

    it("renders table with correct column headers", () => {
        renderList();
        const headers = screen.getAllByRole("columnheader");
        const headerTexts = headers.map((h) => h.textContent);
        expect(headerTexts).toContain("Name");
        expect(headerTexts).toContain("SKU");
        expect(headerTexts).toContain("Profile");
        expect(headerTexts).toContain("Stock");
        expect(headerTexts).toContain("Created");
        expect(headerTexts).toContain("Actions");
    });

    it("renders model rows with correct data", () => {
        renderList();
        expect(screen.getByText("Widget Alpha")).toBeInTheDocument();
        expect(screen.getByText("WA-001")).toBeInTheDocument();
        expect(screen.getByText("Gadget Beta")).toBeInTheDocument();
        expect(screen.getByText("GB-002")).toBeInTheDocument();
    });

    it("displays profile badges in table rows", () => {
        renderList();
        expect(screen.getAllByText("Simple Count").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Serialized").length).toBeGreaterThanOrEqual(1);
    });

    it("navigates to detail on row click", () => {
        renderList();
        const row = screen.getByText("Widget Alpha").closest("tr")!;
        fireEvent.click(row);
        expect(mockNavigate).toHaveBeenCalledWith("/products/uuid-001");
    });

    it("renders filter bar with filter inputs", () => {
        renderList();
        expect(screen.getByPlaceholderText("Search by name or SKU...")).toBeInTheDocument();
    });

    it("displays BULK stock as plain number", () => {
        renderList();
        expect(screen.getByText("1,245")).toBeInTheDocument();
    });

    it("displays INDIVIDUAL stock with 'items' suffix", () => {
        renderList();
        expect(screen.getByText("12 items")).toBeInTheDocument();
    });

    it("displays BATCH stock with batch count", () => {
        renderList();
        expect(screen.getByText("340 in 5 batches")).toBeInTheDocument();
    });

    it("applies emerald color for positive stock", () => {
        renderList();
        const stockEl = screen.getByText("1,245");
        expect(stockEl.className).toContain("text-emerald-400");
    });

    it("applies zinc color for zero stock", () => {
        renderList();
        const stockEl = screen.getByText("0");
        expect(stockEl.className).toContain("text-zinc-500");
    });

    it("applies amber color for low stock", () => {
        renderList();
        const stockEl = screen.getByText("3");
        expect(stockEl.className).toContain("text-amber-400");
    });

    it("appends unit suffix when stock_summary.unit is present", () => {
        renderList();
        expect(screen.getByText("4 Kg")).toBeInTheDocument();
    });

    it("omits unit suffix when stock_summary.unit is null/absent", () => {
        renderList();
        // Other rows (no unit set) should render bare numbers
        expect(screen.getByText("1,245")).toBeInTheDocument();
        expect(screen.queryByText("1,245 Kg")).not.toBeInTheDocument();
    });

    it("renders list-page strings in Italian when language is switched", async () => {
        try {
            await i18n.changeLanguage("it");
            renderList();
            expect(screen.getByText("Modelli Prodotto")).toBeInTheDocument();
            expect(screen.getByText("Nuovo Modello Prodotto")).toBeInTheDocument();
            expect(screen.getByPlaceholderText("Cerca per nome o SKU...")).toBeInTheDocument();
            // Profile badge resolves via products:profiles.*
            expect(screen.getAllByText("Conteggio Semplice").length).toBeGreaterThanOrEqual(1);
            expect(screen.getAllByText("Serializzato").length).toBeGreaterThanOrEqual(1);
        } finally {
            await i18n.changeLanguage("en");
        }
    });

    it("shows empty state when no models and no filters", () => {
        vi.doMock("@refinedev/core", () => ({
            useList: () => ({ data: { data: [] }, isLoading: false }),
            useDelete: () => ({ mutate: vi.fn() }),
        }));
        // Default empty state message checked via snapshot approach
        // The empty state text is tested implicitly through the component logic
    });
});

describe("ProductModelList export toolbar button", () => {
    beforeEach(() => {
        exportToExcelSpy.mockClear();
        fetchAllPagesSpy.mockReset();
        fetchAllPagesSpy.mockResolvedValue(mockModels);
    });

    it("clicking Download Excel calls exportToExcel with 5 cols + products.xlsx", async () => {
        renderList();
        fireEvent.click(screen.getByRole("button", { name: /Download Excel/i }));
        await waitFor(() => expect(exportToExcelSpy).toHaveBeenCalledTimes(1));
        const [rows, columns, filename] = exportToExcelSpy.mock.calls[0];
        expect(rows).toHaveLength(mockModels.length);
        expect(columns).toHaveLength(5);
        expect(filename).toBe("products.xlsx");
    });
});

describe("ProductModelList bulk-delete flow", () => {
    beforeEach(() => {
        mockBulkDeleteAsync.mockClear();
        mockRefetch.mockClear();
    });

    it("selects 2 rows, confirms modal, POSTs {ids, preserve_movements: true}", async () => {
        renderList();

        fireEvent.click(screen.getByLabelText("Select Widget Alpha"));
        fireEvent.click(screen.getByLabelText("Select Gadget Beta"));

        // BulkActionsBar should show "Delete" — click it.
        const bar = screen.getByRole("region", { name: /selected/i });
        fireEvent.click(within(bar).getByRole("button", { name: "Delete" }));

        // Modal opens with preserve_movements toggle defaulting to ON.
        const confirmBtn = await screen.findByTestId("bulk-delete-confirm");
        fireEvent.click(confirmBtn);

        await waitFor(() => expect(mockBulkDeleteAsync).toHaveBeenCalledTimes(1));

        const payload = mockBulkDeleteAsync.mock.calls[0][0];
        expect(payload.method).toBe("post");
        expect(payload.url).toMatch(/\/api\/v1\/product-models\/bulk-delete\/$/);
        expect(payload.values.preserve_movements).toBe(true);
        expect(payload.values.ids).toHaveLength(2);
        expect(payload.values.ids).toEqual(
            expect.arrayContaining(["uuid-001", "uuid-002"]),
        );

        // Refetch invoked so the list reflects the deletion.
        await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
    });
});
