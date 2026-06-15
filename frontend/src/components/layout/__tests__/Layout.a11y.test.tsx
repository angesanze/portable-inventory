import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { I18nWrapper } from "../../../test-utils/i18n-wrapper";
import { ActingTenantProvider } from "../../../context/ActingTenantProvider";
import { Layout } from "../index";

// Mock matchMedia for responsive hook
function createMatchMedia(width: number) {
    return (query: string): MediaQueryList => {
        const listeners: Array<(e: MediaQueryListEvent) => void> = [];
        return {
            matches: query.includes("max-width") && width <= parseInt(query.match(/\d+/)?.[0] ?? "0"),
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.push(cb),
            removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
                const idx = listeners.indexOf(cb);
                if (idx >= 0) listeners.splice(idx, 1);
            },
            dispatchEvent: vi.fn(),
        } as unknown as MediaQueryList;
    };
}

vi.mock("@refinedev/core", () => ({
    useMenu: () => ({
        menuItems: [],
        selectedKey: "dashboard",
    }),
    useLogout: () => ({ mutate: vi.fn() }),
    useGetIdentity: () => ({
        data: {
            name: "TestUser",
            email: "test@example.com",
            avatar: "https://ui-avatars.com/api/?name=TestUser",
        },
    }),
    useNotification: () => ({ open: vi.fn() }),
    useOne: () => ({ data: undefined, isLoading: false }),
}));

function renderLayout(initialRoute = "/") {
    return render(
        <I18nWrapper>
            <ActingTenantProvider>
                <MemoryRouter initialEntries={[initialRoute]}>
                    <Layout>
                        <div>Content</div>
                    </Layout>
                </MemoryRouter>
            </ActingTenantProvider>
        </I18nWrapper>,
    );
}

describe("Layout accessibility", () => {
    beforeEach(() => {
        localStorage.clear();
        Object.defineProperty(window, "innerWidth", { value: 1280, writable: true });
        window.matchMedia = createMatchMedia(1280);
    });

    it("sidebar has role=navigation and aria-label", () => {
        renderLayout();
        const navElements = screen.getAllByRole("navigation");
        const mainNav = navElements.find(el => el.getAttribute("aria-label") === "Main navigation");
        expect(mainNav).toBeTruthy();
    });

    it("collapse button has aria-label", () => {
        renderLayout();
        const collapseBtn = screen.getByLabelText("Collapse sidebar");
        expect(collapseBtn).toBeTruthy();
    });

    it("collapse button aria-label updates on toggle", () => {
        renderLayout();
        const collapseBtn = screen.getByLabelText("Collapse sidebar");
        fireEvent.click(collapseBtn);
        expect(screen.getByLabelText("Expand sidebar")).toBeTruthy();
    });

    it("hamburger button has aria-label on mobile", () => {
        Object.defineProperty(window, "innerWidth", { value: 800, writable: true });
        window.matchMedia = createMatchMedia(800);
        renderLayout();
        expect(screen.getByLabelText("Open menu")).toBeTruthy();
    });

    it("mobile drawer sidebar has role=navigation", () => {
        Object.defineProperty(window, "innerWidth", { value: 800, writable: true });
        window.matchMedia = createMatchMedia(800);
        renderLayout();
        fireEvent.click(screen.getByLabelText("Open menu"));
        const navElements = screen.getAllByRole("navigation");
        const mainNav = navElements.find(el => el.getAttribute("aria-label") === "Main navigation");
        expect(mainNav).toBeTruthy();
    });

    it("breadcrumb uses nav element", () => {
        renderLayout("/products");
        const navElements = screen.getAllByRole("navigation");
        // Should have sidebar nav + breadcrumb nav
        expect(navElements.length).toBeGreaterThanOrEqual(2);
    });
});
