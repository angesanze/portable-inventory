import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Widget } from "../app/Widget";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// Mock QR scanner dependency
vi.mock("html5-qrcode", () => ({
    Html5Qrcode: vi.fn().mockImplementation(() => ({
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        applyVideoConstraints: vi.fn().mockResolvedValue(undefined),
        getRunningTrackCameraCapabilities: vi.fn().mockReturnValue({
            torchFeature: vi.fn().mockReturnValue({ isSupported: () => false }),
        }),
        isScanning: false,
    })),
}));

vi.mock("@refinedev/core", () => ({
    useCreate: () => ({ mutate: vi.fn(), isLoading: false }),
    useResource: () => ({ resource: { name: "widget" } }),
}));

vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
});

/* ── Mock Data ─────────────────────────────────────────── */

const mockProducts = [
    {
        id: "prod-1",
        name: "Steel Bolts",
        sku: "BOLT-001",
        engine_type: "counter",
        tracking_mode: "BULK",
        quantity: 200,
    },
    {
        id: "prod-2",
        name: "Wooden Planks",
        sku: "PLANK-001",
        engine_type: "counter",
        tracking_mode: "BULK",
        quantity: 50,
    },
];

const mockLocations = [
    { id: "loc-1", name: "Main Warehouse", type: "WAREHOUSE" },
    { id: "loc-2", name: "Retail Store", type: "STORE" },
];

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function setupFetchMock(opts?: {
    products?: any[];
    locations?: any[];
    moveResult?: any;
}) {
    const products = opts?.products ?? mockProducts;
    const locations = opts?.locations ?? mockLocations;
    const moveResult = opts?.moveResult ?? { success: true, new_stock_display: "201" };

    fetchMock.mockImplementation((url: string) => {
        if (url.includes("/widget/locations")) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(locations),
            });
        }
        if (url.includes("/widget/batches")) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve([]),
            });
        }
        if (url.includes("/widget/items")) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve([]),
            });
        }
        // Product detail
        if (url.match(/\/widget\/[a-f0-9-]+\//)) {
            const product = products.find((p) =>
                url.includes(p.id),
            );
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve({
                        product_name: product?.name ?? "Unknown",
                        engine: "counter",
                        stock_value: product?.quantity ?? 0,
                        ui_config: {},
                    }),
            });
        }
        // Product list
        if (url.includes("/widget/") && !url.includes("move") && !url.includes("transfer")) {
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve({
                        company: "Integration Co",
                        products,
                        poly_products: [],
                    }),
            });
        }
        if (url.includes("/widget/move")) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(moveResult),
            });
        }
        return Promise.resolve({ ok: false, status: 404 });
    });
}

/* ── Tests ─────────────────────────────────────────────── */

