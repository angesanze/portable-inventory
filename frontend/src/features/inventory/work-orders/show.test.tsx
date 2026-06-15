import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorkOrderShow } from "./show";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ id: "wo-uuid-123" }),
    };
});

// Mutable so individual tests can flip the work order status.
let mockStatus = "OPEN";

const mockWorkOrder = {
    id: "wo-uuid-123",
    name: "Kit Assembly Q2",
    description: "Quarterly kit assembly batch",
    get status() {
        return mockStatus;
    },
    product_model_details: { name: "Starter Kit" },
    product_model_sku: "SK-001",
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-20T12:00:00Z",
    contents_summary: { batch_count: 1, item_count: 1, total_items: 2 },
};

const mockContents = [
    {
        type: "BATCH",
        product_id: "pm1",
        product_name: "Widget Alpha",
        sku: "WA-100",
        quantity: 25,
        batch_identifier: "LOT-2026-Q2",
    },
    {
        type: "SERIAL",
        product_id: "pm2",
        product_name: "Gizmo Beta",
        sku: "GB-200",
        quantity: 1,
        identifier: "SN-5678",
    },
];

const mockMovements = [
    {
        id: "m1",
        quantity: 10,
        occurred_at: "2026-04-15T14:00:00Z",
        from_location: { name: "Supplier" },
        to_location: { name: "Warehouse" },
        product_model_name: "Widget Alpha",
        description: "Restock",
    },
    {
        id: "m2",
        quantity: -3,
        occurred_at: "2026-04-16T10:00:00Z",
        from_location: { name: "Warehouse" },
        to_location: { name: "Assembly" },
        product_model_name: "Widget Alpha",
        description: "Kit fulfillment",
    },
];

const mockDeleteMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockCustomMutate = vi.fn();

vi.mock("@refinedev/core", () => ({
    useOne: () => ({
        data: { data: mockWorkOrder },
        isLoading: false,
    }),
    useCustom: () => ({
        data: { data: mockContents },
        isLoading: false,
        refetch: vi.fn(),
    }),
    useCustomMutation: () => ({
        mutate: mockCustomMutate,
        isLoading: false,
    }),
    useList: ({ resource }: { resource: string }) => {
        if (resource === "product-models") {
            return { data: { data: [] }, isLoading: false };
        }
        if (resource === "physical-products") {
            return { data: { data: [] }, isLoading: false };
        }
        // movements
        return { data: { data: mockMovements }, isLoading: false };
    },
    useDelete: () => ({ mutate: mockDeleteMutate }),
    useUpdate: () => ({ mutate: mockUpdateMutate }),
}));

