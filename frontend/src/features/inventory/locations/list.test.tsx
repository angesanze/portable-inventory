import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { LocationList } from "./list";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { renderWithI18n as render } from "../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockLocations = [
    {
        id: "uuid-loc-001",
        name: "Main Warehouse",
        type: "WAREHOUSE",
        parent_id: null,
        parent_name: null,
    },
    {
        id: "uuid-loc-002",
        name: "Aisle A",
        type: "PHYSICAL",
        parent_id: "uuid-loc-001",
        parent_name: "Main Warehouse",
    },
    {
        id: "uuid-loc-003",
        name: "External",
        type: "VIRTUAL",
        parent_id: null,
        parent_name: null,
    },
    {
        id: "uuid-loc-004",
        name: "Returns Bin",
        type: "LOSS",
        parent_id: null,
        parent_name: null,
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
        data: { data: mockLocations },
        isLoading: false,
        refetch: mockRefetch,
    }),
    useDelete: () => ({ mutate: mockDeleteMutate }),
    useCustomMutation: () => ({ mutateAsync: mockBulkDeleteAsync }),
    useNotification: () => ({ open: vi.fn() }),
}));

function renderList() {
    return render(
        <BrowserRouter>
            <LocationList />
        </BrowserRouter>,
    );
}

describe("LocationList rendering", () => {
    it("renders PageHeader with title and count", () => {
        renderList();
        expect(screen.getByText("Locations")).toBeInTheDocument();
        expect(screen.getByText("4")).toBeInTheDocument();
    });

    it("renders New Location action button", () => {
        renderList();
        expect(screen.getByText("New Location")).toBeInTheDocument();
    });

    it("renders table with correct column headers + leading checkbox column", () => {
        renderList();
        const headers = screen.getAllByRole("columnheader");
        const headerTexts = headers.map((h) => h.textContent);
        expect(headerTexts).toContain("Name");
        expect(headerTexts).toContain("Type");
        expect(headerTexts).toContain("Parent Location");
        expect(headerTexts).toContain("Actions");
        // 5 columns total now (checkbox + 4 data columns)
        expect(headers.length).toBe(5);
        expect(screen.getByLabelText("Select all rows")).toBeInTheDocument();
    });

    it("renders location rows with correct data", () => {
        renderList();
        expect(screen.getAllByText("Main Warehouse").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("Aisle A")).toBeInTheDocument();
        expect(screen.getByText("Returns Bin")).toBeInTheDocument();
    });

    it("displays type badges with correct labels", () => {
        renderList();
        expect(screen.getAllByText("Warehouse").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Virtual").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Loss").length).toBeGreaterThanOrEqual(1);
    });

    it("shows parent location name for sub-locations", () => {
        renderList();
        const mainWarehouseTexts = screen.getAllByText("Main Warehouse");
        expect(mainWarehouseTexts.length).toBeGreaterThanOrEqual(2);
    });

    it("shows dash for locations without parent", () => {
        renderList();
        const dashes = screen.getAllByText("—");
        expect(dashes.length).toBeGreaterThanOrEqual(1);
    });

    it("navigates to detail on row click", () => {
        renderList();
        const row = screen.getByText("Aisle A").closest("tr")!;
        fireEvent.click(row);
        expect(mockNavigate).toHaveBeenCalledWith("/locations/uuid-loc-002");
    });

    it("renders filter bar with name search input", () => {
        renderList();
        expect(screen.getByPlaceholderText("Search by name...")).toBeInTheDocument();
    });
});

describe("LocationList export toolbar button", () => {
    beforeEach(() => {
        exportToExcelSpy.mockClear();
        fetchAllPagesSpy.mockReset();
        fetchAllPagesSpy.mockResolvedValue(mockLocations);
    });

    it("clicking Download Excel calls exportToExcel with 3 cols + locations.xlsx", async () => {
        renderList();
        fireEvent.click(screen.getByRole("button", { name: /Download Excel/i }));
        await waitFor(() => expect(exportToExcelSpy).toHaveBeenCalledTimes(1));
        const [rows, columns, filename] = exportToExcelSpy.mock.calls[0];
        expect(rows).toHaveLength(mockLocations.length);
        expect(columns).toHaveLength(3);
        expect(filename).toBe("locations.xlsx");
    });
});

describe("LocationList bulk-delete flow", () => {
    beforeEach(() => {
        mockBulkDeleteAsync.mockClear();
        mockRefetch.mockClear();
    });

    it("selects 2 rows, confirms modal, POSTs {ids, preserve_movements: true}", async () => {
        renderList();

        fireEvent.click(screen.getByLabelText("Select Main Warehouse"));
        fireEvent.click(screen.getByLabelText("Select Aisle A"));

        const bar = screen.getByRole("region", { name: /selected/i });
        fireEvent.click(within(bar).getByRole("button", { name: "Delete" }));

        const confirmBtn = await screen.findByTestId("bulk-delete-confirm");
        fireEvent.click(confirmBtn);

        await waitFor(() => expect(mockBulkDeleteAsync).toHaveBeenCalledTimes(1));

        const payload = mockBulkDeleteAsync.mock.calls[0][0];
        expect(payload.method).toBe("post");
        expect(payload.url).toMatch(/\/api\/v1\/locations\/bulk-delete\/$/);
        expect(payload.values.preserve_movements).toBe(true);
        expect(payload.values.ids).toHaveLength(2);
        expect(payload.values.ids).toEqual(
            expect.arrayContaining(["uuid-loc-001", "uuid-loc-002"]),
        );

        await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
    });

    it("unticking cascade triggers second confirm; accepting POSTs preserve_movements=false", async () => {
        renderList();

        fireEvent.click(screen.getByLabelText("Select Returns Bin"));

        const bar = screen.getByRole("region", { name: /selected/i });
        fireEvent.click(within(bar).getByRole("button", { name: "Delete" }));

        const cascadeLabel = await screen.findByTestId("bulk-delete-cascade-label");
        fireEvent.click(within(cascadeLabel).getByRole("checkbox"));

        fireEvent.click(screen.getByTestId("bulk-delete-confirm"));

        // Secondary confirm dialog must appear before any POST fires.
        const secondConfirm = await screen.findByTestId("confirm-dialog-confirm");
        expect(mockBulkDeleteAsync).not.toHaveBeenCalled();
        fireEvent.click(secondConfirm);

        await waitFor(() => expect(mockBulkDeleteAsync).toHaveBeenCalledTimes(1));
        const payload = mockBulkDeleteAsync.mock.calls[0][0];
        expect(payload.values.preserve_movements).toBe(false);
        expect(payload.values.ids).toEqual(["uuid-loc-004"]);
    });

    it("cancelling the second confirm aborts the delete", async () => {
        renderList();

        fireEvent.click(screen.getByLabelText("Select External"));

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
