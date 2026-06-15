import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RegisterPage } from "../RegisterPage";
import { ToastProvider } from "../../../components/ui/Toast";

const mockRegister = vi.fn();
const mockNavigate = vi.fn();

const mockState = vi.hoisted(() => ({
    isRegistering: false,
    registerError: null as string | null,
}));

vi.mock("../useOnboarding", () => ({
    useOnboarding: () => ({
        register: mockRegister,
        isRegistering: mockState.isRegistering,
        registerError: mockState.registerError,
    }),
}));

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const renderRegister = () =>
    render(
        <ToastProvider>
            <MemoryRouter>
                <RegisterPage />
            </MemoryRouter>
        </ToastProvider>
    );

const successResult = {
    tokens: { access: "a", refresh: "r" },
    company: { id: "1", name: "Acme Corp", license_code: "ABC123", industry_type: "other", vat: "00743110157" },
};

const fillForm = () => {
    fireEvent.change(screen.getByLabelText("Company Name"), {
        target: { value: "Acme Corp" },
    });
    fireEvent.change(screen.getByLabelText("Admin Email"), {
        target: { value: "admin@acme.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("VAT (Partita IVA)"), {
        target: { value: "00743110157" },
    });
    fireEvent.change(screen.getByLabelText("Industry"), {
        target: { value: "manufacturing" },
    });
};

describe("RegisterPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.isRegistering = false;
        mockState.registerError = null;
    });

    it("renders app name and subtitle", () => {
        renderRegister();
        expect(screen.getByText("Varasto")).toBeInTheDocument();
        expect(screen.getByText("Create your account")).toBeInTheDocument();
    });

    it("renders all form fields", () => {
        renderRegister();
        expect(screen.getByLabelText("Company Name")).toBeInTheDocument();
        expect(screen.getByLabelText("Admin Email")).toBeInTheDocument();
        expect(screen.getByLabelText("Password")).toBeInTheDocument();
        expect(screen.getByLabelText("VAT (Partita IVA)")).toBeInTheDocument();
        expect(screen.getByLabelText("Industry")).toBeInTheDocument();
    });

    it("renders create account button", () => {
        renderRegister();
        expect(
            screen.getByRole("button", { name: /create account/i })
        ).toBeInTheDocument();
    });

    it("renders sign in link", () => {
        renderRegister();
        expect(screen.getByText("Sign in")).toBeInTheDocument();
    });

    it("calls register with form data (including vat) on submit", async () => {
        mockRegister.mockResolvedValue(successResult);
        renderRegister();

        fillForm();
        fireEvent.click(screen.getByRole("button", { name: /create account/i }));

        await waitFor(() => {
            expect(mockRegister).toHaveBeenCalledWith({
                company_name: "Acme Corp",
                admin_email: "admin@acme.com",
                admin_password: "password123",
                industry_type: "manufacturing",
                vat: "00743110157",
            });
        });
    });

    it("shows the license code after successful registration", async () => {
        mockRegister.mockResolvedValue(successResult);
        renderRegister();

        fillForm();
        fireEvent.click(screen.getByRole("button", { name: /create account/i }));

        await waitFor(() => {
            expect(screen.getByText("ABC123")).toBeInTheDocument();
        });
        expect(screen.getByText("Account created")).toBeInTheDocument();
        // Does NOT navigate until the user continues.
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("navigates to /setup when continuing after registration", async () => {
        mockRegister.mockResolvedValue(successResult);
        renderRegister();

        fillForm();
        fireEvent.click(screen.getByRole("button", { name: /create account/i }));

        await waitFor(() => {
            expect(screen.getByText("ABC123")).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: /continue to setup/i }));
        expect(mockNavigate).toHaveBeenCalledWith("/setup");
    });

    it("does not show license code on failed registration", async () => {
        mockRegister.mockResolvedValue(null);
        renderRegister();

        fillForm();
        fireEvent.click(screen.getByRole("button", { name: /create account/i }));

        await waitFor(() => {
            expect(mockRegister).toHaveBeenCalled();
        });
        expect(mockNavigate).not.toHaveBeenCalled();
        expect(screen.queryByText("Account created")).not.toBeInTheDocument();
    });

    it("displays error message", () => {
        mockState.registerError = "Email already registered";
        renderRegister();
        expect(screen.getByText("Email already registered")).toBeInTheDocument();
    });

    it("defaults industry to other", () => {
        renderRegister();
        expect(screen.getByLabelText("Industry")).toHaveValue("other");
    });
});
