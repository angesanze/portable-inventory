import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { CalculatorCreate } from "../CalculatorCreate";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockOnFinish = vi.fn();
vi.mock("@refinedev/core", () => ({
    useForm: () => ({
        onFinish: mockOnFinish,
        mutationResult: { isLoading: false, isError: false, error: null },
    }),
}));

vi.mock("../EngineConfigForm", () => ({
    EngineConfigForm: () => <div data-testid="engine-config-form" />,
}));

vi.mock("../FormulaPreview", () => ({
    FormulaPreview: () => <div data-testid="formula-preview" />,
}));

function renderComponent() {
    return render(
        <BrowserRouter>
            <CalculatorCreate />
        </BrowserRouter>,
    );
}

describe("CalculatorCreate", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders engine type cards instead of dropdown", () => {
        renderComponent();

        // Cards should be visible
        expect(screen.getByText("Counter")).toBeInTheDocument();
        expect(screen.getByText("Converter")).toBeInTheDocument();
        expect(screen.getByText("Bucket")).toBeInTheDocument();
        expect(screen.getByText("Tracker")).toBeInTheDocument();
        expect(screen.getByText("Dimension")).toBeInTheDocument();
        expect(screen.getByText("Time-Based")).toBeInTheDocument();

        // No select dropdown
        expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("shows description text for each engine type card", () => {
        renderComponent();

        expect(
            screen.getByText(
                "Simple add/subtract counting. Configure step size and labels.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Unit conversions with ratios. E.g., liters ↔ bottles.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Batch allocation strategies. FIFO, LIFO, or manual.",
            ),
        ).toBeInTheDocument();
    });

    it("shows profile hint for selected engine type", () => {
        renderComponent();

        // Counter is selected by default
        expect(screen.getByText(/Usually paired with:/)).toBeInTheDocument();
        expect(
            screen.getByText(/Simple Count, Assembled \/ Kit/),
        ).toBeInTheDocument();
    });

    it("updates profile hint when selecting different engine type", () => {
        renderComponent();

        fireEvent.click(screen.getByText("Converter"));

        expect(screen.getByText(/Unit Conversion/)).toBeInTheDocument();
    });

    it("applies indigo border to selected card", () => {
        renderComponent();

        // Counter card should have selected styling (default)
        const counterCard = screen.getByText("Counter").closest("button")!;
        expect(counterCard.className).toContain("border-indigo-500");

        // Converter should not
        const converterCard = screen.getByText("Converter").closest("button")!;
        expect(converterCard.className).not.toContain("border-indigo-500");

        // Click converter
        fireEvent.click(converterCard);
        expect(converterCard.className).toContain("border-indigo-500");
        expect(counterCard.className).not.toContain("border-indigo-500");
    });

    it("renders page title as Create Tracking Preset", () => {
        renderComponent();
        expect(screen.getByText("Create Tracking Preset")).toBeInTheDocument();
    });
});
