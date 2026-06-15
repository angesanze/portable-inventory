import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithI18n, i18n } from "../../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
    useNavigate: () => mockNavigate,
}));

const mockUseGetIdentity = vi.fn();
vi.mock("@refinedev/core", () => ({
    useGetIdentity: (...args: any[]) => mockUseGetIdentity(...args),
}));

import { QuickActions } from "../QuickActions";

/**
 * Identity used by `useCapabilities`; `view_widget_generator` gates the
 * developer-only "Generate Widget" shortcut, `view_widget_preview` the
 * manager-facing "Widget Preview" shortcut.
 */
function setIdentity(caps: {
    view_widget_generator?: boolean;
    view_widget_preview?: boolean;
}) {
    mockUseGetIdentity.mockReturnValue({
        data: { capabilities: caps },
        isLoading: false,
    });
}

describe("QuickActions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default to developer: view_widget_generator=true, view_widget_preview=false.
        // Widget Preview is manager-only under the dual-tier licensing contract.
        setIdentity({ view_widget_generator: true, view_widget_preview: false });
    });

    afterEach(async () => {
        await i18n.changeLanguage("en");
    });

    it("renders section title", () => {
        renderWithI18n(<QuickActions />);
        expect(screen.getByText("Quick Actions")).toBeTruthy();
    });

    it("renders all action cards for a developer", () => {
        renderWithI18n(<QuickActions />);
        expect(screen.getByText("Add Product")).toBeTruthy();
        expect(screen.getByText("Record Movement")).toBeTruthy();
        expect(screen.getByText("Create Work Order")).toBeTruthy();
        expect(screen.getByText("Scan QR Code")).toBeTruthy();
        expect(screen.getByText("Add Location")).toBeTruthy();
        expect(screen.getByText("Generate Widget")).toBeTruthy();
        // Developer must NOT see manager-only Widget Preview shortcut.
        expect(screen.queryByText("Widget Preview")).toBeNull();
    });

    it("renders descriptions for each action", () => {
        renderWithI18n(<QuickActions />);
        expect(screen.getByText("Create a new product model")).toBeTruthy();
        expect(screen.getByText("Log stock in or out")).toBeTruthy();
    });

    it("navigates to correct route on click", () => {
        renderWithI18n(<QuickActions />);
        fireEvent.click(screen.getByText("Add Product"));
        expect(mockNavigate).toHaveBeenCalledWith("/products/create");
    });

    it("navigates to widget on Scan QR Code click", () => {
        renderWithI18n(<QuickActions />);
        fireEvent.click(screen.getByText("Scan QR Code"));
        expect(mockNavigate).toHaveBeenCalledWith("/widget");
    });

    it("renders as a responsive grid", () => {
        const { container } = renderWithI18n(<QuickActions />);
        const grid = container.querySelector(".grid");
        expect(grid?.className).toContain("grid-cols-2");
        expect(grid?.className).toContain("lg:grid-cols-3");
    });

    it("applies indigo left border accent to cards", () => {
        const { container } = renderWithI18n(<QuickActions />);
        const buttons = container.querySelectorAll("button");
        buttons.forEach((btn) => {
            expect(btn.className).toContain("border-l-indigo-500");
        });
    });

    it("hides the developer-only Generate Widget shortcut from managers", () => {
        setIdentity({ view_widget_generator: false, view_widget_preview: true });
        renderWithI18n(<QuickActions />);
        // Developer-only shortcut is gone...
        expect(screen.queryByText("Generate Widget")).toBeNull();
        // ...but the always-on actions remain visible.
        expect(screen.getByText("Add Product")).toBeTruthy();
        expect(screen.getByText("Record Movement")).toBeTruthy();
        expect(screen.getByText("Create Work Order")).toBeTruthy();
        expect(screen.getByText("Scan QR Code")).toBeTruthy();
        expect(screen.getByText("Add Location")).toBeTruthy();
    });

    it("shows the Generate Widget shortcut to developers", () => {
        setIdentity({ view_widget_generator: true, view_widget_preview: true });
        renderWithI18n(<QuickActions />);
        expect(screen.getByText("Generate Widget")).toBeTruthy();
    });

    it("hides every capability-gated shortcut when identity is absent (fail-closed)", () => {
        mockUseGetIdentity.mockReturnValue({ data: undefined, isLoading: false });
        renderWithI18n(<QuickActions />);
        expect(screen.queryByText("Generate Widget")).toBeNull();
        expect(screen.queryByText("Widget Preview")).toBeNull();
        // Always-on shortcut still renders.
        expect(screen.getByText("Add Product")).toBeTruthy();
    });

    it("shows the manager Widget Preview shortcut when view_widget_preview is granted", () => {
        setIdentity({ view_widget_generator: false, view_widget_preview: true });
        renderWithI18n(<QuickActions />);
        expect(screen.getByText("Widget Preview")).toBeTruthy();
    });

    it("renders Italian labels and descriptions when language is switched to it", async () => {
        await i18n.changeLanguage("it");
        renderWithI18n(<QuickActions />);
        expect(screen.getByText("Azioni Rapide")).toBeTruthy();
        expect(screen.getByText("Aggiungi Prodotto")).toBeTruthy();
        expect(screen.getByText("Registra Movimento")).toBeTruthy();
        expect(screen.getByText("Crea Ordine di Lavoro")).toBeTruthy();
        expect(screen.getByText("Genera Widget")).toBeTruthy();
        expect(screen.getByText("Crea un nuovo modello prodotto")).toBeTruthy();
    });
});
