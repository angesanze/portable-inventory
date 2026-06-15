import { render, screen, fireEvent } from "@testing-library/react";
import { WorkOrderCreate } from "../create";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockOnFinish = vi.fn().mockResolvedValue({ data: {} });
const mockProducts = [
    { id: "pm-1", name: "Widget Kit", sku: "WK-001", profile: "SIMPLE_COUNT", tracking_mode: "BULK", engine_type: "bucket" },
    { id: "pm-2", name: "Component A", sku: "CA-001", profile: "SIMPLE_COUNT", tracking_mode: "BULK", engine_type: "counter" },
];

vi.mock("@refinedev/core", () => ({
    useForm: () => ({
        onFinish: mockOnFinish,
        mutationResult: { isLoading: false, isError: false, error: null },
    }),
    useList: () => ({
        data: { data: mockProducts },
        isLoading: false,
    }),
    useOne: () => ({
        data: null,
        isLoading: false,
    }),
}));

function renderCreate() {
    return render(
        <BrowserRouter>
            <WorkOrderCreate />
        </BrowserRouter>,
    );
}

describe("WorkOrderCreate", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders page title", () => {
        renderCreate();
        expect(screen.getByText("Create Work Order")).toBeInTheDocument();
    });

    it("renders Purpose field with helper text", () => {
        renderCreate();
        expect(screen.getByText("Purpose")).toBeInTheDocument();
        expect(screen.getByText("What kind of operation is this work order for?")).toBeInTheDocument();
    });

    it("renders all form sections", () => {
        renderCreate();
        expect(screen.getByText("Batch Definition")).toBeInTheDocument();
        expect(screen.getByText("Work Order Details")).toBeInTheDocument();
        expect(screen.getByText("Line Items")).toBeInTheDocument();
    });

    it("shows Purpose options when clicked", () => {
        renderCreate();
        const purposeSelect = screen.getByText("None (skip)");
        fireEvent.click(purposeSelect);
        expect(screen.getByText("Assembly")).toBeInTheDocument();
        expect(screen.getByText("Kitting / Packing")).toBeInTheDocument();
        expect(screen.getByText("Fulfillment")).toBeInTheDocument();
        expect(screen.getByText("Production Run")).toBeInTheDocument();
        expect(screen.getByText("Other")).toBeInTheDocument();
    });

    it("shows description for each purpose option", () => {
        renderCreate();
        fireEvent.click(screen.getByText("None (skip)"));
        expect(screen.getByText("Building a finished product from components")).toBeInTheDocument();
        expect(screen.getByText("Grouping items into a set or package")).toBeInTheDocument();
        expect(screen.getByText("Preparing items for delivery or shipment")).toBeInTheDocument();
    });

    it("submits without purpose tag when no purpose selected", async () => {
        renderCreate();
        const nameInput = screen.getByPlaceholderText("e.g. Project Alpha, Kit #101");
        fireEvent.change(nameInput, { target: { value: "Test Order" } });

        const submitButton = screen.getByRole("button", { name: /create|save|submit/i });
        fireEvent.click(submitButton);

        await vi.waitFor(() => {
            expect(mockOnFinish).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: "Test Order",
                    description: "",
                }),
            );
        });
    });

    it("prepends purpose tag to description on submit", async () => {
        renderCreate();

        // Select purpose
        fireEvent.click(screen.getByText("None (skip)"));
        fireEvent.click(screen.getByText("Assembly"));

        // Fill name
        const nameInput = screen.getByPlaceholderText("e.g. Project Alpha, Kit #101");
        fireEvent.change(nameInput, { target: { value: "Build Run #1" } });

        // Fill description
        const descInput = screen.getByPlaceholderText("Internal notes, customer details, or special instructions...");
        fireEvent.change(descInput, { target: { value: "First assembly" } });

        const submitButton = screen.getByRole("button", { name: /create|save|submit/i });
        fireEvent.click(submitButton);

        await vi.waitFor(() => {
            expect(mockOnFinish).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: "[Assembly] First assembly",
                }),
            );
        });
    });

    it("purpose field is optional — does not block submission", async () => {
        renderCreate();
        const nameInput = screen.getByPlaceholderText("e.g. Project Alpha, Kit #101");
        fireEvent.change(nameInput, { target: { value: "No Purpose Order" } });

        const submitButton = screen.getByRole("button", { name: /create|save|submit/i });
        fireEvent.click(submitButton);

        await vi.waitFor(() => {
            expect(mockOnFinish).toHaveBeenCalledOnce();
        });
    });
});
