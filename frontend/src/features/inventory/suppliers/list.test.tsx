import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { SupplierList } from "./list";
import { renderWithI18n as render } from "../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockSuppliers = [
    {
        id: "sup-001",
        name: "Acme Supplies",
        vat_number: "IT12345678901",
        email: "orders@acme.com",
        phone: "",
        is_active: true,
    },
    {
        id: "sup-002",
        name: "Beta Distributors",
        vat_number: "IT98765432109",
        email: "",
        phone: "+39 02 1234567",
        is_active: true,
    },
    {
        id: "sup-003",
        name: "Inactive Vendor",
        vat_number: "",
        email: "",
        phone: "",
        is_active: false,
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
        data: { data: mockSuppliers },
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
            <SupplierList />
        </BrowserRouter>,
    );
}

describe("SupplierList export toolbar button", () => {
    beforeEach(() => {
        exportToExcelSpy.mockClear();
        fetchAllPagesSpy.mockReset();
        fetchAllPagesSpy.mockResolvedValue(mockSuppliers);
    });

    it("clicking Download Excel calls exportToExcel with 4 cols + suppliers.xlsx", async () => {
        renderList();
        fireEvent.click(screen.getByRole("button", { name: /Download Excel/i }));
        await waitFor(() => expect(exportToExcelSpy).toHaveBeenCalledTimes(1));
        const [rows, columns, filename] = exportToExcelSpy.mock.calls[0];
        expect(rows).toHaveLength(mockSuppliers.length);
        expect(columns).toHaveLength(4);
        expect(filename).toBe("suppliers.xlsx");
    });
});

describe("SupplierList bulk-delete flow", () => {
    beforeEach(() => {
        mockBulkDeleteAsync.mockClear();
        mockRefetch.mockClear();
    });

    it("renders rows + checkbox column", () => {
        renderList();
        expect(screen.getByText("Acme Supplies")).toBeInTheDocument();
        expect(screen.getByText("Beta Distributors")).toBeInTheDocument();
        expect(screen.getByLabelText("Select Acme Supplies")).toBeInTheDocument();
    });

    it("selects 2 rows, confirms modal, POSTs {ids, preserve_movements: true}", async () => {
        renderList();

        fireEvent.click(screen.getByLabelText("Select Acme Supplies"));
        fireEvent.click(screen.getByLabelText("Select Beta Distributors"));

        const bar = screen.getByRole("region", { name: /selected/i });
        fireEvent.click(within(bar).getByRole("button", { name: "Delete" }));

        const confirmBtn = await screen.findByTestId("bulk-delete-confirm");
        fireEvent.click(confirmBtn);

        await waitFor(() => expect(mockBulkDeleteAsync).toHaveBeenCalledTimes(1));

        const payload = mockBulkDeleteAsync.mock.calls[0][0];
        expect(payload.method).toBe("post");
        expect(payload.url).toMatch(/\/api\/v1\/suppliers\/bulk-delete\/$/);
        expect(payload.values.preserve_movements).toBe(true);
        expect(payload.values.ids).toHaveLength(2);
        expect(payload.values.ids).toEqual(
            expect.arrayContaining(["sup-001", "sup-002"]),
        );

        await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
    });

    it("toggles preserve_movements to false when cascade checkbox unticked", async () => {
        renderList();

        fireEvent.click(screen.getByLabelText("Select Acme Supplies"));

        const bar = screen.getByRole("region", { name: /selected/i });
        fireEvent.click(within(bar).getByRole("button", { name: "Delete" }));

        const cascadeLabel = await screen.findByTestId("bulk-delete-cascade-label");
        fireEvent.click(within(cascadeLabel).getByRole("checkbox"));

        fireEvent.click(screen.getByTestId("bulk-delete-confirm"));

        await waitFor(() => expect(mockBulkDeleteAsync).toHaveBeenCalledTimes(1));
        const payload = mockBulkDeleteAsync.mock.calls[0][0];
        expect(payload.values.preserve_movements).toBe(false);
    });
});
