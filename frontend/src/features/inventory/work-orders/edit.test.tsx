import { render, screen } from "@testing-library/react";
import { WorkOrderEdit } from "./edit";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ id: "wo-123" }),
    };
});

const mockOnFinish = vi.fn();
const mockWorkOrder = {
    id: "wo-123",
    name: "Test Batch",
    description: "Some notes",
    status: "OPEN",
};

vi.mock("@refinedev/core", () => ({
    useForm: () => ({
        onFinish: mockOnFinish,
        queryResult: { data: { data: mockWorkOrder } },
        formLoading: false,
        mutationResult: { isLoading: false, isError: false, error: null },
    }),
}));

function renderEdit() {
    return render(
        <BrowserRouter>
            <WorkOrderEdit />
        </BrowserRouter>,
    );
}

describe("WorkOrderEdit", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders FormPage with correct title", () => {
        renderEdit();
        expect(screen.getByText("Edit Work Order")).toBeInTheDocument();
    });

    it("renders Work Order Details section with description", () => {
        renderEdit();
        expect(screen.getByText("Work Order Details")).toBeInTheDocument();
        expect(
            screen.getByText("Update name, description, and status for this work order."),
        ).toBeInTheDocument();
    });

    it("renders name input populated from record", () => {
        renderEdit();
        const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
        expect(nameInput).toBeInTheDocument();
        expect(nameInput.value).toBe("Test Batch");
    });

    it("renders description textarea populated from record", () => {
        renderEdit();
        const descInput = screen.getByLabelText("Description") as HTMLTextAreaElement;
        expect(descInput).toBeInTheDocument();
        expect(descInput.value).toBe("Some notes");
    });

    it("renders status select with current value", () => {
        renderEdit();
        expect(screen.getByText("Status")).toBeInTheDocument();
        expect(screen.getByText("Open")).toBeInTheDocument();
    });

    it("renders Save and Cancel buttons", () => {
        renderEdit();
        expect(screen.getByText("Save")).toBeInTheDocument();
        expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    it("renders Back link", () => {
        renderEdit();
        expect(screen.getByText("Back")).toBeInTheDocument();
    });
});