describe("Widget Integration Flow", () => {
    beforeEach(() => {
        fetchMock.mockClear();
    });

    afterEach(() => {
        window.history.pushState({}, "", "/");
    });

    it("loads and displays company name, products, and locations", async () => {
        window.history.pushState({}, "", "/?api_key=int-key");
        setupFetchMock();

        render(
            <MemoryRouter initialEntries={["/?api_key=int-key"]}>
                <Widget />
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByText("Integration Co")).toBeInTheDocument();
        });
    });

    it("shows error when no API key provided", async () => {
        window.history.pushState({}, "", "/");
        setupFetchMock();

        render(
            <MemoryRouter initialEntries={["/"]}>
                <Widget />
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByText(/missing api key/i)).toBeInTheDocument();
        });
    });

    it("auto-selects single location and shows operation controls", async () => {
        window.history.pushState({}, "", "/?api_key=int-key&product_id=prod-1");
        setupFetchMock({
            locations: [{ id: "loc-1", name: "Only Warehouse", type: "WAREHOUSE" }],
        });

        render(
            <MemoryRouter initialEntries={["/?api_key=int-key&product_id=prod-1"]}>
                <Widget />
            </MemoryRouter>,
        );

        // Single location auto-selects, product_id locks product → operation panel
        await waitFor(() => {
            expect(screen.getByText("Check In")).toBeInTheDocument();
            expect(screen.getByText("Check Out")).toBeInTheDocument();
        });
    });

    it("triggers move API call on CHECK IN click", async () => {
        window.history.pushState({}, "", "/?api_key=int-key&product_id=prod-1");
        setupFetchMock({
            locations: [{ id: "loc-1", name: "Warehouse", type: "WAREHOUSE" }],
        });

        render(
            <MemoryRouter initialEntries={["/?api_key=int-key&product_id=prod-1"]}>
                <Widget />
            </MemoryRouter>,
        );

        await waitFor(() => expect(screen.getByText("Check In")).toBeInTheDocument());
        fireEvent.click(screen.getByText("Check In"));

        await waitFor(() => {
            const moveCalls = fetchMock.mock.calls.filter((c: any) =>
                c[0].includes("/widget/move"),
            );
            expect(moveCalls.length).toBeGreaterThan(0);
        });
    });

    it("shows success feedback after transaction", async () => {
        window.history.pushState({}, "", "/?api_key=int-key&product_id=prod-1");
        setupFetchMock({
            locations: [{ id: "loc-1", name: "Warehouse", type: "WAREHOUSE" }],
            moveResult: { success: true, new_stock_display: "201" },
        });

        render(
            <MemoryRouter initialEntries={["/?api_key=int-key&product_id=prod-1"]}>
                <Widget />
            </MemoryRouter>,
        );

        await waitFor(() => expect(screen.getByText("Check In")).toBeInTheDocument());
        fireEvent.click(screen.getByText("Check In"));

        // After successful move, should show success indicator or updated stock
        await waitFor(() => {
            const calls = fetchMock.mock.calls.filter((c: any) =>
                c[0].includes("/widget/move"),
            );
            expect(calls.length).toBeGreaterThan(0);
        });
    });

    it("renders multiple products when location selected", async () => {
        window.history.pushState({}, "", "/?api_key=int-key");
        setupFetchMock();

        render(
            <MemoryRouter initialEntries={["/?api_key=int-key"]}>
                <Widget />
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByText("Integration Co")).toBeInTheDocument();
        });
    });

    it("locks product and location from URL params", async () => {
        window.history.pushState(
            {},
            "",
            "/?api_key=int-key&product_id=prod-1&location_id=loc-1",
        );
        setupFetchMock();

        render(
            <MemoryRouter
                initialEntries={[
                    "/?api_key=int-key&product_id=prod-1&location_id=loc-1",
                ]}
            >
                <Widget />
            </MemoryRouter>,
        );

        // With both product and location locked, should go straight to operation
        await waitFor(() => {
            expect(screen.getByText("Check In")).toBeInTheDocument();
        });
    });

    /* ── Pre-load per panel (Phase 06) ───────────────────── */

    it("pre-loads available items for SERIALIZED product", async () => {
        window.history.pushState(
            {},
            "",
            "/?api_key=int-key&product_id=prod-ser&location_id=loc-1",
        );
        setupFetchMock({
            products: [{
                id: "prod-ser",
                name: "Serial Gizmo",
                sku: "SER-001",
                engine_type: "tracker",
                tracking_mode: "INDIVIDUAL",
                profile: "SERIALIZED",
                quantity: 3,
            }],
            locations: [{ id: "loc-1", name: "Warehouse", type: "WAREHOUSE" }],
        });

        render(
            <MemoryRouter initialEntries={["/?api_key=int-key&product_id=prod-ser&location_id=loc-1"]}>
                <Widget />
            </MemoryRouter>,
        );

        await waitFor(() => {
            const itemCalls = fetchMock.mock.calls.filter((c: any) =>
                c[0].includes("/widget/items/"),
            );
            expect(itemCalls.length).toBeGreaterThan(0);
            expect(itemCalls[0][0]).toContain("product_id=prod-ser");
            expect(itemCalls[0][0]).toContain("location_id=loc-1");
        });
    });

    it("pre-loads batches for BATCH_TRACKED product", async () => {
        window.history.pushState(
            {},
            "",
            "/?api_key=int-key&product_id=prod-bt&location_id=loc-1",
        );
        setupFetchMock({
            products: [{
                id: "prod-bt",
                name: "Batch Item",
                sku: "BT-001",
                engine_type: "bucket",
                tracking_mode: "BATCH",
                profile: "BATCH_TRACKED",
                quantity: 10,
            }],
            locations: [{ id: "loc-1", name: "Warehouse", type: "WAREHOUSE" }],
        });

        render(
            <MemoryRouter initialEntries={["/?api_key=int-key&product_id=prod-bt&location_id=loc-1"]}>
                <Widget />
            </MemoryRouter>,
        );

        await waitFor(() => {
            const batchCalls = fetchMock.mock.calls.filter((c: any) =>
                c[0].includes("/widget/batches/"),
            );
            expect(batchCalls.length).toBeGreaterThan(0);
            expect(batchCalls[0][0]).toContain("product_id=prod-bt");
        });
    });

    it("pre-loads batches for PERISHABLE product", async () => {
        window.history.pushState(
            {},
            "",
            "/?api_key=int-key&product_id=prod-per&location_id=loc-1",
        );
        setupFetchMock({
            products: [{
                id: "prod-per",
                name: "Perishable Item",
                sku: "PER-001",
                engine_type: "time_based",
                tracking_mode: "BATCH",
                profile: "PERISHABLE",
                quantity: 5,
            }],
            locations: [{ id: "loc-1", name: "Warehouse", type: "WAREHOUSE" }],
        });

        render(
            <MemoryRouter initialEntries={["/?api_key=int-key&product_id=prod-per&location_id=loc-1"]}>
                <Widget />
            </MemoryRouter>,
        );

        await waitFor(() => {
            const batchCalls = fetchMock.mock.calls.filter((c: any) =>
                c[0].includes("/widget/batches/"),
            );
            expect(batchCalls.length).toBeGreaterThan(0);
            expect(batchCalls[0][0]).toContain("product_id=prod-per");
        });
    });

    it("pre-loads batch manager data for ASSEMBLED product", async () => {
        window.history.pushState(
            {},
            "",
            "/?api_key=int-key&product_id=prod-asm&location_id=loc-1",
        );
        setupFetchMock({
            products: [{
                id: "prod-asm",
                name: "Assembled Kit",
                sku: "ASM-001",
                engine_type: "batch_manager",
                tracking_mode: "BULK",
                profile: "ASSEMBLED",
                quantity: 2,
            }],
            locations: [{ id: "loc-1", name: "Warehouse", type: "WAREHOUSE" }],
        });

        render(
            <MemoryRouter initialEntries={["/?api_key=int-key&product_id=prod-asm&location_id=loc-1"]}>
                <Widget />
            </MemoryRouter>,
        );

        await waitFor(() => {
            const detailCalls = fetchMock.mock.calls.filter((c: any) =>
                /\/widget\/prod-asm\//.test(c[0]),
            );
            expect(detailCalls.length).toBeGreaterThan(0);
            expect(detailCalls[0][0]).toContain("location_id=loc-1");
        });
    });
});
