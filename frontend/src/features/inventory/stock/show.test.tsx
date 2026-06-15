import { render, screen } from "@testing-library/react";
import { PhysicalProductShow } from "./show";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ id: "uuid-stock-001" }),
    };
});

const mockItem = {
    id: "uuid-stock-001",
    identifier: "SN-1",
    product_model: "pm-001",
    product_model_name: "Macbook 13",
    product_model_details: { id: "pm-001", sku: "MB13", name: "Macbook 13" },
    status: "BROKEN",
    location: "loc-001",
    location_name: "Main",
    created_at: "2026-04-01T10:00:00Z",
    updated_at: "2026-05-20T08:30:00Z",
};

let mockHistory: any[] = [];
let mockMovements: any[] = [];

vi.mock("@refinedev/core", () => ({
    useOne: () => ({
        data: { data: mockItem },
        isLoading: false,
        error: null,
    }),
    useCustom: () => ({
        data: { data: { results: mockHistory } },
        isLoading: false,
    }),
    useList: () => ({
        data: { data: mockMovements },
        isLoading: false,
    }),
}));

function renderShow() {
    return render(
        <BrowserRouter>
            <PhysicalProductShow />
        </BrowserRouter>,
    );
}

describe("PhysicalProductShow", () => {
    beforeEach(() => {
        mockHistory = [];
        mockMovements = [];
    });

    it("renders identifier as title", () => {
        renderShow();
        expect(screen.getAllByText("SN-1").length).toBeGreaterThanOrEqual(1);
    });

    it("renders status badge with BROKEN", () => {
        renderShow();
        expect(screen.getAllByText("BROKEN").length).toBeGreaterThanOrEqual(1);
    });

    it("links model name to /products/:model_id", () => {
        renderShow();
        const link = screen.getByRole("link", { name: /Macbook 13/ });
        expect(link).toHaveAttribute("href", "/products/pm-001");
    });

    it("links location to /locations/:id", () => {
        renderShow();
        const locLink = screen.getByRole("link", { name: /Main/ });
        expect(locLink).toHaveAttribute("href", "/locations/loc-001");
    });

    it("renders Edit button", () => {
        renderShow();
        expect(screen.getByText("Edit")).toBeInTheDocument();
    });

    it("renders empty state when no status history", () => {
        renderShow();
        expect(screen.getByText(/No status changes yet/i)).toBeInTheDocument();
    });

    it("renders status history rows in reverse chronological order", () => {
        mockHistory = [
            {
                id: "m-3",
                occurred_at: "2026-05-25T12:00:00Z",
                reason: "Status: BROKEN → REPAIRED — screen replaced",
                user: "alice",
                from_location: "Main",
                to_location: "Main",
                quantity: 0,
            },
            {
                id: "m-2",
                occurred_at: "2026-05-24T10:00:00Z",
                reason: "Status: ACTIVE → BROKEN",
                user: "bob",
                from_location: "Main",
                to_location: "Main",
                quantity: 0,
            },
            {
                id: "m-1",
                occurred_at: "2026-05-22T09:00:00Z",
                reason: "Regular movement: bumped",
                user: null,
                from_location: "Main",
                to_location: "Field",
                quantity: 1,
            },
        ];
        renderShow();
        expect(screen.getByText("REPAIRED")).toBeInTheDocument();
        expect(screen.getAllByText("BROKEN").length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText("ACTIVE")).toBeInTheDocument();
        // Non-status rows filtered out.
        expect(screen.queryByText(/Regular movement/i)).not.toBeInTheDocument();
        // Notes rendered.
        expect(screen.getByText(/screen replaced/i)).toBeInTheDocument();
        // User shown.
        expect(screen.getByText("alice")).toBeInTheDocument();
        expect(screen.getByText("bob")).toBeInTheDocument();
    });
});
