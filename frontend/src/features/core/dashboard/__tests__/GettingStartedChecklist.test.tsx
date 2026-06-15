import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithI18n, i18n } from "../../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
    useNavigate: () => mockNavigate,
}));

const mockUseList = vi.fn();
const mockUseGetIdentity = vi.fn();
vi.mock("@refinedev/core", () => ({
    useList: (...args: any[]) => mockUseList(...args),
    useGetIdentity: (...args: any[]) => mockUseGetIdentity(...args),
}));

import { GettingStartedChecklist } from "../GettingStartedChecklist";

/** Identity used by `useCapabilities`; `manage_api_keys` gates the QR step. */
function setIdentity(canManageKeys: boolean) {
    mockUseGetIdentity.mockReturnValue({
        data: { capabilities: { manage_api_keys: canManageKeys } },
        isLoading: false,
    });
}

function setupMock(counts: {
    products?: number;
    locations?: number;
    movements?: number;
    apiKeys?: number;
    isLoading?: boolean;
}) {
    mockUseList.mockImplementation(({ resource }: any) => {
        const loading = counts.isLoading ?? false;
        const make = (total: number) => ({
            data: { data: [], total },
            isLoading: loading,
        });
        if (resource === "product-models") return make(counts.products ?? 0);
        if (resource === "locations") return make(counts.locations ?? 0);
        if (resource === "movements") return make(counts.movements ?? 0);
        if (resource === "api-keys") return make(counts.apiKeys ?? 0);
        return make(0);
    });
}

describe("GettingStartedChecklist", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        setIdentity(true); // default to developer (sees the QR widget step)
    });

    afterEach(async () => {
        await i18n.changeLanguage("en");
    });

    it("renders when user has 0 products and 0 movements", () => {
        setupMock({ products: 0, movements: 0 });
        renderWithI18n(<GettingStartedChecklist />);
        expect(screen.getByText("Getting Started")).toBeTruthy();
        expect(screen.getByText("0 of 4 complete")).toBeTruthy();
    });

    it("shows all four checklist steps", () => {
        setupMock({ products: 0, movements: 0 });
        renderWithI18n(<GettingStartedChecklist />);
        expect(screen.getByText("Create your first product")).toBeTruthy();
        expect(screen.getByText("Add a warehouse location")).toBeTruthy();
        expect(screen.getByText("Record your first movement")).toBeTruthy();
        expect(screen.getByText("Set up a QR widget")).toBeTruthy();
    });

    it("hides the QR widget step for managers (manage_api_keys=false)", () => {
        setIdentity(false);
        setupMock({ products: 0, movements: 0 });
        renderWithI18n(<GettingStartedChecklist />);
        // Manager: 3 steps, no developer-only Widget Generator step, no `GET /api-keys`.
        expect(screen.getByText("0 of 3 complete")).toBeTruthy();
        expect(screen.queryByText("Set up a QR widget")).toBeNull();
        expect(mockUseList).not.toHaveBeenCalledWith(
            expect.objectContaining({ resource: "api-keys", queryOptions: { enabled: true } }),
        );
    });

    it("marks completed steps with line-through", () => {
        setupMock({ products: 1, locations: 2, movements: 0 });
        renderWithI18n(<GettingStartedChecklist />);
        const productBtn = screen.getByText("Create your first product");
        expect(productBtn.closest("button")?.className).toContain("line-through");

        const locationBtn = screen.getByText("Add a warehouse location");
        expect(locationBtn.closest("button")?.className).toContain("line-through");

        const movementBtn = screen.getByText("Record your first movement");
        expect(movementBtn.closest("button")?.className).not.toContain("line-through");
    });

    it("shows correct progress count", () => {
        setupMock({ products: 1, locations: 2, movements: 1, apiKeys: 0 });
        renderWithI18n(<GettingStartedChecklist />);
        // 3 products but less than 3, so it shows. 3 steps complete (products>0, locations>1, movements>0)
        expect(screen.getByText("3 of 4 complete")).toBeTruthy();
    });

    it("hides when user has >= 3 products AND >= 1 movement", () => {
        setupMock({ products: 5, movements: 3 });
        const { container } = renderWithI18n(<GettingStartedChecklist />);
        expect(container.innerHTML).toBe("");
    });

    it("navigates to correct route on step click", () => {
        setupMock({ products: 0, movements: 0 });
        renderWithI18n(<GettingStartedChecklist />);
        fireEvent.click(screen.getByText("Create your first product"));
        expect(mockNavigate).toHaveBeenCalledWith("/products/create");
    });

    it("navigates to locations/create on location step click", () => {
        setupMock({ products: 0, movements: 0 });
        renderWithI18n(<GettingStartedChecklist />);
        fireEvent.click(screen.getByText("Add a warehouse location"));
        expect(mockNavigate).toHaveBeenCalledWith("/locations/create");
    });

    it("dismisses and stores in localStorage", () => {
        setupMock({ products: 0, movements: 0 });
        renderWithI18n(<GettingStartedChecklist />);
        expect(screen.getByText("Getting Started")).toBeTruthy();

        fireEvent.click(screen.getByLabelText("Dismiss"));
        expect(localStorage.getItem("gettingStartedDismissed")).toBe("true");
        expect(screen.queryByText("Getting Started")).toBeNull();
    });

    it("stays hidden after dismiss on re-render", () => {
        localStorage.setItem("gettingStartedDismissed", "true");
        setupMock({ products: 0, movements: 0 });
        const { container } = renderWithI18n(<GettingStartedChecklist />);
        expect(container.innerHTML).toBe("");
    });

    it("returns null while loading", () => {
        setupMock({ products: 0, movements: 0, isLoading: true });
        const { container } = renderWithI18n(<GettingStartedChecklist />);
        expect(container.innerHTML).toBe("");
    });

    it("uses indigo background styling", () => {
        setupMock({ products: 0, movements: 0 });
        const { container } = renderWithI18n(<GettingStartedChecklist />);
        const card = container.firstElementChild as HTMLElement;
        expect(card.className).toContain("bg-indigo-500/10");
    });

    it("shows progress bar", () => {
        setupMock({ products: 1, movements: 0, locations: 0 });
        const { container } = renderWithI18n(<GettingStartedChecklist />);
        const progressBar = container.querySelector(".bg-indigo-500");
        expect(progressBar).toBeTruthy();
        expect((progressBar as HTMLElement).style.width).toBe("25%");
    });

    it("renders Italian labels, progress and dismiss when language is switched to it", async () => {
        await i18n.changeLanguage("it");
        setupMock({ products: 0, movements: 0 });
        renderWithI18n(<GettingStartedChecklist />);
        expect(screen.getByText("Per Iniziare")).toBeTruthy();
        expect(screen.getByText("0 di 4 completati")).toBeTruthy();
        expect(screen.getByText("Crea il tuo primo prodotto")).toBeTruthy();
        expect(screen.getByText("Aggiungi una sede magazzino")).toBeTruthy();
        expect(screen.getByText("Registra il tuo primo movimento")).toBeTruthy();
        expect(screen.getByText("Configura un widget QR")).toBeTruthy();
        expect(screen.getByLabelText("Chiudi")).toBeTruthy();
    });
});
