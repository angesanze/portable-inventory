import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Login } from "../Login";

const mockLogin = vi.fn();
const mockNavigate = vi.fn();

const mockState = vi.hoisted(() => ({
    isPending: false,
    error: null as { message: string } | null,
    authenticated: false,
}));

vi.mock("@refinedev/core", () => ({
    useLogin: () => ({
        mutate: mockLogin,
        isPending: mockState.isPending,
        error: mockState.error,
    }),
    useIsAuthenticated: () => ({
        data: { authenticated: mockState.authenticated },
    }),
}));

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const renderLogin = () =>
    render(
        <MemoryRouter>
            <Login />
        </MemoryRouter>
    );

describe("Login", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.isPending = false;
        mockState.error = null;
        mockState.authenticated = false;
    });

    it("renders app name and subtitle", () => {
        renderLogin();
        expect(screen.getByText("Varasto")).toBeInTheDocument();
        expect(screen.getByText("Sign in to your account")).toBeInTheDocument();
    });

    it("renders email and password inputs", () => {
        renderLogin();
        expect(screen.getByLabelText("Email")).toBeInTheDocument();
        expect(screen.getByLabelText("Password")).toBeInTheDocument();
    });

    it("renders license code input", () => {
        renderLogin();
        expect(screen.getByLabelText("License code")).toBeInTheDocument();
    });

    it("renders sign in button", () => {
        renderLogin();
        expect(
            screen.getByRole("button", { name: /sign in/i })
        ).toBeInTheDocument();
    });

    it("renders register link", () => {
        renderLogin();
        expect(screen.getByText("Register")).toBeInTheDocument();
    });

    it("calls login with credentials on submit", async () => {
        renderLogin();

        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "user@test.com" },
        });
        fireEvent.change(screen.getByLabelText("Password"), {
            target: { value: "secret123" },
        });
        fireEvent.change(screen.getByLabelText("License code"), {
            target: { value: "ABC123" },
        });
        fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => {
            expect(mockLogin).toHaveBeenCalledWith({
                username: "user@test.com",
                password: "secret123",
                license_code: "ABC123",
            });
        });
    });

    it("does not prefill credentials", () => {
        renderLogin();
        expect(screen.getByLabelText("Email")).toHaveValue("");
        expect(screen.getByLabelText("Password")).toHaveValue("");
    });

    it("redirects to home when already authenticated", () => {
        mockState.authenticated = true;
        renderLogin();
        expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("displays error message when login fails", () => {
        mockState.error = { message: "Invalid credentials" };
        renderLogin();
        expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
});