describe("WorkOrderShow", () => {
    beforeEach(() => {
        mockStatus = "OPEN";
        mockCustomMutate.mockClear();
    });

    it("renders header with name and status badge", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        expect(screen.getAllByText("Kit Assembly Q2").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("OPEN").length).toBeGreaterThanOrEqual(1);
    });

    it("renders Details section with KeyValueGrid", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        expect(screen.getByText("Details")).toBeInTheDocument();
        expect(screen.getByText("Name")).toBeInTheDocument();
        expect(screen.getByText("Description")).toBeInTheDocument();
        expect(screen.getByText("Product Model")).toBeInTheDocument();
        expect(screen.getByText("Starter Kit")).toBeInTheDocument();
        expect(screen.getByText("Status")).toBeInTheDocument();
        expect(screen.getByText("Created")).toBeInTheDocument();
        expect(screen.getByText("Updated")).toBeInTheDocument();
    });

    it("renders Line Items section with contents", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        expect(screen.getByText("Line Items")).toBeInTheDocument();
        expect(screen.getAllByText("Widget Alpha").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("Gizmo Beta")).toBeInTheDocument();
        expect(screen.getByText("WA-100")).toBeInTheDocument();
        expect(screen.getByText("GB-200")).toBeInTheDocument();
        expect(screen.getByText("BATCH")).toBeInTheDocument();
        expect(screen.getByText("SERIAL")).toBeInTheDocument();
        expect(screen.getByText("Lot: LOT-2026-Q2")).toBeInTheDocument();
        expect(screen.getByText("S/N: SN-5678")).toBeInTheDocument();
        expect(screen.getByText("2 items")).toBeInTheDocument();
    });

    it("renders Movements section", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        expect(screen.getByText("Movements")).toBeInTheDocument();
        expect(screen.getByText("+10")).toBeInTheDocument();
        expect(screen.getByText("-3")).toBeInTheDocument();
        expect(screen.getByText("Restock")).toBeInTheDocument();
        expect(screen.getByText("Kit fulfillment")).toBeInTheDocument();
    });

    it("shows Edit, Complete, and Delete action buttons", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        expect(screen.getByText("Edit")).toBeInTheDocument();
        expect(screen.getByText("Complete")).toBeInTheDocument();
        expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    it("navigates to edit page on Edit click", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        fireEvent.click(screen.getByText("Edit"));
        expect(mockNavigate).toHaveBeenCalledWith("/work-orders/edit/wo-uuid-123");
    });

    it("shows confirm dialog on Delete click", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        fireEvent.click(screen.getByText("Delete"));
        expect(screen.getByText("Delete Work Order")).toBeInTheDocument();
        expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });

    it("shows confirm dialog on Complete click", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        fireEvent.click(screen.getByText("Complete"));
        expect(screen.getByText("Complete Work Order")).toBeInTheDocument();
        expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });

    it("renders back button", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        expect(screen.getByText("Back")).toBeInTheDocument();
    });

    it("shows Add button in Line Items header", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        expect(screen.getByText("Add")).toBeInTheDocument();
    });

    it("shows status explanation for OPEN work order", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        expect(
            screen.getByText("This work order is active. You can add or modify line items."),
        ).toBeInTheDocument();
    });

    it("groups line items by type with section headers", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        expect(screen.getByText("Batch Items")).toBeInTheDocument();
        expect(screen.getByText("Serialized Items")).toBeInTheDocument();
        // No BULK items in mock data, so header should not appear
        expect(screen.queryByText("Bulk Items")).not.toBeInTheDocument();
    });

    it("shows total items summary at bottom of line items card", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        // 2 unique products, 26 total units (25 batch + 1 serial)
        expect(screen.getByText("2 products, 26 total units")).toBeInTheDocument();
    });

    it("shows batch context: quantity and lot number", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        expect(screen.getByText("Qty: 25")).toBeInTheDocument();
        expect(screen.getByText("Lot: LOT-2026-Q2")).toBeInTheDocument();
    });

    it("shows serialized context: serial number and status badge", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        expect(screen.getByText("S/N: SN-5678")).toBeInTheDocument();
        expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    });

    it("shows InfoTip next to Add button", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        // InfoTip renders a button with the help icon
        const addButton = screen.getByText("Add");
        const container = addButton.closest(".flex.items-center.gap-3");
        expect(container).toBeTruthy();
        // InfoTip is a sibling button element
        const buttons = container!.querySelectorAll("button");
        expect(buttons.length).toBeGreaterThanOrEqual(2); // Add button + InfoTip button
    });

    it("renders Fulfill order button for an OPEN work order", () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        expect(screen.getByText("Fulfill order")).toBeInTheDocument();
    });

    it("fires a POST to the fulfill endpoint after confirming", async () => {
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        fireEvent.click(screen.getByText("Fulfill order"));
        // Confirmation dialog appears with the danger confirm action.
        expect(screen.getByText("Fulfill Work Order")).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));

        await waitFor(() => expect(mockCustomMutate).toHaveBeenCalled());
        const [payload] = mockCustomMutate.mock.calls[0];
        expect(payload.method).toBe("post");
        expect(payload.url).toContain("/work-orders/wo-uuid-123/fulfill/");
    });

    it("hides the Fulfill order button when status is CLOSED", () => {
        mockStatus = "CLOSED";
        render(
            <BrowserRouter>
                <WorkOrderShow />
            </BrowserRouter>,
        );

        expect(screen.queryByText("Fulfill order")).not.toBeInTheDocument();
    });
});
