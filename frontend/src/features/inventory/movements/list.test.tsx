import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MovementList } from "./list";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { renderWithI18n as render } from "../../../test-utils/i18n-wrapper";

const mockMovements = [
    {
        id: "uuid-mov-001",
        product_name: "Widget A",
        product_model: { name: "Widget A", sku: "WID-001" },
        sku: "WID-001",
        from_location: { name: "External Vendor", type: "VIRTUAL" },
        to_location: { name: "Main Warehouse", type: "WAREHOUSE" },
        quantity: 50,
        occurred_at: "2026-04-20T10:30:00Z",
        performed_by: { username: "alice" },
    },
    {
        id: "uuid-mov-002",
        product_name: "Widget B",
        product_model: { name: "Widget B", sku: "WID-002" },
        sku: "WID-002",
        from_location: { name: "Main Warehouse", type: "WAREHOUSE" },
        to_location: { name: "Store Front", type: "STORE" },
        quantity: -10,
        occurred_at: "2026-04-21T14:00:00Z",
        performed_by: { username: "bob" },
    },
    {
        id: "uuid-mov-003",
        product_name: "Widget C",
        product_model: { name: "Widget C", sku: "WID-003" },
        sku: "WID-003",
        from_location: { name: "Warehouse A", type: "WAREHOUSE" },
        to_location: { name: "Warehouse B", type: "WAREHOUSE" },
        quantity: 5,
        occurred_at: "2026-04-22T09:00:00Z",
        performed_by: null,
    },
];

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
        data: { data: mockMovements },
        isLoading: false,
        refetch: mockRefetch,
    }),
    useCustomMutation: () => ({ mutateAsync: mockBulkDeleteAsync }),
    useNotification: () => ({ open: vi.fn() }),
}));

function renderList() {
    return render(
        <BrowserRouter>
            <MovementList />
        </BrowserRouter>,
    );
}

