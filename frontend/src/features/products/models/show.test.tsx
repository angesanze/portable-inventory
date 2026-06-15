import { screen, fireEvent } from "@testing-library/react";
import { ProductModelShow } from "./show";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { renderWithI18n as render, i18n } from "../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ id: "test-uuid-123" }),
    };
});

/* ── Shared fixtures ──────────────────────────────────────────────── */

const mockModel = {
    id: "test-uuid-123",
    name: "Widget Alpha",
    sku: "WA-001",
    profile: "SIMPLE_COUNT",
    tracking_mode: "BULK",
    engine_type: "counter",
    description: "A bulk-tracked widget",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-15T00:00:00Z",
    attributes: { min_threshold: 10 },
    components: [{ child_name: "Sub-Widget", quantity: 3 }],
};

const mockStock = {
    total: 42,
    breakdown: { Warehouse: 30, Storefront: 12 },
    tracking_mode: "BULK",
    profile: "SIMPLE_COUNT",
};

const mockMovements = [
    {
        id: "m1",
        quantity: 10,
        occurred_at: "2026-04-20T14:00:00Z",
        from_location: { name: "Supplier" },
        to_location: { name: "Warehouse" },
        reason: "Restock",
    },
    {
        id: "m2",
        quantity: -3,
        occurred_at: "2026-04-21T10:00:00Z",
        from_location: { name: "Warehouse" },
        to_location: { name: "Customer" },
        reason: "Sale",
    },
];

const mockDeleteMutate = vi.fn();
const useListSpy = vi.fn();

/* ── Default mock (BULK / SIMPLE_COUNT) ───────────────────────────── */

let currentModel = mockModel;
let currentStock: any = mockStock;

vi.mock("@refinedev/core", () => ({
    useOne: () => ({
        data: { data: currentModel },
        isLoading: false,
    }),
    useCustom: () => ({
        data: { data: currentStock },
        isLoading: false,
        refetch: vi.fn(),
    }),
    useList: (args: any) => {
        useListSpy(args);
        return {
            data: { data: mockMovements },
            isLoading: false,
            refetch: vi.fn(),
        };
    },
    useDelete: () => ({
        mutate: mockDeleteMutate,
    }),
    useNotification: () => ({
        open: vi.fn(),
    }),
}));

beforeEach(() => {
    currentModel = mockModel;
    currentStock = mockStock;
    mockNavigate.mockClear();
    useListSpy.mockClear();
});

/* ── Existing tests (adapted) ─────────────────────────────────────── */

describe("ProductModelShow", () => {
    it("renders product info using DetailPage header", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(
            screen.getAllByText("Widget Alpha").length,
        ).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("WA-001").length).toBeGreaterThanOrEqual(1);
        expect(
            screen.getAllByText(/Simple Count/).length,
        ).toBeGreaterThanOrEqual(1);
    });

    it("renders Details section with KeyValueGrid", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("Details")).toBeInTheDocument();
        expect(screen.getByText("Name")).toBeInTheDocument();
        expect(screen.getByText("SKU")).toBeInTheDocument();
        expect(screen.getByText("Description")).toBeInTheDocument();
        expect(screen.getByText("A bulk-tracked widget")).toBeInTheDocument();
        expect(screen.getByText("Profile")).toBeInTheDocument();
        expect(screen.getByText("Profile Type")).toBeInTheDocument();
    });

    it("renders stock summary as Current Inventory", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("Current Inventory")).toBeInTheDocument();
        expect(screen.getAllByText("42").length).toBeGreaterThanOrEqual(1);
        expect(
            screen.getAllByText("Warehouse").length,
        ).toBeGreaterThanOrEqual(1);
        expect(
            screen.getAllByText("Storefront").length,
        ).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("30").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("12").length).toBeGreaterThanOrEqual(1);
    });

    it("renders recent movements", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("Recent Movements")).toBeInTheDocument();
        expect(screen.getByText("+10")).toBeInTheDocument();
        expect(screen.getByText("-3")).toBeInTheDocument();
        expect(screen.getByText("Restock")).toBeInTheDocument();
        expect(screen.getByText("Sale")).toBeInTheDocument();
    });

    it("queries movements filtered by product_model id", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(useListSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                resource: "movements",
                filters: expect.arrayContaining([
                    expect.objectContaining({
                        field: "product_model",
                        operator: "eq",
                        value: "test-uuid-123",
                    }),
                ]),
            }),
        );
    });

    it("renders 'See all' link pointing at filtered movements list", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        const seeAll = screen.getByText("See all") as HTMLAnchorElement;
        expect(seeAll).toBeInTheDocument();
        expect(seeAll.getAttribute("href")).toBe(
            "/movements?product_model=test-uuid-123",
        );
    });

    it("renders components section when model has components", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("Components")).toBeInTheDocument();
        expect(screen.getByText("Sub-Widget")).toBeInTheDocument();
        expect(screen.getByText("x3")).toBeInTheDocument();
    });

    it("shows Edit and Delete action buttons", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("Edit")).toBeInTheDocument();
        expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    it("navigates to edit page on Edit click", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        fireEvent.click(screen.getByText("Edit"));
        expect(mockNavigate).toHaveBeenCalledWith(
            "/products/edit/test-uuid-123",
        );
    });

    it("shows confirm dialog on Delete click", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        fireEvent.click(screen.getByText("Delete"));
        expect(screen.getByText("Delete Product Model")).toBeInTheDocument();
        expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });

    it("renders back button", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("Back")).toBeInTheDocument();
    });
});

