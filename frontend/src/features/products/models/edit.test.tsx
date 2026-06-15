import { screen, fireEvent, waitFor } from "@testing-library/react";
import { ProductModelEdit } from "./edit";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { renderWithI18n as render, i18n } from "../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ id: "test-uuid-123" }),
    };
});

/* ── Fixtures ──────────────────────────────────────────────────────── */

const mockModel = {
    id: "test-uuid-123",
    name: "Widget Alpha",
    sku: "WA-001",
    profile: "SIMPLE_COUNT",
    tracking_mode: "BULK",
    engine_type: "counter",
    engine_config: {},
    company: "c1",
    attributes: {},
    components: [],
    default_calculator: null as string | null,
};

const mockCalculatorTemplates = [
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

const mockOnFinish = vi.fn().mockResolvedValue({});
let currentModel = { ...mockModel };

vi.mock("@refinedev/core", () => ({
    useForm: () => ({
        onFinish: mockOnFinish,
        queryResult: {
            data: { data: currentModel },
            isLoading: false,
        },
        mutationResult: { isLoading: false },
    }),
    useList: (args: any) => {
        if (args?.resource === "calculator-templates") {
            return { data: { data: mockCalculatorTemplates } };
        }
        // product-models list for component selector
        return { data: { data: [currentModel] } };
    },
    // Inline giacenza editor reads the current stock level via useCustom.
    useCustom: () => ({
        data: { data: { total: 0 } },
        refetch: vi.fn(),
    }),
    // BulkStockEditor surfaces save results through useNotification.
    useNotification: () => ({ open: vi.fn(), close: vi.fn() }),
}));

beforeEach(() => {
    currentModel = { ...mockModel, default_calculator: null };
    mockOnFinish.mockClear();
    mockNavigate.mockClear();
});

/* ── Tests ─────────────────────────────────────────────────────────── */

describe("ProductModelEdit – Tracking Preset section", () => {
    it("renders Tracking Preset section", () => {
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );
        expect(screen.getByText("Tracking Preset")).toBeInTheDocument();
        expect(screen.getByText("Preset Assignment")).toBeInTheDocument();
        expect(screen.getByText("Active Preset")).toBeInTheDocument();
    });

    it("shows compatible presets only (counter engine type)", () => {
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );
        // Open the custom dropdown
        fireEvent.click(screen.getByRole("combobox"));

        // Should show counter presets
        expect(screen.getByText("Standard Counter")).toBeInTheDocument();
        expect(screen.getByText("Big Step Counter")).toBeInTheDocument();
        // Should NOT show converter preset
        expect(screen.queryByText("Liter Converter")).not.toBeInTheDocument();
    });

    it("shows 'None (use profile defaults)' option", () => {
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );
        fireEvent.click(screen.getByRole("combobox"));
        expect(screen.getAllByText("None (use profile defaults)").length).toBeGreaterThan(0);
    });

    it("shows compatible preset count in helper text", () => {
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );
        expect(screen.getByText(/2 compatible presets for counter engine/)).toBeInTheDocument();
    });

    it("shows default profile message when no preset selected", () => {
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );
        expect(
            screen.getByText("Using default profile settings. Assign a preset to customize engine behavior."),
        ).toBeInTheDocument();
    });

    it("loads existing preset assignment from record", () => {
        currentModel = {
            ...mockModel,
            default_calculator: "calc-1",
            engine_config: { step: 1, allow_negative: false },
        };
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );
        expect(screen.getByText("Preset configuration")).toBeInTheDocument();
        expect(screen.getByText("step:")).toBeInTheDocument();
        expect(screen.getByText(/allow_negative:/)).toBeInTheDocument();
    });

    it("includes default_calculator in form submission", async () => {
        currentModel = { ...mockModel, default_calculator: "calc-1" };
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );

        const saveBtn = screen.getByText("Save");
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(mockOnFinish).toHaveBeenCalledWith(
                expect.objectContaining({ default_calculator: "calc-1" }),
            );
        });
    });

    it("seeds engine_config from preset when one is selected", async () => {
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );

        // No preset → no preset configuration chips visible yet
        expect(screen.queryByText("Preset configuration")).not.toBeInTheDocument();

        // Pick "Standard Counter" preset (step:1, allow_negative:false)
        fireEvent.click(screen.getByRole("combobox"));
        fireEvent.click(screen.getByText("Standard Counter"));

        // Chips should show the preset's engine_config keys
        expect(screen.getByText("Preset configuration")).toBeInTheDocument();
        expect(screen.getByText("step:")).toBeInTheDocument();
        expect(screen.getByText(/allow_negative:/)).toBeInTheDocument();

        // Save → payload must contain default_calculator AND merged engine_config
        const saveBtn = screen.getByText("Save");
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(mockOnFinish).toHaveBeenCalledWith(
                expect.objectContaining({
                    default_calculator: "calc-1",
                    engine_config: expect.objectContaining({
                        step: 1,
                        allow_negative: false,
                    }),
                }),
            );
        });
    });

    it("switching preset replaces engine_config keys with new template's", async () => {
        currentModel = {
            ...mockModel,
            default_calculator: "calc-1",
            engine_config: { step: 1, allow_negative: false },
        };
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );

        // Switch to "Big Step Counter" (step:10, no allow_negative)
        fireEvent.click(screen.getByRole("combobox"));
        fireEvent.click(screen.getByText("Big Step Counter"));

        const saveBtn = screen.getByText("Save");
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(mockOnFinish).toHaveBeenCalledWith(
                expect.objectContaining({
                    default_calculator: "calc-2",
                    // step is overridden; previous allow_negative key remains merged
                    engine_config: expect.objectContaining({ step: 10 }),
                }),
            );
        });
    });

    it("renders nested status_transitions as readable arrows, not [object Object]", () => {
        currentModel = {
            ...mockModel,
            default_calculator: "calc-1",
            engine_config: {
                status_transitions: { ACTIVE: ["BROKEN"], BROKEN: ["REPAIRED"] },
            },
        };
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );
        expect(screen.queryByText(/\[object Object\]/)).toBeNull();
        expect(screen.getByText(/ACTIVE → BROKEN/)).toBeInTheDocument();
    });

    it("sends null when preset cleared to None", async () => {
        currentModel = { ...mockModel, default_calculator: "calc-1" };
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );

        // Open dropdown and select "None"
        fireEvent.click(screen.getByRole("combobox"));
        fireEvent.click(screen.getByText("None (use profile defaults)"));

        const saveBtn = screen.getByText("Save");
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(mockOnFinish).toHaveBeenCalledWith(
                expect.objectContaining({ default_calculator: null }),
            );
        });
    });
});

