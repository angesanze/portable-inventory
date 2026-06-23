import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { CalculatorList } from "../CalculatorList";
import { renderWithI18n } from "../../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockTemplates = [
    {
        id: "tpl-001",
        name: "Standard Counter",
        engine_type: "counter",
        engine_config: { step: 1, allow_negative: false },
        created_at: "2026-05-01T10:00:00Z",
    },
    {
        id: "tpl-002",
        name: "Liter Converter",
        engine_type: "converter",
        engine_config: { ratio: 0.5 },
        created_at: "2026-05-02T10:00:00Z",
    },
];

const mockDeleteMutate = vi.fn();
const mockBulkDeleteAsync = vi.fn().mockResolvedValue({});
const mockRefetch = vi.fn();

const { exportToExcelSpy, fetchAllPagesSpy } = vi.hoisted(() => ({
    exportToExcelSpy: vi.fn(),
    fetchAllPagesSpy: vi.fn(),
}));
vi.mock("../../../../utils/exportToExcel", () => ({
    exportToExcel: exportToExcelSpy,
}));
vi.mock("../../../../utils/fetchAllPages", () => ({
    fetchAllPages: fetchAllPagesSpy,
}));

type ListData = { data: Record<string, unknown>[]; total?: number };
let mockTemplateListData: { data: ListData; isLoading: boolean; isError: boolean; refetch: () => void };
let mockProductUsageData: { data: ListData; isLoading: boolean };

vi.mock("@refinedev/core", () => ({
    useList: (opts: { resource?: string }) => {
        if (opts?.resource === "product-models") {
            return mockProductUsageData;
        }
        return mockTemplateListData;
    },
    useDelete: () => ({ mutate: mockDeleteMutate }),
    useCustomMutation: () => ({ mutateAsync: mockBulkDeleteAsync }),
    useNotification: () => ({ open: vi.fn() }),
}));

function renderList() {
    return renderWithI18n(
        <BrowserRouter>
            <CalculatorList />
        </BrowserRouter>,
    );
}

