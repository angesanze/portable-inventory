import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TransactionWidget } from "./TransactionWidget";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("@refinedev/core", () => ({
    useCreate: () => ({
        mutate: vi.fn(),
        isLoading: false
    }),
    useResource: () => ({
        resource: { name: "widget" }
    })
}));

vi.stubGlobal('ResizeObserver', class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
});

const counterProduct = {
    id: "p1",
    name: "Nails",
    sku: "NAIL-001",
    track_stock: true,
    engine_type: "counter",
    tracking_mode: "BULK",
    quantity: 100,
};

const assembledProduct = {
    id: "wo1",
    name: "Assembly Order",
    sku: "ASM-001",
    track_stock: true,
    engine_type: "batch_manager",
    tracking_mode: "BATCH",
    profile: "ASSEMBLED",
    quantity: 1,
};

const mockLocations = [
    { id: "loc1", name: "Warehouse A", type: "PHYSICAL" }
];

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function setupFetchMock(products: Record<string, unknown>[]) {
    fetchMock.mockImplementation((url: string) => {
        if (url.includes("/widget/locations")) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(mockLocations)
            });
        }
        if (url.includes("/widget/") && !url.includes("move") && !url.includes("locations")) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    company: "Test Co",
                    products,
                    poly_products: []
                })
            });
        }
        if (url.includes("/widget/move/")) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ success: true, new_quantity: 101 })
            });
        }
        return Promise.resolve({ ok: false });
    });
}

function setupAssembledFetchMock() {
    fetchMock.mockImplementation((url: string) => {
        if (url.includes("/widget/locations")) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(mockLocations)
            });
        }
        // WorkOrder fulfill transaction endpoint
        if (url.includes("/widget/wo1/transaction/")) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ status: "CLOSED", discharged: 0 })
            });
        }
        // Batch-manager data for the ASSEMBLED product (has an id segment)
        if (/\/widget\/wo1\/(\?|$)/.test(url)) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    profile: "ASSEMBLED",
                    engine: "batch_manager",
                    grouped_items: {}
                })
            });
        }
        // Product list (no id segment)
        if (url.includes("/widget/") && !url.includes("move") && !url.includes("locations")) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    company: "Test Co",
                    products: [assembledProduct],
                    poly_products: []
                })
            });
        }
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
}

describe("TransactionWidget", () => {
    beforeEach(() => {
        fetchMock.mockClear();
    });

    afterEach(() => {
        window.history.pushState({}, '', '/');
    });

    it("renders company name and location after data loads", async () => {
        window.history.pushState({}, '', '/?api_key=test-key&product_id=p1');
        setupFetchMock([counterProduct]);

        render(
            <MemoryRouter initialEntries={["/?api_key=test-key&product_id=p1"]}>
                <TransactionWidget />
            </MemoryRouter>
        );

        await waitFor(() => expect(screen.getByText("Test Co")).toBeInTheDocument());
        expect(screen.getByText("Warehouse A")).toBeInTheDocument();
    });

    it("shows CHECK IN and CHECK OUT for counter products", async () => {
        window.history.pushState({}, '', '/?api_key=test-key&product_id=p1');
        setupFetchMock([counterProduct]);

        render(
            <MemoryRouter initialEntries={["/?api_key=test-key&product_id=p1"]}>
                <TransactionWidget />
            </MemoryRouter>
        );

        await waitFor(() => expect(screen.getByText("Check In")).toBeInTheDocument());
        expect(screen.getByText("Check Out")).toBeInTheDocument();
    });

    it("triggers fetch on CHECK IN click", async () => {
        window.history.pushState({}, '', '/?api_key=test-key&product_id=p1');
        setupFetchMock([counterProduct]);

        render(
            <MemoryRouter initialEntries={["/?api_key=test-key&product_id=p1"]}>
                <TransactionWidget />
            </MemoryRouter>
        );

        await waitFor(() => expect(screen.getByText("Check In")).toBeInTheDocument());
        fireEvent.click(screen.getByText("Check In"));

        await waitFor(() => {
            const calls = fetchMock.mock.calls as [string, RequestInit?][];
            const moveCall = calls.find((call) => call[0].includes("/widget/move/"));
            expect(moveCall).toBeDefined();
        });
    });

    it("renders Fulfill order button in ASSEMBLED context", async () => {
        window.history.pushState({}, '', '/?api_key=test-key&product_id=wo1');
        setupAssembledFetchMock();

        render(
            <MemoryRouter initialEntries={["/?api_key=test-key&product_id=wo1"]}>
                <TransactionWidget />
            </MemoryRouter>
        );

        await waitFor(() => expect(screen.getByText("Fulfill order")).toBeInTheDocument());
    });

    it("POSTs operation: fulfill to the workorder transaction endpoint", async () => {
        window.history.pushState({}, '', '/?api_key=test-key&product_id=wo1');
        setupAssembledFetchMock();
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

        render(
            <MemoryRouter initialEntries={["/?api_key=test-key&product_id=wo1"]}>
                <TransactionWidget />
            </MemoryRouter>
        );

        await waitFor(() => expect(screen.getByText("Fulfill order")).toBeInTheDocument());
        fireEvent.click(screen.getByText("Fulfill order"));

        await waitFor(() => {
            const fulfillCall = (fetchMock.mock.calls as [string, RequestInit?][]).find(
                (call) => call[0].includes("/widget/wo1/transaction/")
            );
            expect(fulfillCall).toBeDefined();
            expect(JSON.parse(String(fulfillCall![1]!.body))).toEqual({ operation: 'fulfill' });
        });

        confirmSpy.mockRestore();
    });

    it("does not fulfill when confirm is cancelled", async () => {
        window.history.pushState({}, '', '/?api_key=test-key&product_id=wo1');
        setupAssembledFetchMock();
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

        render(
            <MemoryRouter initialEntries={["/?api_key=test-key&product_id=wo1"]}>
                <TransactionWidget />
            </MemoryRouter>
        );

        await waitFor(() => expect(screen.getByText("Fulfill order")).toBeInTheDocument());
        fireEvent.click(screen.getByText("Fulfill order"));

        const fulfillCall = (fetchMock.mock.calls as [string, RequestInit?][]).find(
            (call) => call[0].includes("/widget/wo1/transaction/")
        );
        expect(fulfillCall).toBeUndefined();

        confirmSpy.mockRestore();
    });

    it("does not import or render scanner components", async () => {
        window.history.pushState({}, '', '/?api_key=test-key&product_id=p1');
        setupFetchMock([counterProduct]);

        render(
            <MemoryRouter initialEntries={["/?api_key=test-key&product_id=p1"]}>
                <TransactionWidget />
            </MemoryRouter>
        );

        await waitFor(() => expect(screen.getByText("Test Co")).toBeInTheDocument());
        // Scanner elements should not exist
        expect(screen.queryByText("Scan QR Code")).not.toBeInTheDocument();
    });
});
