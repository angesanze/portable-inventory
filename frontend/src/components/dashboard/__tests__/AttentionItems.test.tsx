import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithI18n, i18n } from "../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
    useNavigate: () => mockNavigate,
}));

const mockUseList = vi.fn();
vi.mock("@refinedev/core", () => ({
    useList: (...args: any[]) => mockUseList(...args),
}));

import { AttentionItems } from "../AttentionItems";

describe("AttentionItems", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(async () => {
        await i18n.changeLanguage("en");
    });

    function setupMock(overrides: {
        products?: any;
        batches?: any;
        workOrders?: any;
        movements?: any;
    }) {
        mockUseList.mockImplementation(({ resource }: any) => {
            if (resource === "product-models") {
                return overrides.products ?? {
                    data: { data: [] },
                    isLoading: false,
                };
            }
            if (resource === "batches") {
                return overrides.batches ?? {
                    data: { data: [] },
                    isLoading: false,
                };
            }
            if (resource === "work-orders") {
                return overrides.workOrders ?? {
                    data: { data: [] },
                    isLoading: false,
                };
            }
            if (resource === "movements") {
                return overrides.movements ?? {
                    data: { data: [], total: 0 },
                    isLoading: false,
                };
            }
            return { data: { data: [] }, isLoading: false };
        });
    }

    it("renders 'All clear' when no attention items", () => {
        setupMock({});
        renderWithI18n(<AttentionItems />);
        expect(
            screen.getByText("All clear — no items need attention")
        ).toBeTruthy();
    });

    it("shows loading skeleton when data is loading", () => {
        setupMock({
            products: { data: null, isLoading: true },
        });
        const { container } = renderWithI18n(<AttentionItems />);
        const skeletons = container.querySelectorAll(".animate-pulse");
        expect(skeletons.length).toBe(3);
    });

    it("shows low stock alerts for products with LOW status", () => {
        setupMock({
            products: {
                data: {
                    data: [
                        {
                            id: "p1",
                            name: "Widget A",
                            stock_status: {
                                quantity: 3,
                                threshold: 10,
                                status: "LOW",
                            },
                        },
                        {
                            id: "p2",
                            name: "Widget B",
                            stock_status: {
                                quantity: 50,
                                threshold: 10,
                                status: "OK",
                            },
                        },
                    ],
                },
                isLoading: false,
            },
        });
        renderWithI18n(<AttentionItems />);
        expect(
            screen.getByText("Widget A is low on stock (3 / 10)")
        ).toBeTruthy();
        expect(screen.queryByText(/Widget B/)).toBeNull();
    });

    it("shows expiring batch alerts within 30 days", () => {
        const inTenDays = new Date(
            Date.now() + 10 * 24 * 60 * 60 * 1000
        ).toISOString().split("T")[0];

        const inSixtyDays = new Date(
            Date.now() + 60 * 24 * 60 * 60 * 1000
        ).toISOString().split("T")[0];

        setupMock({
            batches: {
                data: {
                    data: [
                        {
                            id: "b1",
                            batch_identifier: "LOT-001",
                            data: { expiry_date: inTenDays },
                            product_model: "pm1",
                            work_order: null,
                        },
                        {
                            id: "b2",
                            batch_identifier: "LOT-002",
                            data: { expiry_date: inSixtyDays },
                            product_model: "pm2",
                            work_order: null,
                        },
                        {
                            id: "b3",
                            batch_identifier: "LOT-003",
                            data: {},
                            product_model: "pm3",
                            work_order: null,
                        },
                    ],
                },
                isLoading: false,
            },
        });
        renderWithI18n(<AttentionItems />);
        expect(screen.getByText(/LOT-001 expires in 10 days/)).toBeTruthy();
        expect(screen.queryByText(/LOT-002/)).toBeNull();
        expect(screen.queryByText(/LOT-003/)).toBeNull();
    });

    it("shows open work orders", () => {
        setupMock({
            workOrders: {
                data: {
                    data: [
                        { id: "wo1", name: "Restock Warehouse" },
                    ],
                },
                isLoading: false,
            },
        });
        renderWithI18n(<AttentionItems />);
        expect(
            screen.getByText('Work order "Restock Warehouse" is open')
        ).toBeTruthy();
    });

    it("navigates on item click", () => {
        setupMock({
            workOrders: {
                data: {
                    data: [{ id: "wo1", name: "Test WO" }],
                },
                isLoading: false,
            },
        });
        renderWithI18n(<AttentionItems />);
        fireEvent.click(screen.getByText('Work order "Test WO" is open'));
        expect(mockNavigate).toHaveBeenCalledWith("/work-orders/show/wo1");
    });

    it("uses Card component as container", () => {
        setupMock({});
        const { container } = renderWithI18n(<AttentionItems />);
        const card = container.firstElementChild as HTMLElement;
        expect(card.className).toContain("bg-zinc-900/80");
        expect(card.className).toContain("rounded-xl");
    });

    it("renders header with correct title", () => {
        setupMock({});
        renderWithI18n(<AttentionItems />);
        expect(screen.getByText("Attention Items")).toBeTruthy();
    });

    it("shows 'add first product' suggestion when no products exist", () => {
        setupMock({
            movements: { data: { data: [], total: 0 }, isLoading: false },
        });
        renderWithI18n(<AttentionItems />);
        expect(
            screen.getByText("Start by adding your first product to track inventory")
        ).toBeTruthy();
    });

    it("shows 'record movement' suggestion when products exist but no movements", () => {
        setupMock({
            products: {
                data: {
                    data: [
                        { id: "p1", name: "Widget", stock_status: { status: "OK", quantity: 10, threshold: 5 } },
                        { id: "p2", name: "Gadget", stock_status: { status: "OK", quantity: 20, threshold: 5 } },
                        { id: "p3", name: "Doohickey", stock_status: { status: "OK", quantity: 15, threshold: 5 } },
                    ],
                },
                isLoading: false,
            },
            movements: { data: { data: [], total: 0 }, isLoading: false },
        });
        renderWithI18n(<AttentionItems />);
        expect(
            screen.getByText(/You have 3 products but no recent movements/)
        ).toBeTruthy();
    });

    it("shows 'create work order' suggestion when products and movements exist but no work orders", () => {
        setupMock({
            products: {
                data: {
                    data: [
                        { id: "p1", name: "Widget", stock_status: { status: "OK", quantity: 10, threshold: 5 } },
                    ],
                },
                isLoading: false,
            },
            movements: { data: { data: [{ id: "m1" }], total: 5 }, isLoading: false },
            workOrders: { data: { data: [] }, isLoading: false },
        });
        renderWithI18n(<AttentionItems />);
        expect(
            screen.getByText(/No open work orders/)
        ).toBeTruthy();
    });

    it("navigates when clicking a suggestion", () => {
        setupMock({
            movements: { data: { data: [], total: 0 }, isLoading: false },
        });
        renderWithI18n(<AttentionItems />);
        fireEvent.click(
            screen.getByText("Start by adding your first product to track inventory")
        );
        expect(mockNavigate).toHaveBeenCalledWith("/products/create");
    });

    it("does not show suggestions when attention items exist", () => {
        setupMock({
            workOrders: {
                data: {
                    data: [{ id: "wo1", name: "Test WO" }],
                },
                isLoading: false,
            },
            movements: { data: { data: [], total: 0 }, isLoading: false },
        });
        renderWithI18n(<AttentionItems />);
        expect(
            screen.queryByText(/Start by adding/)
        ).toBeNull();
        expect(
            screen.queryByText(/No open work orders/)
        ).toBeNull();
    });

    it("renders Italian header and all-clear message when language is switched to it", async () => {
        await i18n.changeLanguage("it");
        setupMock({});
        renderWithI18n(<AttentionItems />);
        expect(screen.getByText("Elementi da Verificare")).toBeTruthy();
        expect(
            screen.getByText("Tutto ok — nessun elemento richiede attenzione")
        ).toBeTruthy();
    });

    it("renders Italian low-stock and work-order descriptions when language is switched to it", async () => {
        await i18n.changeLanguage("it");
        setupMock({
            products: {
                data: {
                    data: [
                        {
                            id: "p1",
                            name: "Widget A",
                            stock_status: { quantity: 3, threshold: 10, status: "LOW" },
                        },
                    ],
                },
                isLoading: false,
            },
            workOrders: {
                data: { data: [{ id: "wo1", name: "Restock Warehouse" }] },
                isLoading: false,
            },
        });
        renderWithI18n(<AttentionItems />);
        expect(screen.getByText("Widget A ha scorte basse (3 / 10)")).toBeTruthy();
        expect(
            screen.getByText('L\'ordine di lavoro "Restock Warehouse" è aperto')
        ).toBeTruthy();
    });

    it("renders Italian 'add first product' suggestion when language is switched to it", async () => {
        await i18n.changeLanguage("it");
        setupMock({
            movements: { data: { data: [], total: 0 }, isLoading: false },
        });
        renderWithI18n(<AttentionItems />);
        expect(
            screen.getByText(
                "Inizia aggiungendo il tuo primo prodotto per tracciare l'inventario"
            )
        ).toBeTruthy();
    });
});