describe("ProductModelEdit – basic form sections", () => {
    it("renders Basic Information section", () => {
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );
        expect(screen.getByText("Basic Information")).toBeInTheDocument();
    });

    it("shows profile badge", () => {
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );
        expect(screen.getAllByText("Simple Count").length).toBeGreaterThan(0);
    });
});

describe("ProductModelEdit – DIMENSIONAL profile config", () => {
    it("renders Dimensional Configuration section with dimensions/unit/formula inputs", () => {
        currentModel = {
            ...mockModel,
            profile: "DIMENSIONAL",
            engine_type: "dimension",
            engine_config: { dimensions: ["length", "width"], unit: "m", computed_unit: "m²", formula: "length * width" },
        };
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );
        expect(screen.getAllByText("Dimensional Configuration").length).toBeGreaterThan(0);
        // DimensionConfig labels
        expect(screen.getByText(/^Dimensions/)).toBeInTheDocument();
        expect(screen.getByText(/^Formula/)).toBeInTheDocument();
        // existing values pre-populated as input values
        expect(screen.getByDisplayValue("length")).toBeInTheDocument();
        expect(screen.getByDisplayValue("width")).toBeInTheDocument();
        expect(screen.getByDisplayValue("m")).toBeInTheDocument();
        expect(screen.getByDisplayValue("m²")).toBeInTheDocument();
        expect(screen.getByDisplayValue("length * width")).toBeInTheDocument();
    });

    it("adds a new dimension when Add button is clicked", () => {
        currentModel = {
            ...mockModel,
            profile: "DIMENSIONAL",
            engine_type: "dimension",
            engine_config: { dimensions: ["length"], unit: "m", formula: "length" },
        };
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );
        // Initial: 1 dimension row
        expect(screen.getAllByPlaceholderText(/e\.g\. length, width, height/i)).toHaveLength(1);
        // DimensionConfig "Add" button sits next to "Dimensions" label
        const addBtn = screen.getAllByText("Add").find((el) => el.closest("button"));
        expect(addBtn).toBeDefined();
        fireEvent.click(addBtn!.closest("button")!);
        expect(screen.getAllByPlaceholderText(/e\.g\. length, width, height/i)).toHaveLength(2);
    });

    it("removes a dimension when its trash button is clicked", () => {
        currentModel = {
            ...mockModel,
            profile: "DIMENSIONAL",
            engine_type: "dimension",
            engine_config: { dimensions: ["length", "width"], unit: "m", formula: "length * width" },
        };
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );
        const inputs = screen.getAllByPlaceholderText(/e\.g\. length, width, height/i);
        expect(inputs).toHaveLength(2);
        // The trash button sits next to each dimension input as a sibling in the row.
        const firstRow = inputs[0].closest("div");
        const trashBtn = firstRow!.querySelector("button");
        expect(trashBtn).not.toBeNull();
        fireEvent.click(trashBtn!);
        const remaining = screen.getAllByPlaceholderText(/e\.g\. length, width, height/i);
        expect(remaining).toHaveLength(1);
        // Second dimension ("width") survives
        expect(screen.getByDisplayValue("width")).toBeInTheDocument();
        expect(screen.queryByDisplayValue("length")).not.toBeInTheDocument();
    });

    it("does NOT render Dimensional Configuration for SIMPLE_COUNT profile", () => {
        // Default mockModel is SIMPLE_COUNT
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );
        expect(screen.queryByText("Dimensional Configuration")).not.toBeInTheDocument();
    });
});

