
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { ProductModelCreate } from "./models/create";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { renderWithI18n as render, i18n } from "../../test-utils/i18n-wrapper";

// Mock Navigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

// Mock Refine hooks
const mockForm = {
    onFinish: vi.fn(),
    mutationResult: { isLoading: false, isSuccess: false, isError: false, error: null },
    formLoading: false
};

vi.mock("@refinedev/core", () => ({
    useForm: () => mockForm,
    useList: (props: { resource?: string }) => {
        if (props?.resource === "locations") {
            return {
                data: {
                    data: [
                        { id: "loc1", name: "Main Warehouse", type: "PHYSICAL" }
                    ]
                },
                isLoading: false
            };
        }
        return { data: { data: [] } };
    },
    useSelect: () => ({
        options: [],
        queryResult: {}
    }),
    useNavigation: () => ({ list: vi.fn() })
}));

describe("ProductModelCreate Form", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it("renders form with Basic Information and Inventory Profile sections", () => {
        render(
            <BrowserRouter>
                <ProductModelCreate />
            </BrowserRouter>
        );
        expect(screen.getByText("Basic Information")).toBeInTheDocument();
        expect(screen.getByText("Inventory Profile")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("e.g. LAPTOP-001")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("e.g. MacBook Pro 16")).toBeInTheDocument();
    });

    it("renders wizard with three tracking categories by default", () => {
        render(<BrowserRouter><ProductModelCreate /></BrowserRouter>);
        expect(screen.getByText("By Quantity")).toBeInTheDocument();
        expect(screen.getByText("By Batch / Lot")).toBeInTheDocument();
        expect(screen.getByText("Individually")).toBeInTheDocument();
    });

    it("Simple Count via wizard: quantity → just count them", async () => {
        render(<BrowserRouter><ProductModelCreate /></BrowserRouter>);

        fireEvent.change(screen.getByPlaceholderText("e.g. LAPTOP-001"), { target: { value: "BULK-100" } });
        fireEvent.change(screen.getByPlaceholderText("e.g. MacBook Pro 16"), { target: { value: "Box of Nails" } });

        // Step 1: select By Quantity
        fireEvent.click(screen.getByText("By Quantity"));
        // Step 2: select Just count them
        await waitFor(() => {
            expect(screen.getByText("Just count them")).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText("Just count them"));

        fireEvent.click(screen.getByText("Save"));

        await waitFor(() => {
            expect(mockForm.onFinish).toHaveBeenCalledWith(expect.objectContaining({
                name: "Box of Nails",
                sku: "BULK-100",
                profile: "SIMPLE_COUNT",
            }));
        });
    });

    it("Serialized product via wizard: individually", async () => {
        render(<BrowserRouter><ProductModelCreate /></BrowserRouter>);

        fireEvent.change(screen.getByPlaceholderText("e.g. LAPTOP-001"), { target: { value: "SER-200" } });
        fireEvent.change(screen.getByPlaceholderText("e.g. MacBook Pro 16"), { target: { value: "Power Drill" } });

        // Click Individually — directly selects SERIALIZED
        fireEvent.click(screen.getByText("Individually"));

        fireEvent.click(screen.getByText("Save"));

        await waitFor(() => {
            expect(mockForm.onFinish).toHaveBeenCalledWith(expect.objectContaining({
                name: "Power Drill",
                sku: "SER-200",
                profile: "SERIALIZED",
            }));
        });
    });

    it("Dimensional profile shows formula field via wizard", async () => {
        render(<BrowserRouter><ProductModelCreate /></BrowserRouter>);

        fireEvent.click(screen.getByText("By Quantity"));
        await waitFor(() => {
            expect(screen.getByText("Measure dimensions (length, area, volume)")).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText("Measure dimensions (length, area, volume)"));

        await waitFor(() => {
            // DIMENSIONAL profile reveals the dimension engine config section,
            // whose title is "Dimensional Configuration" and which exposes the
            // formula field (placeholder "e.g. length * width").
            expect(screen.getByText("Dimensional Configuration")).toBeInTheDocument();
            expect(screen.getByPlaceholderText("e.g. length * width")).toBeInTheDocument();
        });
    });

    it("does not show advanced config or initial stock before profile is selected", () => {
        render(<BrowserRouter><ProductModelCreate /></BrowserRouter>);
        expect(screen.queryByText("Advanced Configuration")).not.toBeInTheDocument();
        expect(screen.queryByText("Initial Stock")).not.toBeInTheDocument();
    });

    it("shows initial stock section for BULK profiles", async () => {
        render(<BrowserRouter><ProductModelCreate /></BrowserRouter>);

        fireEvent.click(screen.getByText("By Quantity"));
        await waitFor(() => {
            expect(screen.getByText("Just count them")).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText("Just count them"));

        await waitFor(() => {
            expect(screen.getByText("Initial Stock")).toBeInTheDocument();
        });
    });

    it("escape hatch switches to dropdown mode", async () => {
        render(<BrowserRouter><ProductModelCreate /></BrowserRouter>);

        fireEvent.click(screen.getByText("I already know my profile type →"));

        await waitFor(() => {
            expect(screen.getByRole("combobox")).toBeInTheDocument();
        });
        expect(localStorage.getItem("profileWizardPreference")).toBe("dropdown");
    });

    it("dropdown mode shows switch-back link", async () => {
        localStorage.setItem("profileWizardPreference", "dropdown");
        render(<BrowserRouter><ProductModelCreate /></BrowserRouter>);

        expect(screen.getByRole("combobox")).toBeInTheDocument();
        expect(screen.getByText("Use guided selection →")).toBeInTheDocument();
    });

    it("shows profile info card when profile selected via wizard", async () => {
        render(<BrowserRouter><ProductModelCreate /></BrowserRouter>);

        fireEvent.click(screen.getByText("Individually"));

        await waitFor(() => {
            expect(screen.getByText("Serialized / Individual")).toBeInTheDocument();
            expect(screen.getByText(/Unique items tracked by serial number/)).toBeInTheDocument();
        });
    });

    it("batch wizard shows sub-options", async () => {
        render(<BrowserRouter><ProductModelCreate /></BrowserRouter>);

        fireEvent.click(screen.getByText("By Batch / Lot"));

        await waitFor(() => {
            expect(screen.getByText("Standard batches (lot number tracking)")).toBeInTheDocument();
            expect(screen.getByText("Perishable (with expiry dates)")).toBeInTheDocument();
        });
    });

    it("renders create-page strings in Italian when language is switched", async () => {
        try {
            await i18n.changeLanguage("it");
            render(<BrowserRouter><ProductModelCreate /></BrowserRouter>);
            expect(screen.getByText("Crea Modello Prodotto")).toBeInTheDocument();
            expect(screen.getByText("Informazioni di Base")).toBeInTheDocument();
            expect(screen.getByText("Profilo Inventario")).toBeInTheDocument();
            expect(screen.getByPlaceholderText("es. LAPTOP-001")).toBeInTheDocument();
        } finally {
            await i18n.changeLanguage("en");
        }
    });

    it("renders ProfileWizard category cards in Italian when language is switched", async () => {
        try {
            await i18n.changeLanguage("it");
            render(<BrowserRouter><ProductModelCreate /></BrowserRouter>);
            expect(screen.getByText("Per Quantità")).toBeInTheDocument();
            expect(screen.getByText("Per Lotto")).toBeInTheDocument();
            expect(screen.getByText("Singolarmente")).toBeInTheDocument();

            // Step 2 sub-options and prompt translate too
            fireEvent.click(screen.getByText("Per Lotto"));
            await waitFor(() => {
                expect(screen.getByText("Che tipo di tracciamento per lotti?")).toBeInTheDocument();
                expect(screen.getByText("Lotti standard (tracciamento numero di lotto)")).toBeInTheDocument();
            });
        } finally {
            await i18n.changeLanguage("en");
        }
    });

    it("Simple Count via dropdown mode sends profile field", async () => {
        localStorage.setItem("profileWizardPreference", "dropdown");
        render(<BrowserRouter><ProductModelCreate /></BrowserRouter>);

        fireEvent.change(screen.getByPlaceholderText("e.g. LAPTOP-001"), { target: { value: "BULK-100" } });
        fireEvent.change(screen.getByPlaceholderText("e.g. MacBook Pro 16"), { target: { value: "Box of Nails" } });

        const profileTrigger = screen.getByRole("combobox");
        fireEvent.click(profileTrigger);
        fireEvent.click(screen.getByText("Simple Count"));

        fireEvent.click(screen.getByText("Save"));

        await waitFor(() => {
            expect(mockForm.onFinish).toHaveBeenCalledWith(expect.objectContaining({
                name: "Box of Nails",
                sku: "BULK-100",
                profile: "SIMPLE_COUNT",
            }));
        });
    });
});
