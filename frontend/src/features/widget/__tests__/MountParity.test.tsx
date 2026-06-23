import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { TransactionWidget } from "../app/TransactionWidget";
import { PolymorphicWidget } from "../app/PolymorphicWidget";
import type { ProductComponent } from "../types";

/**
 * Phase 07 mount-point parity.
 *
 * Given the same product, `TransactionWidget` (→ OperationPanel dispatcher) and
 * `PolymorphicWidget` (→ engine-panel switch) should mount the same engine slot.
 * We compare `data-testid` panel roots; the engine panels in
 * `components/engines/*` were tagged with the matching IDs from
 * OperationPanel.matrix.test.tsx.
 *
 * Known divergence (documented in WIDGET-AUDIT-07.md ## Deferred):
 *   SERIALIZED + status_transitions → TransactionWidget mounts
 *   `panel-tracker-status` (TrackerStatusForm), PolymorphicWidget mounts the
 *   generic `panel-tracker-form` (TrackerPanel) because the engine-panel
 *   dispatcher does not yet branch on preset transitions.
 */

vi.mock("@refinedev/core", () => ({
    useCreate: () => ({ mutate: vi.fn(), isLoading: false }),
    useResource: () => ({ resource: { name: "widget" } }),
}));

vi.stubGlobal(
    "ResizeObserver",
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

interface ProductFixture {
    id: string;
    name: string;
    sku: string;
    profile: string;
    engine: string;
    inputType: string;
    quantity: number;
    transitions?: Record<string, string[]>;
    components?: ProductComponent[];
}

const FIXTURES: Record<string, ProductFixture> = {
    SIMPLE_COUNT: {
        id: "prod-sc",
        name: "Steel Bolt",
        sku: "SC-001",
        profile: "SIMPLE_COUNT",
        engine: "counter",
        inputType: "number",
        quantity: 100,
    },
    BATCH_TRACKED: {
        id: "prod-bt",
        name: "Reagent Batch",
        sku: "BT-001",
        profile: "BATCH_TRACKED",
        engine: "bucket",
        inputType: "bucket_form",
        quantity: 10,
        components: [],
    },
    SERIALIZED_NO_PRESET: {
        id: "prod-sn",
        name: "Hand Drill",
        sku: "SN-001",
        profile: "SERIALIZED",
        engine: "tracker",
        inputType: "tracker",
        quantity: 5,
    },
    SERIALIZED_WITH_PRESET: {
        id: "prod-sp",
        name: "Repair Asset",
        sku: "SP-001",
        profile: "SERIALIZED",
        engine: "tracker",
        inputType: "tracker",
        quantity: 5,
        transitions: { ACTIVE: ["BROKEN"], BROKEN: ["REPAIRED"] },
    },
};

function installFetchMock(p: ProductFixture) {
    fetchMock.mockImplementation((url: string) => {
        // PolymorphicWidget single-product config endpoint:
        //   /api/v1/widget/<id>/?api_key=...
        if (url.match(new RegExp(`/widget/${p.id}/`))) {
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve({
                        product_name: p.name,
                        profile: p.profile,
                        engine: p.engine,
                        current_stock_display: String(p.quantity),
                        ui_config: {
                            input_type: p.inputType,
                            fields:
                                p.engine === "bucket"
                                    ? [{ key: "lot", label: "Lot", type: "text" }]
                                    : [],
                            ...(p.transitions
                                ? { status_transitions: p.transitions }
                                : {}),
                        },
                    }),
            });
        }
        // TransactionWidget bootstrap endpoints:
        if (url.includes("/widget/locations")) {
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve([
                        { id: "loc-1", name: "Main", type: "WAREHOUSE" },
                    ]),
            });
        }
        if (url.includes("/widget/batches")) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }
        if (url.includes("/widget/items")) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }
        // Standard product list (`/widget/?api_key=...` and `?location_id=...`)
        if (url.includes("/widget/") && !url.includes("/widget/p-")) {
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve({
                        company: "Acme",
                        products: [
                            {
                                id: p.id,
                                name: p.name,
                                sku: p.sku,
                                profile: p.profile,
                                engine_type: p.engine,
                                quantity: p.quantity,
                                components: p.components,
                                calc_config: {
                                    engine: p.engine,
                                    ui_config: {
                                        input_type: p.inputType,
                                        fields:
                                            p.engine === "bucket"
                                                ? [
                                                      {
                                                          key: "lot",
                                                          label: "Lot",
                                                          type: "text",
                                                      },
                                                  ]
                                                : [],
                                    },
                                    ...(p.transitions
                                        ? { status_transitions: p.transitions }
                                        : {}),
                                },
                            },
                        ],
                        poly_products: [],
                    }),
            });
        }
        return Promise.resolve({ ok: false, status: 404 });
    });
}

