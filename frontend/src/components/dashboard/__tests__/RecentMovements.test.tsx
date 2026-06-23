import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithI18n, i18n } from "../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
    useNavigate: () => mockNavigate,
}));

const mockUseList = vi.fn();
vi.mock("@refinedev/core", () => ({
    useList: (...args: unknown[]) => mockUseList(...args),
}));

import { RecentMovements, RecentMovementsView } from "../RecentMovements";

const mockMovements = [
    {
        id: 1,
        quantity: 50,
        product_model: { name: "Widget A", sku: "WA-001" },
        from_location: null,
        to_location: { name: "Warehouse 1" },
        occurred_at: new Date(Date.now() - 3600000).toISOString(), // 1h ago
    },
    {
        id: 2,
        quantity: -20,
        product_model: { name: "Widget B", sku: "WB-002" },
        from_location: { name: "Warehouse 1" },
        to_location: null,
        occurred_at: new Date(Date.now() - 7200000).toISOString(), // 2h ago
    },
    {
        id: 3,
        quantity: 10,
        product_model: { name: "Widget C", sku: "WC-003" },
        from_location: { name: "Warehouse 1" },
        to_location: { name: "Warehouse 2" },
        occurred_at: new Date(Date.now() - 86400000).toISOString(), // 1d ago
    },
];

describe("RecentMovementsView", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(async () => {
        await i18n.changeLanguage("en");
    });

    it("renders loading state with skeleton", () => {
        const { container } = renderWithI18n(<RecentMovementsView movements={[]} isLoading={true} />);
        const skeletons = container.querySelectorAll("[role='status']");
        expect(skeletons.length).toBeGreaterThan(0);
    });

    it("renders empty state", () => {
        renderWithI18n(<RecentMovementsView movements={[]} isLoading={false} />);
        expect(screen.getByText("No recent movements")).toBeDefined();
    });

    it("renders movement entries with product names", () => {
        renderWithI18n(<RecentMovementsView movements={mockMovements} isLoading={false} />);
        expect(screen.getByText("Widget A")).toBeDefined();
        expect(screen.getByText("Widget B")).toBeDefined();
        expect(screen.getByText("Widget C")).toBeDefined();
    });

    it("shows inbound description for positive quantity without from_location", () => {
        renderWithI18n(<RecentMovementsView movements={[mockMovements[0]]} isLoading={false} />);
        expect(screen.getByText("Received 50 at Warehouse 1")).toBeDefined();
    });

    it("shows outbound description for negative quantity", () => {
        renderWithI18n(<RecentMovementsView movements={[mockMovements[1]]} isLoading={false} />);
        expect(screen.getByText("Dispatched 20 from Warehouse 1")).toBeDefined();
    });

    it("shows transfer description when both locations present", () => {
        renderWithI18n(<RecentMovementsView movements={[mockMovements[2]]} isLoading={false} />);
        expect(screen.getByText("Transferred 10 from Warehouse 1 to Warehouse 2")).toBeDefined();
    });

    it("renders colored dots for each movement type", () => {
        const { container } = renderWithI18n(<RecentMovementsView movements={mockMovements} isLoading={false} />);
        const dots = container.querySelectorAll("span[aria-hidden='true']");
        expect(dots.length).toBe(3);
        expect(dots[0].className).toContain("bg-green-500");   // inbound
        expect(dots[1].className).toContain("bg-orange-500");  // outbound
        expect(dots[2].className).toContain("bg-blue-500");    // transfer
    });

    it("shows relative timestamps", () => {
        renderWithI18n(<RecentMovementsView movements={[mockMovements[0]]} isLoading={false} />);
        expect(screen.getByText("1h ago")).toBeDefined();
    });

    it("limits display to 10 movements", () => {
        const manyMovements = Array.from({ length: 15 }, (_, i) => ({
            id: i,
            quantity: 5,
            product_model: { name: `Product ${i}` },
            from_location: null,
            to_location: { name: "Loc" },
            occurred_at: new Date().toISOString(),
        }));
        const { container } = renderWithI18n(<RecentMovementsView movements={manyMovements} isLoading={false} />);
        const items = container.querySelectorAll("li");
        expect(items.length).toBe(10);
    });

    it("navigates to /movements on 'View all' click", () => {
        renderWithI18n(<RecentMovementsView movements={mockMovements} isLoading={false} />);
        fireEvent.click(screen.getByText(/View all/));
        expect(mockNavigate).toHaveBeenCalledWith("/movements");
    });

    it("shows 'Unknown Product' for missing product_model", () => {
        const movement = {
            id: 99,
            quantity: 5,
            product_model: null,
            from_location: null,
            to_location: { name: "Loc" },
            occurred_at: new Date().toISOString(),
        };
        renderWithI18n(<RecentMovementsView movements={[movement]} isLoading={false} />);
        expect(screen.getByText("Unknown Product")).toBeDefined();
    });

    it("renders Italian labels and movement descriptions when language is switched to it", async () => {
        await i18n.changeLanguage("it");
        renderWithI18n(<RecentMovementsView movements={mockMovements} isLoading={false} />);
        expect(screen.getByText("Movimenti Recenti")).toBeTruthy();
        expect(screen.getByText("Ricevuti 50 presso Warehouse 1")).toBeTruthy();
        expect(screen.getByText("Spediti 20 da Warehouse 1")).toBeTruthy();
        expect(screen.getByText("Trasferiti 10 da Warehouse 1 a Warehouse 2")).toBeTruthy();
        expect(screen.getByText(/Vedi tutti/)).toBeTruthy();
    });

    it("renders Italian empty state when language is switched to it", async () => {
        await i18n.changeLanguage("it");
        renderWithI18n(<RecentMovementsView movements={[]} isLoading={false} />);
        expect(screen.getByText("Nessun movimento recente")).toBeTruthy();
    });
});

describe("RecentMovements (connected)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("fetches movements with correct params", () => {
        mockUseList.mockReturnValue({
            data: { data: [] },
            isLoading: false,
        });
        renderWithI18n(<RecentMovements />);
        expect(mockUseList).toHaveBeenCalledWith(
            expect.objectContaining({
                resource: "movements",
                pagination: { current: 1, pageSize: 10 },
                sorters: [{ field: "occurred_at", order: "desc" }],
            })
        );
    });
});
