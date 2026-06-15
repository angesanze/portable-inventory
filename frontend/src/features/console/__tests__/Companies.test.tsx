import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { renderWithI18n, i18n } from "../../../test-utils/i18n-wrapper";
import { ToastProvider } from "../../../components/ui/Toast";
import type { UseCompaniesResult, ProvisionDeveloperResult } from "../hooks";

// ---------------------------------------------------------------------------
// Mock the console data layer. `useCompanies` is a fail-closed imperative fetch
// (no react-query), so we swap it for hoisted mutable state and stub the
// `provisionDeveloper` POST helper with a spy the modal test asserts on.
// ---------------------------------------------------------------------------

const company = (over: Partial<UseCompaniesResult["companies"][number]> = {}) => ({
    id: "c1",
    name: "Acme Dev Co",
    account_type: "developer" as const,
    license_code: "LIC-ACME",
    vat: "IT123",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    parent: null,
    parent_name: null,
    users_count: 3,
    api_keys_count: 2,
    children_count: 1,
    last_activity: "2026-05-20T00:00:00Z",
    children_summary: null,
    ...over,
});

const companiesState = vi.hoisted(() => {
    const refetch = () => {};
    return {
        current: null as unknown as UseCompaniesResult,
        loaded: null as unknown as UseCompaniesResult,
        refetch,
    };
});

const provisionMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks", () => ({
    useCompanies: () => companiesState.current,
    provisionDeveloper: provisionMock,
    // The modal only consults this in the catch path; identity fallback is fine.
    extractLifecycleError: (_err: unknown, fallback: string) => fallback,
}));

import { Companies } from "../Companies";

const renderCompanies = () =>
    renderWithI18n(
        <ToastProvider>
            <MemoryRouter>
                <Companies />
            </MemoryRouter>
        </ToastProvider>,
    );

describe("console Companies grid", () => {
    beforeEach(() => {
        provisionMock.mockReset();
        companiesState.loaded = {
            companies: [
                company(),
                company({
                    id: "c2",
                    name: "Beta Manager Srl",
                    account_type: "manager",
                    vat: "IT999",
                    is_active: false,
                    users_count: 1,
                    api_keys_count: 0,
                }),
            ],
            count: 2,
            isLoading: false,
            isError: false,
            refetch: companiesState.refetch,
        };
        companiesState.current = companiesState.loaded;
    });

    afterEach(async () => {
        await i18n.changeLanguage("en");
    });

    it("renders mocked companies with their tier badges", () => {
        renderCompanies();

        // Both rows render…
        const devRow = screen.getByText("Acme Dev Co").closest("tr")!;
        const mgrRow = screen.getByText("Beta Manager Srl").closest("tr")!;

        // …each carrying the correct tier badge (scoped to the row so the
        // FilterBar's tier-select options don't ambiguate the match).
        expect(within(devRow).getByText("Developer")).toBeTruthy();
        expect(within(mgrRow).getByText("Manager")).toBeTruthy();

        // Status badges fall out of `is_active`.
        expect(within(devRow).getByText("Active")).toBeTruthy();
        expect(within(mgrRow).getByText("Suspended")).toBeTruthy();
    });

    it("shows the empty state when no company matches", () => {
        companiesState.current = {
            companies: [],
            count: 0,
            isLoading: false,
            isError: false,
            refetch: companiesState.refetch,
        };
        renderCompanies();
        expect(screen.getByText("No companies")).toBeTruthy();
    });

    it("fails closed to an error card when the fetch rejects", () => {
        companiesState.current = {
            companies: [],
            count: 0,
            isLoading: false,
            isError: true,
            refetch: companiesState.refetch,
        };
        renderCompanies();
        expect(screen.getByText("Failed to load companies.")).toBeTruthy();
    });

    it("opens the provision-developer modal and POSTs to the endpoint", async () => {
        provisionMock.mockResolvedValue({
            ...company({ id: "new", name: "New Dev" }),
            api_key: "key-once",
            admin: null,
        } as ProvisionDeveloperResult);

        renderCompanies();

        // The header action button opens the (initially closed) modal.
        fireEvent.click(screen.getByRole("button", { name: "Provision developer" }));

        const name = screen.getByLabelText("Company name");
        fireEvent.change(name, { target: { value: "New Dev" } });

        fireEvent.click(screen.getByRole("button", { name: "Provision" }));

        await waitFor(() => expect(provisionMock).toHaveBeenCalledTimes(1));
        expect(provisionMock).toHaveBeenCalledWith(
            expect.objectContaining({ name: "New Dev" }),
        );
    });
});

// ---------------------------------------------------------------------------
// RequireSuperuser gating — a non-superuser must never reach the console page.
// Separate `@refinedev/core` module mock for useCapabilities, mirroring the
// Overview test.
// ---------------------------------------------------------------------------

const identityState = vi.hoisted(() => ({
    current: { is_superuser: true } as Record<string, unknown> | undefined,
    isLoading: false,
}));

vi.mock("@refinedev/core", () => ({
    useGetIdentity: () => ({ data: identityState.current, isLoading: identityState.isLoading }),
}));

import { RequireSuperuser } from "../../../components/RequireSuperuser";

function renderGuardedCompanies() {
    return renderWithI18n(
        <ToastProvider>
            <MemoryRouter initialEntries={["/console/companies"]}>
                <Routes>
                    <Route
                        path="/console/companies"
                        element={
                            <RequireSuperuser>
                                <Companies />
                            </RequireSuperuser>
                        }
                    />
                    <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
                </Routes>
            </MemoryRouter>
        </ToastProvider>,
    );
}

describe("Companies page guard", () => {
    beforeEach(() => {
        identityState.current = { is_superuser: true };
        identityState.isLoading = false;
        companiesState.current = {
            companies: [],
            count: 0,
            isLoading: false,
            isError: false,
            refetch: companiesState.refetch,
        };
    });

    it("renders the grid for a superuser", () => {
        renderGuardedCompanies();
        expect(screen.getByText("No companies")).toBeTruthy();
        expect(screen.queryByTestId("dashboard")).toBeNull();
    });

    it("redirects a non-superuser away from the companies page", () => {
        identityState.current = { is_superuser: false };
        renderGuardedCompanies();
        expect(screen.queryByText("No companies")).toBeNull();
        expect(screen.getByTestId("dashboard")).toBeTruthy();
    });
});