describe("CalculatorList", () => {
    beforeEach(() => {
        mockTemplateListData = {
            data: { data: mockTemplates },
            isLoading: false,
            isError: false,
            refetch: mockRefetch,
        };
        mockProductUsageData = {
            data: { data: [], total: 0 },
            isLoading: false,
        };
        mockNavigate.mockClear();
        mockBulkDeleteAsync.mockClear();
        mockRefetch.mockClear();
        localStorage.clear();
    });

    it("renders page header with title", () => {
        renderList();
        expect(screen.getByText("Tracking Presets")).toBeInTheDocument();
    });

    it("renders DismissableHint with guidance text", () => {
        renderList();
        expect(
            screen.getByText(/Tracking presets let you create reusable engine configurations/),
        ).toBeInTheDocument();
    });

    it("renders template rows when data exists", () => {
        renderList();
        expect(screen.getByText("Standard Counter")).toBeInTheDocument();
        expect(screen.getByText("Liter Converter")).toBeInTheDocument();
    });

    it("renders engine type badges", () => {
        renderList();
        expect(screen.getByText("Counter")).toBeInTheDocument();
        expect(screen.getByText("Converter")).toBeInTheDocument();
    });

    it("renders config summary from engine_config keys", () => {
        renderList();
        expect(screen.getByText("step, allow_negative")).toBeInTheDocument();
        expect(screen.getByText("ratio")).toBeInTheDocument();
    });

    it("renders Used By column header", () => {
        renderList();
        expect(screen.getByText("Used By")).toBeInTheDocument();
    });

    it("shows 'Not used' when no products reference a preset", () => {
        mockProductUsageData = { data: { data: [], total: 0 }, isLoading: false };
        renderList();
        const notUsedCells = screen.getAllByText("Not used");
        expect(notUsedCells.length).toBeGreaterThanOrEqual(1);
    });

    it("shows product count when products reference a preset", () => {
        mockProductUsageData = {
            data: { data: [{ id: "p1", name: "Test" }], total: 3 },
            isLoading: false,
        };
        renderList();
        const usageCells = screen.getAllByText("3 products");
        expect(usageCells.length).toBeGreaterThanOrEqual(1);
    });

    it("shows singular 'product' for count of 1", () => {
        mockProductUsageData = {
            data: { data: [{ id: "p1", name: "Test" }], total: 1 },
            isLoading: false,
        };
        renderList();
        const usageCells = screen.getAllByText("1 product");
        expect(usageCells.length).toBeGreaterThanOrEqual(1);
    });

    describe("empty state", () => {
        beforeEach(() => {
            mockTemplateListData = {
                data: { data: [] },
                isLoading: false,
                isError: false,
                refetch: vi.fn(),
            };
        });

        it("shows empty state title", () => {
            renderList();
            expect(screen.getByText("No tracking presets yet")).toBeInTheDocument();
        });

        it("shows empty state description explaining presets are optional", () => {
            renderList();
            expect(
                screen.getByText(/Presets are optional — products work fine with their default profile settings/),
            ).toBeInTheDocument();
        });

        it("shows help items for each preset type", () => {
            renderList();
            expect(screen.getByText(/Counter preset — customize step size/)).toBeInTheDocument();
            expect(screen.getByText(/Converter preset — define unit conversion ratios/)).toBeInTheDocument();
            expect(screen.getByText(/Dimension preset — set up formulas/)).toBeInTheDocument();
            expect(screen.getByText(/Batch preset — configure allocation strategy/)).toBeInTheDocument();
        });

        it("shows Create Preset action button", () => {
            renderList();
            expect(screen.getByText("Create Preset")).toBeInTheDocument();
        });
    });

    it("hides hint after dismissal", () => {
        localStorage.setItem("hint_dismissed_tracking-presets-intro", "true");
        renderList();
        expect(
            screen.queryByText(/Tracking presets let you create reusable engine configurations/),
        ).not.toBeInTheDocument();
    });

    describe("export toolbar button", () => {
        beforeEach(() => {
            exportToExcelSpy.mockClear();
            fetchAllPagesSpy.mockReset();
            fetchAllPagesSpy.mockResolvedValue(mockTemplates);
        });

        it("clicking Download Excel calls exportToExcel with 3 cols + calculator-templates.xlsx", async () => {
            renderList();
            fireEvent.click(screen.getByRole("button", { name: /Download Excel/i }));
            await waitFor(() => expect(exportToExcelSpy).toHaveBeenCalledTimes(1));
            const [rows, columns, filename] = exportToExcelSpy.mock.calls[0];
            expect(rows).toHaveLength(mockTemplates.length);
            expect(columns).toHaveLength(3);
            expect(filename).toBe("calculator-templates.xlsx");
        });
    });

    describe("bulk-delete flow", () => {
        it("renders leading checkbox column header", () => {
            renderList();
            expect(screen.getByLabelText("Select all rows")).toBeInTheDocument();
            expect(screen.getByLabelText("Select Standard Counter")).toBeInTheDocument();
            expect(screen.getByLabelText("Select Liter Converter")).toBeInTheDocument();
        });

        it("selects 2 rows, confirms modal, POSTs {ids, force: true}", async () => {
            renderList();

            fireEvent.click(screen.getByLabelText("Select Standard Counter"));
            fireEvent.click(screen.getByLabelText("Select Liter Converter"));

            const bar = screen.getByRole("region", { name: /selected/i });
            fireEvent.click(within(bar).getByRole("button", { name: "Delete" }));

            const confirmBtn = await screen.findByTestId("bulk-delete-confirm");
            fireEvent.click(confirmBtn);

            await waitFor(() => expect(mockBulkDeleteAsync).toHaveBeenCalledTimes(1));

            const payload = mockBulkDeleteAsync.mock.calls[0][0];
            expect(payload.method).toBe("post");
            expect(payload.url).toMatch(/\/api\/v1\/calculator-templates\/bulk-delete\/$/);
            expect(payload.values.force).toBe(true);
            expect(payload.values.ids).toHaveLength(2);
            expect(payload.values.ids).toEqual(
                expect.arrayContaining(["tpl-001", "tpl-002"]),
            );

            await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
        });

        it("modal has no cascade toggle", async () => {
            renderList();
            fireEvent.click(screen.getByLabelText("Select Standard Counter"));
            const bar = screen.getByRole("region", { name: /selected/i });
            fireEvent.click(within(bar).getByRole("button", { name: "Delete" }));
            await screen.findByTestId("bulk-delete-confirm");
            expect(screen.queryByTestId("bulk-delete-cascade-label")).not.toBeInTheDocument();
        });
    });
});
