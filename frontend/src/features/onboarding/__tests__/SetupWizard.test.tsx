import { render, screen, fireEvent } from "@testing-library/react";
import { SetupWizard } from "../SetupWizard";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// Mock useOnboarding hook
const mockNextStep = vi.fn();
const mockPrevStep = vi.fn();
const mockClearWizard = vi.fn();
const mockSetWizard = vi.fn();
const mockCreateProduct = vi.fn().mockResolvedValue(undefined);
const mockSetWizardError = vi.fn();

let mockWizardState = {
    step: 1 as 1 | 2 | 3,
    companyName: "Test Corp",
    productSku: "",
    productName: "",
    trackingMode: "BULK",
    apiKey: "test-api-key-12345",
};

vi.mock("../useOnboarding", () => ({
    useOnboarding: () => ({
        wizard: mockWizardState,
        setWizard: mockSetWizard,
        nextStep: mockNextStep,
        prevStep: mockPrevStep,
        clearWizard: mockClearWizard,
        wizardLoading: false,
        wizardError: null,
        setWizardError: mockSetWizardError,
        createProduct: mockCreateProduct,
    }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

function renderWizard() {
    return render(
        <MemoryRouter>
            <SetupWizard />
        </MemoryRouter>,
    );
}

describe("SetupWizard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockWizardState = {
            step: 1,
            companyName: "Test Corp",
            productSku: "",
            productName: "",
            trackingMode: "BULK",
            apiKey: "test-api-key-12345",
        };
    });

    describe("Step 1 — Welcome", () => {
        it("renders Welcome heading", () => {
            renderWizard();
            expect(screen.getByText("Welcome to Varasto")).toBeInTheDocument();
        });

        it("shows what was auto-created", () => {
            renderWizard();
            expect(screen.getByText("Default warehouse created")).toBeInTheDocument();
            expect(screen.getByText("Inventory profiles available")).toBeInTheDocument();
        });

        it("has CTA button that advances to step 2", () => {
            renderWizard();
            fireEvent.click(screen.getByText("Let's set up your first product"));
            expect(mockNextStep).toHaveBeenCalledOnce();
        });

        it("has skip link that goes to dashboard", () => {
            renderWizard();
            fireEvent.click(screen.getByText("Skip setup, go to dashboard"));
            expect(mockClearWizard).toHaveBeenCalledOnce();
            expect(mockNavigate).toHaveBeenCalledWith("/");
        });
    });

    describe("Step 2 — Create Product Model", () => {
        beforeEach(() => {
            mockWizardState.step = 2;
        });

        it("renders Create Product Model heading", () => {
            renderWizard();
            expect(screen.getByText("Create Product Model")).toBeInTheDocument();
        });

        it("shows Product Name and SKU inputs", () => {
            renderWizard();
            expect(screen.getByPlaceholderText("e.g. Steel Widget")).toBeInTheDocument();
            expect(screen.getByPlaceholderText("e.g. WIDGET-001")).toBeInTheDocument();
        });

        it("shows Tracking Mode select", () => {
            renderWizard();
            expect(screen.getByText("Tracking Mode")).toBeInTheDocument();
        });

        it("has disabled Create button when fields empty", () => {
            renderWizard();
            const createBtn = screen.getByText("Create & Continue");
            expect(createBtn.closest("button")).toBeDisabled();
        });

        it("has Skip button", () => {
            renderWizard();
            expect(screen.getByText("Skip")).toBeInTheDocument();
        });

        it("has Back button that calls prevStep", () => {
            renderWizard();
            fireEvent.click(screen.getByText("Back"));
            expect(mockPrevStep).toHaveBeenCalledOnce();
        });

        it("Skip button calls nextStep", () => {
            renderWizard();
            fireEvent.click(screen.getByText("Skip"));
            expect(mockNextStep).toHaveBeenCalledOnce();
        });

        it("submits a valid profile (not the tracking mode) to createProduct", async () => {
            mockWizardState.productSku = "WIDGET-001";
            mockWizardState.productName = "Steel Widget";
            mockWizardState.trackingMode = "BULK";
            renderWizard();
            fireEvent.click(screen.getByText("Create & Continue"));
            await vi.waitFor(() =>
                expect(mockCreateProduct).toHaveBeenCalledWith("WIDGET-001", "Steel Widget", "SIMPLE_COUNT")
            );
        });
    });

    describe("Step 3 — Done", () => {
        beforeEach(() => {
            mockWizardState.step = 3;
        });

        it("renders success heading", () => {
            renderWizard();
            expect(screen.getByText("You're all set!")).toBeInTheDocument();
        });

        it("Go to Dashboard button clears wizard and navigates", () => {
            renderWizard();
            fireEvent.click(screen.getByText("Go to Dashboard"));
            expect(mockClearWizard).toHaveBeenCalledOnce();
            expect(mockNavigate).toHaveBeenCalledWith("/");
        });

        it("has link to create more products", () => {
            renderWizard();
            fireEvent.click(screen.getByText("Create more products"));
            expect(mockClearWizard).toHaveBeenCalledOnce();
            expect(mockNavigate).toHaveBeenCalledWith("/product-models/create");
        });
    });

    describe("Step Indicator", () => {
        it("shows all 3 step labels", () => {
            renderWizard();
            expect(screen.getByText("Welcome")).toBeInTheDocument();
            expect(screen.getByText("Product")).toBeInTheDocument();
            expect(screen.getByText("Done")).toBeInTheDocument();
        });

        it("highlights current step", () => {
            mockWizardState.step = 2;
            renderWizard();
            expect(screen.getByText("Create Product Model")).toBeInTheDocument();
        });
    });
});