describe("MovementList rendering", () => {
    it("renders PageHeader with title and count", () => {
        renderList();
        expect(screen.getByText("Movement Log")).toBeInTheDocument();
        expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("renders subtitle describing audit trail", () => {
        renderList();
        expect(
            screen.getByText("Record stock receipts, shipments, and transfers"),
        ).toBeInTheDocument();
    });

    it("renders table with correct column headers + leading checkbox column", () => {
        renderList();
        const headers = screen.getAllByRole("columnheader");
        const headerTexts = headers.map((h) => h.textContent);
        expect(headerTexts).toContain("Timestamp");
        expect(headerTexts).toContain("Product");
        expect(headerTexts).toContain("Direction");
        expect(headerTexts).toContain("Quantity");
        expect(headerTexts).toContain("From Location");
        expect(headerTexts).toContain("To Location");
        expect(headerTexts).toContain("User");
        // 8 cols total: checkbox + 7 data columns
        expect(headers.length).toBe(8);
        expect(screen.getByLabelText("Select all rows")).toBeInTheDocument();
    });

    it("renders movement rows with product info", () => {
        renderList();
        expect(screen.getByText("Widget A")).toBeInTheDocument();
        expect(screen.getByText("Widget B")).toBeInTheDocument();
        expect(screen.getByText("Widget C")).toBeInTheDocument();
    });

    it("displays SKU in mono text", () => {
        renderList();
        expect(screen.getByText("WID-001")).toBeInTheDocument();
        expect(screen.getByText("WID-002")).toBeInTheDocument();
    });

    it("shows direction badges", () => {
        renderList();
        // Mock data: A is INBOUND (VIRTUAL→WAREHOUSE), B+C are TRANSFER.
        expect(screen.getAllByText("Inbound").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Transfer").length).toBeGreaterThanOrEqual(1);
    });

    it("shows location names", () => {
        renderList();
        expect(screen.getByText("External Vendor")).toBeInTheDocument();
        expect(screen.getAllByText("Main Warehouse").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("Store Front")).toBeInTheDocument();
    });

    it("shows user names and dash for missing user", () => {
        renderList();
        expect(screen.getByText("alice")).toBeInTheDocument();
        expect(screen.getByText("bob")).toBeInTheDocument();
        expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("renders filter bar with product search and direction select", () => {
        renderList();
        expect(
            screen.getByPlaceholderText("Search by product or SKU..."),
        ).toBeInTheDocument();
    });

    it("renders 'New Movement' primary action button", () => {
        renderList();
        expect(screen.getByText("New Movement")).toBeInTheDocument();
    });

    it("renders 'Shortcuts' dropdown trigger", () => {
        renderList();
        expect(screen.getByText("Shortcuts")).toBeInTheDocument();
    });

    it("shows shortcut options when dropdown clicked", () => {
        renderList();
        fireEvent.click(screen.getByText("Shortcuts"));
        expect(screen.getByText("Receive Stock")).toBeInTheDocument();
        expect(screen.getByText("Ship Out")).toBeInTheDocument();
        const transferItems = screen.getAllByText("Transfer");
        expect(transferItems.length).toBeGreaterThanOrEqual(2);
    });
});

describe("MovementList export toolbar button", () => {
    beforeEach(() => {
        exportToExcelSpy.mockClear();
        fetchAllPagesSpy.mockReset();
        fetchAllPagesSpy.mockResolvedValue(mockMovements);
    });

    it("clicking Download Excel calls exportToExcel with 6 cols + movements.xlsx", async () => {
        renderList();
        fireEvent.click(screen.getByRole("button", { name: /Download Excel/i }));
        await waitFor(() => expect(exportToExcelSpy).toHaveBeenCalledTimes(1));
        const [rows, columns, filename] = exportToExcelSpy.mock.calls[0];
        expect(rows).toHaveLength(mockMovements.length);
        expect(columns).toHaveLength(6);
        expect(filename).toBe("movements.xlsx");
    });
});

describe("MovementList bulk-delete flow", () => {
    beforeEach(() => {
        mockBulkDeleteAsync.mockClear();
        mockRefetch.mockClear();
    });

    it("selecting rows reveals 'Delete N movements' action label", () => {
        renderList();
        fireEvent.click(screen.getByLabelText("Select Widget A"));
        fireEvent.click(screen.getByLabelText("Select Widget B"));

        const bar = screen.getByRole("region", { name: /selected/i });
        expect(within(bar).getByText("Delete 2 movements")).toBeInTheDocument();
    });

    it("modal renders WITHOUT cascade toggle and WITH audit-loss warning", async () => {
        renderList();
        fireEvent.click(screen.getByLabelText("Select Widget A"));

        const bar = screen.getByRole("region", { name: /selected/i });
        fireEvent.click(within(bar).getByText("Delete 1 movement"));

        await screen.findByTestId("bulk-delete-confirm");
        // No cascade toggle for movements (this IS the history).
        expect(screen.queryByTestId("bulk-delete-cascade-label")).toBeNull();
        // Extra warning explicitly underscoring audit loss.
        const warning = screen.getByTestId("bulk-delete-extra-warning");
        expect(warning.textContent).toMatch(/audit history/i);
    });

    it("confirming POSTs {ids} (no preserve_movements) and clears selection", async () => {
        renderList();

        fireEvent.click(screen.getByLabelText("Select Widget A"));
        fireEvent.click(screen.getByLabelText("Select Widget B"));

        const bar = screen.getByRole("region", { name: /selected/i });
        fireEvent.click(within(bar).getByText("Delete 2 movements"));

        const confirmBtn = await screen.findByTestId("bulk-delete-confirm");
        fireEvent.click(confirmBtn);

        await waitFor(() => expect(mockBulkDeleteAsync).toHaveBeenCalledTimes(1));

        const payload = mockBulkDeleteAsync.mock.calls[0][0];
        expect(payload.method).toBe("post");
        expect(payload.url).toMatch(/\/api\/v1\/movements\/bulk-delete\/$/);
        expect(payload.values.ids).toHaveLength(2);
        expect(payload.values.ids).toEqual(
            expect.arrayContaining(["uuid-mov-001", "uuid-mov-002"]),
        );
        expect(payload.values).not.toHaveProperty("preserve_movements");

        await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
    });

    it("cancelling the modal does not POST", async () => {
        renderList();

        fireEvent.click(screen.getByLabelText("Select Widget C"));

        const bar = screen.getByRole("region", { name: /selected/i });
        fireEvent.click(within(bar).getByText("Delete 1 movement"));

        const cancelBtn = await screen.findByTestId("bulk-delete-cancel");
        fireEvent.click(cancelBtn);

        expect(mockBulkDeleteAsync).not.toHaveBeenCalled();
    });
});
