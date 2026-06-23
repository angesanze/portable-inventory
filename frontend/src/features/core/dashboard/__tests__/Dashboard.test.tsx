import type { ReactNode } from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { renderWithI18n, i18n } from "../../../../test-utils/i18n-wrapper";

/** Partial `useList` return shape the dashboard reads (data + isLoading). */
type ListResultMock = { data: { data: unknown[]; total?: number }; isLoading: boolean };

const mockUseList = vi.fn<(arg: { resource?: string }) => ListResultMock>();

vi.mock("@refinedev/core", () => ({
    useList: (arg: { resource?: string }) => mockUseList(arg),
    // GettingStartedChecklist resolves capabilities via useGetIdentity; treat
    // the dashboard test user as a developer so the QR widget step renders.
    useGetIdentity: vi.fn(() => ({
        data: { capabilities: { manage_api_keys: true } },
        isLoading: false,
    })),
}));

vi.mock("recharts", () => {
    return {
        ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
        LineChart: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
        Line: () => <div />,
        XAxis: () => <div />,
        YAxis: () => <div />,
        Tooltip: () => <div />,
        CartesianGrid: () => <div />,
    };
});

import { Dashboard } from "../Dashboard";

describe("Dashboard", () => {
    beforeEach(() => {
        mockUseList.mockImplementation(() => ({
            data: { data: [], total: 42 },
            isLoading: false,
        }));
    });

    afterEach(async () => {
        await i18n.changeLanguage("en");
    });

    it("renders page title and subtitle", () => {
        renderWithI18n(<MemoryRouter><Dashboard /></MemoryRouter>);
        expect(screen.getByText("Dashboard")).toBeTruthy();
        expect(screen.getByText("Overview of your inventory")).toBeTruthy();
    });

    it("renders all four KPI stat cards", () => {
        renderWithI18n(<MemoryRouter><Dashboard /></MemoryRouter>);
        expect(screen.getByText("Total Products")).toBeTruthy();
        expect(screen.getByText("Active Items")).toBeTruthy();
        expect(screen.getByText("Total Stock")).toBeTruthy();
        expect(screen.getByText("Pending Work Orders")).toBeTruthy();
    });

    it("renders movement chart section", () => {
        renderWithI18n(<MemoryRouter><Dashboard /></MemoryRouter>);
        expect(screen.getByText("Movement Activity")).toBeTruthy();
    });

    it("renders recent activity and attention sections", () => {
        renderWithI18n(<MemoryRouter><Dashboard /></MemoryRouter>);
        expect(screen.getByText("Recent Movements")).toBeTruthy();
    });

    it("renders QuickActions section", () => {
        renderWithI18n(<MemoryRouter><Dashboard /></MemoryRouter>);
        expect(screen.getByText("Quick Actions")).toBeTruthy();
        expect(screen.getByText("Add Product")).toBeTruthy();
        expect(screen.getByText("Record Movement")).toBeTruthy();
        expect(screen.getByText("Scan QR Code")).toBeTruthy();
    });

    it("renders GettingStartedChecklist when counts are low", () => {
        localStorage.removeItem("gettingStartedDismissed");
        mockUseList.mockImplementation(({ resource }: { resource?: string }) => {
            if (resource === "product-models") return { data: { data: [], total: 1 }, isLoading: false };
            if (resource === "locations") return { data: { data: [], total: 0 }, isLoading: false };
            if (resource === "movements") return { data: { data: [], total: 0 }, isLoading: false };
            if (resource === "api-keys") return { data: { data: [], total: 0 }, isLoading: false };
            return { data: { data: [], total: 0 }, isLoading: false };
        });
        renderWithI18n(<MemoryRouter><Dashboard /></MemoryRouter>);
        expect(screen.getByText("Getting Started")).toBeTruthy();
        expect(screen.getByText("Create your first product")).toBeTruthy();
    });

    it("renders Italian labels when language is switched to it", async () => {
        await i18n.changeLanguage("it");
        renderWithI18n(<MemoryRouter><Dashboard /></MemoryRouter>);
        expect(screen.getByText("Panoramica del tuo inventario")).toBeTruthy();
        expect(screen.getByText("Prodotti Totali")).toBeTruthy();
        expect(screen.getByText("Articoli Attivi")).toBeTruthy();
        expect(screen.getByText("Giacenza Totale")).toBeTruthy();
        expect(screen.getByText("Ordini di Lavoro in Attesa")).toBeTruthy();
        expect(screen.getByText("Azioni Rapide")).toBeTruthy();
        expect(screen.getByText("Movimenti Recenti")).toBeTruthy();
    });
});
