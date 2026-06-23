import { screen, fireEvent, waitFor } from "@testing-library/react";
import { ProductModelCreate } from "./create";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { renderWithI18n as render } from "../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useSearchParams: () => [new URLSearchParams(), vi.fn()],
    };
});

const mockTemplates = [
    {
        id: "calc-1",
        name: "Standard Counter",
        engine_type: "counter",
        engine_config: { step: 1, allow_negative: false },
        company: "c1",
    },
    {
        id: "calc-2",
        name: "Big Step Counter",
        engine_type: "counter",
        engine_config: { step: 10 },
        company: "c1",
    },
    {
        id: "calc-3",
        name: "Liter Converter",
        engine_type: "converter",
        engine_config: { ratio: 0.5 },
        company: "c1",
    },
];

const mockOnFinish = vi.fn().mockResolvedValue({ data: { id: "new-uuid" } });

vi.mock("@refinedev/core", () => ({
    useForm: () => ({
        onFinish: mockOnFinish,
        mutationResult: { isLoading: false, isError: false, error: null },
    }),
    useList: (args: { resource?: string }) => {
        if (args?.resource === "calculator-templates") {
            return { data: { data: mockTemplates } };
        }
        return { data: { data: [] } };
    },
    useNotification: () => ({ open: vi.fn(), close: vi.fn() }),
}));

beforeEach(() => {
    mockOnFinish.mockClear();
    mockNavigate.mockClear();
    // ProfileWizard reads this on mount; force wizard mode for deterministic UI
    try { localStorage.setItem("profileWizardPreference", "wizard"); } catch { /* noop */ }
});

function pickSimpleCountProfile() {
    // Step 1: choose category "By Quantity"
    fireEvent.click(screen.getByText("By Quantity"));
    // Step 2: choose "Just count them" → SIMPLE_COUNT (engineType: counter)
    fireEvent.click(screen.getByText("Just count them"));
}