describe("ProductModelEdit – PERISHABLE profile config", () => {
    it("renders Perishable Configuration section with time_based controls", () => {
        currentModel = {
            ...mockModel,
            profile: "PERISHABLE",
            engine_type: "time_based",
            engine_config: { time_unit: "days", expiry_tracking: true, auto_decrement: false },
        };
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );
        expect(screen.getAllByText("Perishable Configuration").length).toBeGreaterThan(0);
        // TimeBasedConfig labels (hardcoded in EngineConfigForm)
        expect(screen.getByText(/^Time Unit/)).toBeInTheDocument();
        expect(screen.getByText("Enable expiry tracking")).toBeInTheDocument();
        expect(screen.getByText("Auto-decrement on expiry")).toBeInTheDocument();
    });

    it("does NOT render Perishable Configuration for non-PERISHABLE profiles", () => {
        render(
            <BrowserRouter>
                <ProductModelEdit />
            </BrowserRouter>,
        );
        expect(screen.queryByText("Perishable Configuration")).not.toBeInTheDocument();
        expect(screen.queryByText("Enable expiry tracking")).not.toBeInTheDocument();
    });
});

describe("ProductModelEdit – engine-config matrix", () => {
    // Discriminators: a string only the target engine's config block renders.
    // CounterConfig: "Step Size"
    // ConverterConfig: "Source Ratio Field"
    // BucketConfig: "Allocation Strategy"
    // TrackerConfig: "Status Transitions"
    // DimensionConfig: "/^Dimensions/" (label "Dimensions *") and "/^Formula/"
    // TimeBasedConfig: "Time Unit", "Enable expiry tracking"
    const matrix: Array<{
        profile: string;
        engine_type: string;
        title: string;
        present: RegExp | string;
        absent: Array<RegExp | string>;
    }> = [
        {
            profile: "SIMPLE_COUNT",
            engine_type: "counter",
            title: "Counter Configuration",
            present: "Step Size",
            absent: ["Source Ratio Field", "Allocation Strategy", "Status Transitions", "Time Unit"],
        },
        {
            profile: "UNIT_CONVERSION",
            engine_type: "converter",
            title: "Converter Configuration",
            present: "Source Ratio Field",
            absent: ["Step Size", "Allocation Strategy", "Status Transitions", "Time Unit"],
        },
        {
            profile: "DIMENSIONAL",
            engine_type: "dimension",
            title: "Dimensional Configuration",
            present: /^Formula/,
            absent: ["Step Size", "Source Ratio Field", "Allocation Strategy", "Status Transitions", "Time Unit"],
        },
        {
            profile: "BATCH_TRACKED",
            engine_type: "bucket",
            title: "Batch Configuration",
            present: "Allocation Strategy",
            absent: ["Step Size", "Source Ratio Field", "Status Transitions", "Time Unit", /^Formula/],
        },
        {
            profile: "PERISHABLE",
            engine_type: "time_based",
            title: "Perishable Configuration",
            present: "Enable expiry tracking",
            absent: ["Step Size", "Source Ratio Field", "Allocation Strategy", "Status Transitions", /^Formula/],
        },
        {
            profile: "SERIALIZED",
            engine_type: "tracker",
            title: "Status Tracking Configuration",
            present: "Status Transitions",
            absent: ["Step Size", "Source Ratio Field", "Allocation Strategy", "Time Unit", /^Formula/],
        },
        {
            profile: "ASSEMBLED",
            engine_type: "counter",
            title: "Counter Configuration",
            present: "Step Size",
            absent: ["Source Ratio Field", "Allocation Strategy", "Status Transitions", "Time Unit", /^Formula/],
        },
    ];

    for (const row of matrix) {
        it(`${row.profile} renders exactly the ${row.engine_type} engine-config block`, () => {
            currentModel = {
                ...mockModel,
                profile: row.profile,
                engine_type: row.engine_type,
                engine_config: {},
            };
            render(
                <BrowserRouter>
                    <ProductModelEdit />
                </BrowserRouter>,
            );
            // Right title — one form section per engine
            expect(screen.getAllByText(row.title).length).toBeGreaterThan(0);
            // Engine-specific control present
            expect(screen.getByText(row.present)).toBeInTheDocument();
            // Foreign engine controls absent
            for (const stranger of row.absent) {
                expect(screen.queryByText(stranger)).toBeNull();
            }
        });
    }
});

describe("ProductModelEdit – i18n", () => {
    it("renders edit-page strings in Italian when language is switched", async () => {
        try {
            await i18n.changeLanguage("it");
            render(
                <BrowserRouter>
                    <ProductModelEdit />
                </BrowserRouter>,
            );
            // Title interpolates the record name; section + preset labels translate
            expect(screen.getByText("Modifica Widget Alpha")).toBeInTheDocument();
            expect(screen.getByText("Informazioni di Base")).toBeInTheDocument();
            expect(screen.getByText("Preset di Tracciamento")).toBeInTheDocument();
            expect(screen.getByText("Assegnazione Preset")).toBeInTheDocument();
            expect(screen.getByText("Preset Attivo")).toBeInTheDocument();
            expect(
                screen.getByText(/2 preset compatibili per il motore counter/),
            ).toBeInTheDocument();
        } finally {
            await i18n.changeLanguage("en");
        }
    });
});
