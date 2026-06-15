import { screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { renderWithI18n, i18n } from "../../../test-utils/i18n-wrapper";
import type { UsePlatformStatsResult } from "../hooks";

// recharts renders nothing useful in jsdom (no layout box), so stub it out the
// same way the dashboard test does — we only care that the surrounding card +
// KPIs render, not the SVG geometry.
vi.mock("recharts", () => {
    const React = require("react");
    return {
        ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
        AreaChart: ({ children }: any) => <div>{children}</div>,
        Area: () => <div />,
        XAxis: () => <div />,
        YAxis: () => <div />,
        Tooltip: () => <div />,
        CartesianGrid: () => <div />,
    };
});

// Mutable stats backing the usePlatformStats mock. Hoisted so the (hoisted)
// vi.mock factory can close over it; each test reassigns to switch between the
// loaded / loading / error states.
const statsState = vi.hoisted(() => {
    const loaded = {
        stats: {
            companies: {
                total: 12,
                by_tier: { manager: 7, developer: 5 },
                active: 10,
                suspended: 2,
            },
            users_total: 30,
            api_keys_total: 9,
            movements_total: 88,
            open_events_total: 4,
        },
        growth: [
            { date: "2026-05-01", companies: 1, movements: 3 },
            { date: "2026-05-02", companies: 2, movements: 5 },
        ],
        isLoading: false,
        isError: false,
    };
    return { current: loaded as UsePlatformStatsResult, loaded };
});

vi.mock("../hooks", () => ({
    usePlatformStats: () => statsState.current,
}));

import { Overview } from "../Overview";

describe("console Overview", () => {
    beforeEach(() => {
        statsState.current = statsState.loaded;
    });

    afterEach(async () => {
        await i18n.changeLanguage("en");
    });

    it("renders the KPI cards with mocked totals", () => {
        renderWithI18n(<MemoryRouter><Overview /></MemoryRouter>);

        // KPI labels.
        expect(screen.getByText("Companies")).toBeTruthy();
        expect(screen.getByText("Managers")).toBeTruthy();
        expect(screen.getByText("Developers")).toBeTruthy();
        expect(screen.getByText("Suspended")).toBeTruthy();
        expect(screen.getByText("Users")).toBeTruthy();
        expect(screen.getByText("API Keys")).toBeTruthy();
        expect(screen.getByText("Open Alerts")).toBeTruthy();

        // KPI values (chosen distinct so each maps to exactly one card).
        expect(screen.getByText("12")).toBeTruthy();
        expect(screen.getByText("7")).toBeTruthy();
        expect(screen.getByText("5")).toBeTruthy();
        expect(screen.getByText("2")).toBeTruthy();
        expect(screen.getByText("30")).toBeTruthy();
        expect(screen.getByText("9")).toBeTruthy();
        expect(screen.getByText("4")).toBeTruthy();

        // Growth chart section header.
        expect(screen.getByText("Platform Growth")).toBeTruthy();
    });

    it("shows a fail-closed error card when the fetch rejects", () => {
        statsState.current = {
            stats: null,
            growth: [],
            isLoading: false,
            isError: true,
        };
        renderWithI18n(<MemoryRouter><Overview /></MemoryRouter>);

        expect(screen.getByText("Failed to load platform stats.")).toBeTruthy();
        // The KPI grid + chart are suppressed in the error state.
        expect(screen.queryByText("Platform Growth")).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// RequireSuperuser gating. Separate module mock for @refinedev/core (consumed
// by useCapabilities) — mirrors RequireCapability.test.tsx.
// ---------------------------------------------------------------------------

const identityState = vi.hoisted(() => ({
    current: { is_superuser: true } as Record<string, unknown> | undefined,
    isLoading: false,
}));

vi.mock("@refinedev/core", () => ({
    useGetIdentity: () => ({ data: identityState.current, isLoading: identityState.isLoading }),
}));

import { RequireSuperuser } from "../../../components/RequireSuperuser";

function renderGuard() {
    return renderWithI18n(
        <MemoryRouter initialEntries={["/console"]}>
            <Routes>
                <Route
                    path="/console"
                    element={
                        <RequireSuperuser>
                            <div data-testid="console-content">Console</div>
                        </RequireSuperuser>
                    }
                />
                <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe("RequireSuperuser", () => {
    beforeEach(() => {
        identityState.current = { is_superuser: true };
        identityState.isLoading = false;
    });

    it("renders the console for a superuser identity", () => {
        renderGuard();
        expect(screen.getByTestId("console-content")).toBeTruthy();
        expect(screen.queryByTestId("dashboard")).toBeNull();
    });

    it("redirects a non-superuser away from the console", () => {
        identityState.current = { is_superuser: false };
        renderGuard();
        expect(screen.queryByTestId("console-content")).toBeNull();
        expect(screen.getByTestId("dashboard")).toBeTruthy();
    });

    it("renders nothing while identity is still loading (fail closed)", () => {
        identityState.current = undefined;
        identityState.isLoading = true;
        renderGuard();
        expect(screen.queryByTestId("console-content")).toBeNull();
        expect(screen.queryByTestId("dashboard")).toBeNull();
    });
});