describe("ProductModelCreate – Tracking Preset section", () => {
    it("does not render preset Select before a profile is picked", () => {
        render(
            <BrowserRouter>
                <ProductModelCreate />
            </BrowserRouter>,
        );
        expect(screen.queryByText("Tracking Preset")).not.toBeInTheDocument();
        expect(screen.queryByText("Active Preset")).not.toBeInTheDocument();
    });

    it("renders preset Select after a profile is picked", () => {
        render(
            <BrowserRouter>
                <ProductModelCreate />
            </BrowserRouter>,
        );
        pickSimpleCountProfile();
        expect(screen.getByText("Tracking Preset")).toBeInTheDocument();
        expect(screen.getByText("Active Preset")).toBeInTheDocument();
    });

    it("filters templates by the profile's engine type (counter, no converter)", () => {
        render(
            <BrowserRouter>
                <ProductModelCreate />
            </BrowserRouter>,
        );
        pickSimpleCountProfile();

        // Open the preset dropdown — the only combobox on the form once profile is picked
        const comboboxes = screen.getAllByRole("combobox");
        // Profile dropdown isn't rendered in wizard mode, so the preset Select is the lone combobox
        fireEvent.click(comboboxes[comboboxes.length - 1]);

        expect(screen.getByText("Standard Counter")).toBeInTheDocument();
        expect(screen.getByText("Big Step Counter")).toBeInTheDocument();
        expect(screen.queryByText("Liter Converter")).not.toBeInTheDocument();
    });

    it("shows compatible preset count in helper text", () => {
        render(
            <BrowserRouter>
                <ProductModelCreate />
            </BrowserRouter>,
        );
        pickSimpleCountProfile();
        expect(screen.getByText(/2 compatible presets for counter engine/)).toBeInTheDocument();
    });

    it("submits payload with default_calculator + merged engine_config when a preset is chosen", async () => {
        render(
            <BrowserRouter>
                <ProductModelCreate />
            </BrowserRouter>,
        );
        pickSimpleCountProfile();

        // Fill required fields
        const skuInput = screen.getByPlaceholderText("e.g. LAPTOP-001");
        fireEvent.change(skuInput, { target: { value: "X-1" } });

        const nameInput = screen.getByPlaceholderText("e.g. MacBook Pro 16");
        fireEvent.change(nameInput, { target: { value: "Test Product" } });

        // Pick a preset
        const comboboxes = screen.getAllByRole("combobox");
        fireEvent.click(comboboxes[comboboxes.length - 1]);
        fireEvent.click(screen.getByText("Standard Counter"));

        fireEvent.click(screen.getByText("Save"));

        await waitFor(() => {
            expect(mockOnFinish).toHaveBeenCalledWith(
                expect.objectContaining({
                    default_calculator: "calc-1",
                    profile: "SIMPLE_COUNT",
                    engine_config: expect.objectContaining({
                        step: 1,
                        allow_negative: false,
                    }),
                }),
            );
        });
    });

    it("renders Dimensional Configuration section when DIMENSIONAL profile is picked", () => {
        render(
            <BrowserRouter>
                <ProductModelCreate />
            </BrowserRouter>,
        );
        // Step 1: choose category "By Quantity"
        fireEvent.click(screen.getByText("By Quantity"));
        // Step 2: choose "Measure dimensions" → DIMENSIONAL
        fireEvent.click(screen.getByText("Measure dimensions (length, area, volume)"));

        expect(screen.getByText("Dimensional Configuration")).toBeInTheDocument();
        // DimensionConfig labels (rendered by EngineConfigForm)
        expect(screen.getByText(/^Dimensions/)).toBeInTheDocument();
        expect(screen.getByText(/^Formula/)).toBeInTheDocument();
        // Add button to grow dimensions array
        expect(screen.getAllByText("Add").length).toBeGreaterThan(0);
    });

    it("does NOT render Dimensional Configuration for SIMPLE_COUNT profile", () => {
        render(
            <BrowserRouter>
                <ProductModelCreate />
            </BrowserRouter>,
        );
        pickSimpleCountProfile();
        expect(screen.queryByText("Dimensional Configuration")).not.toBeInTheDocument();
    });

    it("submits engine_config with dimensions/formula entered for DIMENSIONAL", async () => {
        render(
            <BrowserRouter>
                <ProductModelCreate />
            </BrowserRouter>,
        );
        fireEvent.click(screen.getByText("By Quantity"));
        fireEvent.click(screen.getByText("Measure dimensions (length, area, volume)"));

        // Fill required fields
        fireEvent.change(screen.getByPlaceholderText("e.g. LAPTOP-001"), {
            target: { value: "FAB-1" },
        });
        fireEvent.change(screen.getByPlaceholderText("e.g. MacBook Pro 16"), {
            target: { value: "Fabric" },
        });

        // Add a dimension and type its name
        const addBtn = screen.getAllByText("Add").find((el) => el.closest("button"));
        fireEvent.click(addBtn!.closest("button")!);
        const dimInput = screen.getByPlaceholderText(/e\.g\. length, width, height/i);
        fireEvent.change(dimInput, { target: { value: "length" } });

        // Unit + formula
        fireEvent.change(screen.getByPlaceholderText(/e\.g\. m, ft, cm/i), {
            target: { value: "m" },
        });
        fireEvent.change(screen.getByPlaceholderText(/e\.g\. length \* width/i), {
            target: { value: "length" },
        });

        fireEvent.click(screen.getByText("Save"));

        await waitFor(() => {
            expect(mockOnFinish).toHaveBeenCalledWith(
                expect.objectContaining({
                    profile: "DIMENSIONAL",
                    engine_config: expect.objectContaining({
                        dimensions: ["length"],
                        unit: "m",
                        formula: "length",
                    }),
                }),
            );
        });
    });

    it("renders Initial Batch section when PERISHABLE profile is picked", () => {
        render(
            <BrowserRouter>
                <ProductModelCreate />
            </BrowserRouter>,
        );
        fireEvent.click(screen.getByText("By Batch / Lot"));
        fireEvent.click(screen.getByText("Perishable (with expiry dates)"));

        expect(screen.getByText("Initial Batch")).toBeInTheDocument();
        expect(screen.getByText("Batch Identifier")).toBeInTheDocument();
        expect(screen.getByText("Expiry Date")).toBeInTheDocument();
    });

    it("does NOT render Initial Batch section for SIMPLE_COUNT", () => {
        render(
            <BrowserRouter>
                <ProductModelCreate />
            </BrowserRouter>,
        );
        pickSimpleCountProfile();
        expect(screen.queryByText("Initial Batch")).not.toBeInTheDocument();
    });

    it("submits initial_batch in payload for PERISHABLE", async () => {
        render(
            <BrowserRouter>
                <ProductModelCreate />
            </BrowserRouter>,
        );
        fireEvent.click(screen.getByText("By Batch / Lot"));
        fireEvent.click(screen.getByText("Perishable (with expiry dates)"));

        fireEvent.change(screen.getByPlaceholderText("e.g. LAPTOP-001"), {
            target: { value: "YOG-1" },
        });
        fireEvent.change(screen.getByPlaceholderText("e.g. MacBook Pro 16"), {
            target: { value: "Yogurt" },
        });

        fireEvent.change(screen.getByPlaceholderText("e.g. LOT-2026-01"), {
            target: { value: "L1" },
        });
        fireEvent.change(screen.getByPlaceholderText("Manufacturer lot, if any"), {
            target: { value: "LOT-001" },
        });
        // Initial Quantity input — second numeric input on the form (after expiry date)
        const numericInputs = screen.getAllByPlaceholderText("0");
        fireEvent.change(numericInputs[numericInputs.length - 1], { target: { value: "10" } });

        fireEvent.click(screen.getByText("Save"));

        await waitFor(() => {
            expect(mockOnFinish).toHaveBeenCalledWith(
                expect.objectContaining({
                    profile: "PERISHABLE",
                    initial_batch: expect.objectContaining({
                        batch_identifier: "L1",
                        initial_quantity: 10,
                        lot_number: "LOT-001",
                    }),
                }),
            );
        });
    });

    it("renders Initial Batch section when BATCH_TRACKED profile is picked (no Expiry Date)", () => {
        render(
            <BrowserRouter>
                <ProductModelCreate />
            </BrowserRouter>,
        );
        fireEvent.click(screen.getByText("By Batch / Lot"));
        fireEvent.click(screen.getByText("Standard batches (lot number tracking)"));

        expect(screen.getByText("Initial Batch")).toBeInTheDocument();
        expect(screen.getByText("Batch Identifier")).toBeInTheDocument();
        expect(screen.queryByText("Expiry Date")).not.toBeInTheDocument();
    });

    it("submits initial_batch in payload for BATCH_TRACKED without expiry_date", async () => {
        render(
            <BrowserRouter>
                <ProductModelCreate />
            </BrowserRouter>,
        );
        fireEvent.click(screen.getByText("By Batch / Lot"));
        fireEvent.click(screen.getByText("Standard batches (lot number tracking)"));

        fireEvent.change(screen.getByPlaceholderText("e.g. LAPTOP-001"), {
            target: { value: "CHEM-1" },
        });
        fireEvent.change(screen.getByPlaceholderText("e.g. MacBook Pro 16"), {
            target: { value: "Reagent" },
        });
        fireEvent.change(screen.getByPlaceholderText("e.g. LOT-2026-01"), {
            target: { value: "BATCH-A" },
        });
        fireEvent.change(screen.getByPlaceholderText("Manufacturer lot, if any"), {
            target: { value: "LOT-77" },
        });
        const numericInputs = screen.getAllByPlaceholderText("0");
        fireEvent.change(numericInputs[numericInputs.length - 1], { target: { value: "25" } });

        fireEvent.click(screen.getByText("Save"));

        await waitFor(() => {
            expect(mockOnFinish).toHaveBeenCalledWith(
                expect.objectContaining({
                    profile: "BATCH_TRACKED",
                    initial_batch: expect.objectContaining({
                        batch_identifier: "BATCH-A",
                        initial_quantity: 25,
                        lot_number: "LOT-77",
                    }),
                }),
            );
        });
        const payload = mockOnFinish.mock.calls[0][0];
        expect(payload.initial_batch).not.toHaveProperty("expiry_date");
    });

    it("omits default_calculator from payload when no preset is selected", async () => {
        render(
            <BrowserRouter>
                <ProductModelCreate />
            </BrowserRouter>,
        );
        pickSimpleCountProfile();

        const skuInput = screen.getByPlaceholderText("e.g. LAPTOP-001");
        fireEvent.change(skuInput, { target: { value: "X-2" } });
        const nameInput = screen.getByPlaceholderText("e.g. MacBook Pro 16");
        fireEvent.change(nameInput, { target: { value: "No Preset Product" } });

        fireEvent.click(screen.getByText("Save"));

        await waitFor(() => {
            expect(mockOnFinish).toHaveBeenCalled();
        });
        const payload = mockOnFinish.mock.calls[0][0];
        expect(payload).not.toHaveProperty("default_calculator");
        expect(payload.profile).toBe("SIMPLE_COUNT");
    });
});