function renderTransactionWidget(p: ProductFixture) {
    const search = `?api_key=k&product_id=${p.id}&location_id=loc-1`;
    window.history.pushState({}, "", `/${search}`);
    return render(
        <MemoryRouter initialEntries={[`/${search}`]}>
            <TransactionWidget />
        </MemoryRouter>,
    );
}

function renderPolymorphicWidget(p: ProductFixture) {
    return render(
        <MemoryRouter initialEntries={[`/p-widget/${p.id}?api_key=k`]}>
            <Routes>
                <Route path="/p-widget/:id" element={<PolymorphicWidget />} />
            </Routes>
        </MemoryRouter>,
    );
}

describe("Mount-point parity: TransactionWidget vs PolymorphicWidget", () => {
    beforeEach(() => {
        fetchMock.mockClear();
    });

    afterEach(() => {
        cleanup();
        window.history.pushState({}, "", "/");
    });

    const parityCases: Array<{
        name: string;
        fixture: keyof typeof FIXTURES;
        testid: string;
    }> = [
        { name: "SIMPLE_COUNT", fixture: "SIMPLE_COUNT", testid: "panel-quantity" },
        {
            name: "BATCH_TRACKED",
            fixture: "BATCH_TRACKED",
            testid: "panel-batch-composition",
        },
        {
            name: "SERIALIZED (no preset)",
            fixture: "SERIALIZED_NO_PRESET",
            testid: "panel-tracker-form",
        },
    ];

    for (const c of parityCases) {
        it(`${c.name}: both routes mount ${c.testid}`, async () => {
            const fixture = FIXTURES[c.fixture];

            installFetchMock(fixture);
            renderTransactionWidget(fixture);
            await waitFor(() => {
                expect(screen.getByTestId(c.testid)).toBeInTheDocument();
            });

            cleanup();
            installFetchMock(fixture);
            renderPolymorphicWidget(fixture);
            await waitFor(() => {
                expect(screen.getByTestId(c.testid)).toBeInTheDocument();
            });
        });
    }

    it("SERIALIZED (with preset): known divergence between routes", async () => {
        const fixture = FIXTURES.SERIALIZED_WITH_PRESET;

        // TransactionWidget reads product.calc_config.status_transitions and
        // routes through TrackerStatusForm.
        installFetchMock(fixture);
        renderTransactionWidget(fixture);
        await waitFor(() => {
            expect(screen.getByTestId("panel-tracker-status")).toBeInTheDocument();
        });

        cleanup();

        // PolymorphicWidget's engine-panel switch only sees `inputType: tracker`
        // and ignores status_transitions, so it mounts the generic TrackerPanel.
        // Documented in WIDGET-AUDIT-07.md ## Deferred.
        installFetchMock(fixture);
        renderPolymorphicWidget(fixture);
        await waitFor(() => {
            expect(screen.getByTestId("panel-tracker-form")).toBeInTheDocument();
        });
        expect(screen.queryByTestId("panel-tracker-status")).not.toBeInTheDocument();
    });
});
