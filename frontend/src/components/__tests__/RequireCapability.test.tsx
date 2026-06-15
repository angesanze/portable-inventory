import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RequireCapability } from "../RequireCapability";

// Mutable identity backing the useGetIdentity mock. Hoisted so the (hoisted)
// vi.mock factory can close over it; each test reassigns to switch identity or
// toggle the loading state. Mirrors the pattern in Layout.test.tsx.
const identityState = vi.hoisted(() => {
    const developer = {
        account_type: "developer",
        is_superuser: true,
        capabilities: {
            manage_api_keys: true,
            view_widget_generator: true,
            view_widget_preview: false,
            create_users: true,
            manage_tenants: true,
            manage_own_inventory: true,
        },
    };
    const manager = {
        account_type: "manager",
        is_superuser: false,
        capabilities: {
            manage_api_keys: false,
            view_widget_generator: false,
            view_widget_preview: true,
            create_users: false,
            manage_tenants: false,
            manage_own_inventory: true,
        },
    };
    return {
        current: developer as Record<string, unknown> | undefined,
        isLoading: false,
        developer,
        manager,
    };
});

vi.mock("@refinedev/core", () => ({
    useGetIdentity: () => ({ data: identityState.current, isLoading: identityState.isLoading }),
}));

function renderGuard(capability: "manage_api_keys" | "view_widget_generator" | "view_widget_preview") {
    return render(
        <MemoryRouter initialEntries={["/gated"]}>
            <Routes>
                <Route
                    path="/gated"
                    element={
                        <RequireCapability capability={capability}>
                            <div data-testid="gated-content">Secret Page</div>
                        </RequireCapability>
                    }
                />
                <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe("RequireCapability", () => {
    beforeEach(() => {
        identityState.current = identityState.developer;
        identityState.isLoading = false;
    });

    describe("developer identity", () => {
        it("renders the guarded API Keys page", () => {
            renderGuard("manage_api_keys");
            expect(screen.getByTestId("gated-content")).toBeTruthy();
            expect(screen.queryByTestId("dashboard")).toBeNull();
        });

        it("renders the guarded Widget Generator page", () => {
            renderGuard("view_widget_generator");
            expect(screen.getByTestId("gated-content")).toBeTruthy();
            expect(screen.queryByTestId("dashboard")).toBeNull();
        });

        it("redirects away from the Widget Preview page (developer must not see preview)", () => {
            renderGuard("view_widget_preview");
            expect(screen.queryByTestId("gated-content")).toBeNull();
            expect(screen.getByTestId("dashboard")).toBeTruthy();
        });
    });

    describe("manager identity", () => {
        beforeEach(() => {
            identityState.current = identityState.manager;
        });

        it("redirects away from the API Keys page", () => {
            renderGuard("manage_api_keys");
            expect(screen.queryByTestId("gated-content")).toBeNull();
            expect(screen.getByTestId("dashboard")).toBeTruthy();
        });

        it("redirects away from the Widget Generator page", () => {
            renderGuard("view_widget_generator");
            expect(screen.queryByTestId("gated-content")).toBeNull();
            expect(screen.getByTestId("dashboard")).toBeTruthy();
        });

        it("renders the guarded Widget Preview page", () => {
            renderGuard("view_widget_preview");
            expect(screen.getByTestId("gated-content")).toBeTruthy();
            expect(screen.queryByTestId("dashboard")).toBeNull();
        });
    });

    describe("loading identity (fail-closed)", () => {
        beforeEach(() => {
            identityState.current = undefined;
            identityState.isLoading = true;
        });

        it("renders neither the guarded page nor a premature redirect", () => {
            renderGuard("manage_api_keys");
            // While identity loads we render null: no flash of the page, and a
            // developer is not bounced mid-load to the dashboard.
            expect(screen.queryByTestId("gated-content")).toBeNull();
            expect(screen.queryByTestId("dashboard")).toBeNull();
        });
    });
});
