import { render, screen } from "@testing-library/react";
import { WorkOrderCreate } from "./create";
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

const mockOnFinish = vi.fn();
const mockProductModels = [
    { id: "pm-1", name: "Widget Kit", sku: "WK-001", engine_type: "bucket" },
    { id: "pm-2", name: "Bolt", sku: "BLT-001", engine_type: "ledger", tracking_mode: "BULK" },
    { id: "pm-3", name: "Motor", sku: "MTR-001", engine_type: "ledger", tracking_mode: "INDIVIDUAL" },
];

vi.mock("@refinedev/core", () => ({
    useForm: () => ({
        onFinish: mockOnFinish,
        mutationResult: { isLoading: false, isError: false, error: null },
    }),
    useList: () => ({
        data: { data: mockProductModels },
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

    it("renders FormPage with correct title", () => {
        renderCreate();
        expect(screen.getByText("Create Work Order")).toBeInTheDocument();
    });

    it("renders Batch Definition section", () => {
        renderCreate();
        expect(screen.getByText("Batch Definition")).toBeInTheDocument();
        expect(
            screen.getByText("Optionally select a predefined kit model to auto-populate contents."),
        ).toBeInTheDocument();
    });

    it("renders Work Order Details section", () => {
        renderCreate();
        expect(screen.getByText("Work Order Details")).toBeInTheDocument();
        expect(
            screen.getByText("Basic information about this work order."),
        ).toBeInTheDocument();
    });

    it("renders name input field", () => {
        renderCreate();
        expect(screen.getByLabelText("Name", { selector: "input" })).toBeInTheDocument();
    });

    it("renders description textarea", () => {
        renderCreate();
        expect(screen.getByLabelText("Description")).toBeInTheDocument();
    });

    it("renders status select with default Open", () => {
        renderCreate();
        expect(screen.getByText("Status")).toBeInTheDocument();
        expect(screen.getByText("Open")).toBeInTheDocument();
    });

    it("renders Line Items section", () => {
        renderCreate();
        expect(screen.getByText("Line Items")).toBeInTheDocument();
        expect(
            screen.getByText("Configure the items and quantities for this work order."),
        ).toBeInTheDocument();
    });

    it("renders Add Item button", () => {
        renderCreate();
        expect(screen.getByText("Add Item")).toBeInTheDocument();
    });

    it("renders Save and Cancel buttons", () => {
        renderCreate();
        expect(screen.getByText("Save")).toBeInTheDocument();
        expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    it("renders Back link", () => {
        renderCreate();
        expect(screen.getByText("Back")).toBeInTheDocument();
    });
});