/* ── Profile-aware Current Inventory tests ────────────────────────── */

describe("ProductModelShow – BULK inventory", () => {
    it("shows Record Movement button for BULK profile", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("Record Movement")).toBeInTheDocument();
    });

    it("navigates to movements/create on Record Movement click", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        fireEvent.click(screen.getByText("Record Movement"));
        expect(mockNavigate).toHaveBeenCalledWith(
            "/movements/create?product=test-uuid-123",
        );
    });

    it("shows location breakdown for BULK profile", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("By Location")).toBeInTheDocument();
        expect(screen.getByText("total units")).toBeInTheDocument();
    });
});

describe("ProductModelShow – BATCH inventory", () => {
    beforeEach(() => {
        currentModel = {
            ...mockModel,
            profile: "BATCH_TRACKED",
            tracking_mode: "BATCH",
            engine_type: "bucket",
        };
        currentStock = {
            total: 500,
            breakdown: { Warehouse: 500 },
            tracking_mode: "BATCH",
            profile: "BATCH_TRACKED",
            batches: [
                {
                    id: "b1",
                    batch_identifier: "LOT-2026-001",
                    quantity: 300,
                    location: "Warehouse",
                    data: {},
                },
                {
                    id: "b2",
                    batch_identifier: "LOT-2026-002",
                    quantity: 200,
                    location: "Warehouse",
                    data: {},
                },
            ],
        };
    });

    it("shows batch table with identifiers and quantities", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("Batches (2)")).toBeInTheDocument();
        expect(screen.getByText("LOT-2026-001")).toBeInTheDocument();
        expect(screen.getByText("LOT-2026-002")).toBeInTheDocument();
        expect(screen.getByText("300")).toBeInTheDocument();
        expect(screen.getByText("200")).toBeInTheDocument();
    });

    it("shows Record Batch Movement button", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("Record Batch Movement")).toBeInTheDocument();
    });
});

describe("ProductModelShow – PERISHABLE inventory", () => {
    const inDays = (days: number) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d.toISOString();
    };

    beforeEach(() => {
        currentModel = {
            ...mockModel,
            profile: "PERISHABLE",
            tracking_mode: "BATCH",
            engine_type: "time_based",
        };
        currentStock = {
            total: 200,
            breakdown: { Warehouse: 200 },
            tracking_mode: "BATCH",
            profile: "PERISHABLE",
            batches: [
                {
                    id: "b-expired",
                    batch_identifier: "EXP-001",
                    quantity: 50,
                    location: "Warehouse",
                    data: { expiry_date: inDays(-5) },
                },
                {
                    id: "b-critical",
                    batch_identifier: "EXP-002",
                    quantity: 50,
                    location: "Warehouse",
                    data: { expiry_date: inDays(3) },
                },
                {
                    id: "b-warning",
                    batch_identifier: "EXP-003",
                    quantity: 50,
                    location: "Warehouse",
                    data: { expiry_date: inDays(20) },
                },
                {
                    id: "b-ok",
                    batch_identifier: "EXP-004",
                    quantity: 50,
                    location: "Warehouse",
                    data: { expiry_date: inDays(60) },
                },
            ],
        };
    });

    it("shows Expiry column and expired badge", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("Expiry")).toBeInTheDocument();
        expect(screen.getAllByText("Expired").length).toBeGreaterThanOrEqual(1);
    });

    it("renders Days remaining column with bucketed color coding", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("Days remaining")).toBeInTheDocument();

        expect(screen.getByTestId("days-remaining-b-expired").getAttribute("data-expiry-bucket")).toBe("expired");
        expect(screen.getByTestId("days-remaining-b-critical").getAttribute("data-expiry-bucket")).toBe("critical");
        expect(screen.getByTestId("days-remaining-b-warning").getAttribute("data-expiry-bucket")).toBe("warning");
        expect(screen.getByTestId("days-remaining-b-ok").getAttribute("data-expiry-bucket")).toBe("ok");
    });

    it("renders at least one row with an expiry date", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("EXP-002")).toBeInTheDocument();
        // Critical bucket gets the Expiring Soon badge
        expect(screen.getAllByText("Expiring Soon").length).toBeGreaterThanOrEqual(1);
    });
});

