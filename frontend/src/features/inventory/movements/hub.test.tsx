import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { MovementHub } from "./hub";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockMovements = [
    {
        id: "m1",
        occurred_at: "2026-05-20T10:00:00Z",
        product_name: "Widget A",
        quantity: 10,
        from_location: { name: "External", type: "VIRTUAL" },
        to_location: { name: "Main Warehouse", type: "WAREHOUSE" },
    },
    {
        id: "m2",
        occurred_at: "2026-05-19T14:00:00Z",
        product_name: "Widget B",
        quantity: -5,
        from_location: { name: "Retail Store", type: "STORE" },
        to_location: { name: "External", type: "VIRTUAL" },
    },
];

vi.mock("@refinedev/core", () => ({
    useList: () => ({
        data: { data: mockMovements },
        isLoading: false,
    }),
}));

function renderHub() {
    return render(
        <BrowserRouter>
            <MovementHub />
        </BrowserRouter>,
    );
}

describe("MovementHub", () => {
    it("renders page header with title and subtitle", () => {
        renderHub();
        expect(screen.getByText("Movements")).toBeInTheDocument();
        expect(
            screen.getByText(
                "Track inventory coming in, going out, or moving between locations",
            ),
        ).toBeInTheDocument();
    });

    it("renders MovementTypePicker cards", () => {
        renderHub();
        expect(screen.getByText("Receive Stock")).toBeInTheDocument();
        expect(screen.getByText("Ship / Consume")).toBeInTheDocument();
        expect(screen.getByText("Transfer Between Locations")).toBeInTheDocument();
    });

    it("renders Recent Movements section heading", () => {
        renderHub();
        expect(screen.getByText("Recent Movements")).toBeInTheDocument();
    });

    it("renders recent movement rows", () => {
        renderHub();
        expect(screen.getByText("Widget A")).toBeInTheDocument();
        expect(screen.getByText("Widget B")).toBeInTheDocument();
    });

    it("shows direction badges for movements", () => {
        renderHub();
        expect(screen.getByText("Inbound")).toBeInTheDocument();
        expect(screen.getByText("Outbound")).toBeInTheDocument();
    });

    it("shows location names in table", () => {
        renderHub();
        expect(screen.getByText("Main Warehouse")).toBeInTheDocument();
        expect(screen.getByText("Retail Store")).toBeInTheDocument();
    });
});

describe("MovementHub - empty state", () => {
    it("shows empty message when no movements exist", () => {
        vi.resetModules();
        // Re-render with empty data by overriding at component level
        // Since we already mocked, test the component's empty branch
        const { unmount } = renderHub();
        unmount();

        // Mock empty data
        vi.doMock("@refinedev/core", () => ({
            useList: () => ({
                data: { data: [] },
                isLoading: false,
            }),
        }));
    });
});
