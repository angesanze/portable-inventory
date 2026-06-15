import { render, screen, fireEvent } from "@testing-library/react";
import { LocationShow } from "./show";
import { describe, it, expect, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ id: "loc-uuid-123" }),
    };
});

const mockLocation = {
    id: "loc-uuid-123",
    name: "Main Warehouse",
    type: "WAREHOUSE",
    parent_name: "HQ Campus",
    created_at: "2026-01-01T00:00:00Z",
};

const mockInventory = [
    {
        id: "pp1",
        product_model_name: "Widget Alpha",
        quantity: 30,
        status: "ACTIVE",
    },
    {
        id: "pp2",
        product_model_name: "Gizmo Beta",
        serial_number: "SN-1234",
        quantity: 1,
        status: "IN_USE",
    },
];

const mockMovements = [
    {
        id: "m1",
        quantity: 10,
        occurred_at: "2026-04-20T14:00:00Z",
        from_location: { name: "Supplier" },
        to_location: { name: "Main Warehouse" },
        product_model_name: "Widget Alpha",
        reason: "Restock",
    },
    {
        id: "m2",
        quantity: -5,
        occurred_at: "2026-04-21T10:00:00Z",
        from_location: { name: "Main Warehouse" },
        to_location: { name: "Storefront" },
        product_model_name: "Widget Alpha",
        reason: "Transfer out",
    },
];

const mockDeleteMutate = vi.fn();

vi.mock("@refinedev/core", () => ({
    useOne: () => ({
        data: { data: mockLocation },
        isLoading: false,
    }),
    useList: ({ resource }: { resource: string }) => {
        if (resource === "physical-products") {
            return { data: { data: mockInventory }, isLoading: false };
        }
        return { data: { data: mockMovements }, isLoading: false };
    },
    useDelete: () => ({
        mutate: mockDeleteMutate,
    }),
}));

describe("LocationShow", () => {
    it("renders location header with name and type badge", () => {
        render(
            <BrowserRouter>
                <LocationShow />
            </BrowserRouter>
        );

        expect(screen.getAllByText("Main Warehouse").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Warehouse").length).toBeGreaterThanOrEqual(1);
    });

    it("renders Details section with KeyValueGrid", () => {
        render(
            <BrowserRouter>
                <LocationShow />
            </BrowserRouter>
        );

        expect(screen.getByText("Details")).toBeInTheDocument();
        expect(screen.getByText("Name")).toBeInTheDocument();
        expect(screen.getByText("Type")).toBeInTheDocument();
        expect(screen.getByText("Parent Location")).toBeInTheDocument();
        expect(screen.getByText("HQ Campus")).toBeInTheDocument();
        expect(screen.getByText("Created")).toBeInTheDocument();
    });

    it("renders current inventory section", () => {
        render(
            <BrowserRouter>
                <LocationShow />
            </BrowserRouter>
        );

        expect(screen.getByText("Current Inventory")).toBeInTheDocument();
        expect(screen.getAllByText("Widget Alpha").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("Gizmo Beta")).toBeInTheDocument();
        expect(screen.getByText("30")).toBeInTheDocument();
        expect(screen.getByText("S/N: SN-1234")).toBeInTheDocument();
        expect(screen.getByText("ACTIVE")).toBeInTheDocument();
        expect(screen.getByText("IN_USE")).toBeInTheDocument();
    });

    it("renders recent activity section", () => {
        render(
            <BrowserRouter>
                <LocationShow />
            </BrowserRouter>
        );

        expect(screen.getByText("Recent Activity")).toBeInTheDocument();
        expect(screen.getByText("+10")).toBeInTheDocument();
        expect(screen.getByText("-5")).toBeInTheDocument();
        expect(screen.getByText("Restock")).toBeInTheDocument();
        expect(screen.getByText("Transfer out")).toBeInTheDocument();
    });

    it("shows Edit and Delete action buttons", () => {
        render(
            <BrowserRouter>
                <LocationShow />
            </BrowserRouter>
        );

        expect(screen.getByText("Edit")).toBeInTheDocument();
        expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    it("navigates to edit page on Edit click", () => {
        render(
            <BrowserRouter>
                <LocationShow />
            </BrowserRouter>
        );

        fireEvent.click(screen.getByText("Edit"));
        expect(mockNavigate).toHaveBeenCalledWith("/locations/edit/loc-uuid-123");
    });

    it("shows confirm dialog on Delete click", () => {
        render(
            <BrowserRouter>
                <LocationShow />
            </BrowserRouter>
        );

        fireEvent.click(screen.getByText("Delete"));
        expect(screen.getByText("Delete Location")).toBeInTheDocument();
        expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });

    it("renders back button", () => {
        render(
            <BrowserRouter>
                <LocationShow />
            </BrowserRouter>
        );

        expect(screen.getByText("Back")).toBeInTheDocument();
    });

    it("shows item count in inventory header", () => {
        render(
            <BrowserRouter>
                <LocationShow />
            </BrowserRouter>
        );

        expect(screen.getByText("2 items")).toBeInTheDocument();
    });
});
