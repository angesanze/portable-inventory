import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { CustomerList } from "./list";
import { renderWithI18n as render } from "../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockCustomers = [
    {
        id: "cus-001",
        name: "Alpha Retail",
        vat_number: "IT12345678901",
        email: "orders@alpha.com",
        phone: "",
        is_active: true,
    },
    {
        id: "cus-002",
        name: "Beta Stores",
        vat_number: "",
        email: "",
        phone: "+39 02 1234567",
        is_active: true,
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
        data: { data: mockCustomers },
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
            <CustomerList />
        </BrowserRouter>,
    );
}

describe("CustomerList rendering + export", () => {
    beforeEach(() => {
        exportToExcelSpy.mockClear();
        fetchAllPagesSpy.mockReset();
        fetchAllPagesSpy.mockResolvedValue(mockCustomers);
    });

    it("renders one row per customer with name + VAT", () => {
        renderList();
        expect(screen.getByText("Alpha Retail")).toBeInTheDocument();
        expect(screen.getByText("Beta Stores")).toBeInTheDocument();
        expect(screen.getByText("IT12345678901")).toBeInTheDocument();
    });

    it("clicking Download Excel exports customers.xlsx", async () => {
        renderList();
        fireEvent.click(screen.getByRole("button", { name: /Download Excel/i }));
        await waitFor(() => expect(exportToExcelSpy).toHaveBeenCalledTimes(1));
        const [rows, columns, filename] = exportToExcelSpy.mock.calls[0];
        expect(rows).toHaveLength(mockCustomers.length);
        expect(columns).toHaveLength(4);
        expect(filename).toBe("customers.xlsx");
    });
});

describe("CustomerList bulk-delete flow", () => {
    beforeEach(() => {
        mockBulkDeleteAsync.mockClear();
        mockRefetch.mockClear();
    });

    it("selects rows, confirms modal, POSTs {ids, preserve_movements: true}", async () => {
        renderList();
        fireEvent.click(screen.getByLabelText("Select Alpha Retail"));
        fireEvent.click(screen.getByLabelText("Select Beta Stores"));

        const bar = screen.getByRole("region", { name: /selected/i });
        fireEvent.click(within(bar).getByRole("button", { name: "Delete" }));

        const confirmBtn = await screen.findByTestId("bulk-delete-confirm");
        fireEvent.click(confirmBtn);

        await waitFor(() => expect(mockBulkDeleteAsync).toHaveBeenCalledTimes(1));
        const payload = mockBulkDeleteAsync.mock.calls[0][0];
        expect(payload.method).toBe("post");
        expect(payload.url).toMatch(/\/api\/v1\/customers\/bulk-delete\/$/);
        expect(payload.values.preserve_movements).toBe(true);
        expect(payload.values.ids).toEqual(
            expect.arrayContaining(["cus-001", "cus-002"]),
        );
        await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
    });
});
