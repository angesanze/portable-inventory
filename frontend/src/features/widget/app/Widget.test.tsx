import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Widget } from "./Widget";
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

// Mock html5-qrcode (imported transitively via QRScanner)
vi.mock("html5-qrcode", () => ({
    Html5Qrcode: vi.fn().mockImplementation(() => ({
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        applyVideoConstraints: vi.fn().mockResolvedValue(undefined),
        getRunningTrackCameraCapabilities: vi.fn().mockReturnValue({ torchFeature: vi.fn().mockReturnValue({ isSupported: () => false }) }),
        isScanning: false,
    })),
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

const bucketProduct = {
    id: "p2",
    name: "Milk",
    sku: "MILK-001",
    track_stock: true,
    engine_type: "bucket",
    tracking_mode: "BULK",
    profile: "BATCH_TRACKED",
    quantity: 50,
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

describe("Widget Component", () => {
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
                <Widget />
            </MemoryRouter>
        );

        // Single location auto-selects → goes to operation panel
        await waitFor(() => expect(screen.getByText("Test Co")).toBeInTheDocument());
        expect(screen.getByText("Warehouse A")).toBeInTheDocument();
    });

    it("shows CHECK IN and CHECK OUT for counter products", async () => {
        window.history.pushState({}, '', '/?api_key=test-key&product_id=p1');
        setupFetchMock([counterProduct]);

        render(
            <MemoryRouter initialEntries={["/?api_key=test-key&product_id=p1"]}>
                <Widget />
            </MemoryRouter>
        );

        // Single location auto-selects, product_id locks product
        await waitFor(() => expect(screen.getByText("Check In")).toBeInTheDocument());
        expect(screen.getByText("Check Out")).toBeInTheDocument();
    });

    it("triggers fetch on CHECK IN click", async () => {
        window.history.pushState({}, '', '/?api_key=test-key&product_id=p1');
        setupFetchMock([counterProduct]);

        render(
            <MemoryRouter initialEntries={["/?api_key=test-key&product_id=p1"]}>
                <Widget />
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

    it("renders Batch Contents section for bucket products", async () => {
        window.history.pushState({}, '', '/?api_key=test-key&product_id=p2');
        setupFetchMock([bucketProduct]);

        render(
            <MemoryRouter initialEntries={["/?api_key=test-key&product_id=p2"]}>
                <Widget />
            </MemoryRouter>
        );

        await waitFor(() => expect(screen.getByText("Batch Contents")).toBeInTheDocument());
    });
});