describe("ProductModelShow – i18n", () => {
    it("renders show-page strings in Italian when language is switched", async () => {
        try {
            await i18n.changeLanguage("it");
            render(
                <BrowserRouter>
                    <ProductModelShow />
                </BrowserRouter>,
            );
            expect(screen.getByText("Dettagli")).toBeInTheDocument();
            expect(screen.getByText("Inventario Attuale")).toBeInTheDocument();
            expect(screen.getByText("Per Ubicazione")).toBeInTheDocument();
            expect(screen.getByText("unità totali")).toBeInTheDocument();
            expect(screen.getByText("Movimenti Recenti")).toBeInTheDocument();
            expect(screen.getByText("Componenti")).toBeInTheDocument();
            // Action buttons resolve from the common namespace
            expect(screen.getByText("Modifica")).toBeInTheDocument();
            expect(screen.getByText("Elimina")).toBeInTheDocument();
        } finally {
            await i18n.changeLanguage("en");
        }
    });
});

describe("ProductModelShow – DIMENSIONAL inventory", () => {
    beforeEach(() => {
        currentModel = {
            ...mockModel,
            profile: "DIMENSIONAL",
            tracking_mode: "BULK",
            engine_type: "dimension",
            engine_config: {
                dimensions: ["length", "width"],
                unit: "m",
                computed_unit: "m²",
                formula: "length * width",
            },
        } as any;
        currentStock = {
            total: 45.2,
            breakdown: { Warehouse: 45.2 },
            tracking_mode: "BULK",
            profile: "DIMENSIONAL",
        };
    });

    it("renders the Dimensional Configuration card with dimensions, units, and formula", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("Dimensional Configuration")).toBeInTheDocument();
        expect(screen.getByText("Dimensions")).toBeInTheDocument();
        expect(screen.getByText("length × width")).toBeInTheDocument();
        expect(screen.getByText("Base Unit")).toBeInTheDocument();
        expect(screen.getByText("Computed Unit")).toBeInTheDocument();
        expect(screen.getByText("m²")).toBeInTheDocument();
        expect(screen.getByText("Formula")).toBeInTheDocument();
        expect(screen.getByText("length * width")).toBeInTheDocument();
    });

    it("formats the current measure with the computed unit when stock is present", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("Current Measure")).toBeInTheDocument();
        expect(screen.getByText("45.20 m²")).toBeInTheDocument();
    });

    it("shows the no-measurement placeholder when stock total is zero", () => {
        currentStock = {
            total: 0,
            breakdown: {},
            tracking_mode: "BULK",
            profile: "DIMENSIONAL",
        };
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("No measurement recorded yet.")).toBeInTheDocument();
    });

    it("does NOT render the Dimensional card for non-DIMENSIONAL profiles", () => {
        currentModel = mockModel; // SIMPLE_COUNT
        currentStock = mockStock;
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.queryByText("Dimensional Configuration")).not.toBeInTheDocument();
    });
});

describe("ProductModelShow – SERIALIZED inventory", () => {
    beforeEach(() => {
        currentModel = {
            ...mockModel,
            profile: "SERIALIZED",
            tracking_mode: "INDIVIDUAL",
            engine_type: "tracker",
        };
        currentStock = {
            total: 3,
            breakdown: { Warehouse: 2, Store: 1 },
            tracking_mode: "INDIVIDUAL",
            profile: "SERIALIZED",
            items: [
                {
                    id: "i1",
                    identifier: "SN-001",
                    status: "ACTIVE",
                    location: "Warehouse",
                },
                {
                    id: "i2",
                    identifier: "SN-002",
                    status: "ACTIVE",
                    location: "Warehouse",
                },
                {
                    id: "i3",
                    identifier: "SN-003",
                    status: "DISPOSED",
                    location: "Store",
                },
            ],
        };
    });

    it("shows items table with serial numbers and status badges", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("Items (3)")).toBeInTheDocument();
        expect(screen.getByText("SN-001")).toBeInTheDocument();
        expect(screen.getByText("SN-002")).toBeInTheDocument();
        expect(screen.getByText("SN-003")).toBeInTheDocument();
        expect(screen.getAllByText("ACTIVE").length).toBe(2);
        expect(screen.getByText("DISPOSED")).toBeInTheDocument();
    });

    it("shows items count label instead of total units", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("items")).toBeInTheDocument();
    });

    it("shows Register New Item button", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        expect(screen.getByText("Register New Item")).toBeInTheDocument();
    });

    it("navigates to stock/create on Register New Item click", () => {
        render(
            <BrowserRouter>
                <ProductModelShow />
            </BrowserRouter>,
        );
        fireEvent.click(screen.getByText("Register New Item"));
        expect(mockNavigate).toHaveBeenCalledWith(
            "/stock/create?product=test-uuid-123",
        );
    });
});
