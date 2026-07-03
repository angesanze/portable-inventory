import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { I18nWrapper, i18n } from "../../../test-utils/i18n-wrapper";
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

// Mutable identity used by the useGetIdentity mock. Hoisted so vi.mock (which
// is itself hoisted) can close over it; individual tests reassign it to switch
// between developer and manager identities.
const identityState = vi.hoisted(() => {
    const developer = {
        name: "TestUser",
        email: "test@example.com",
        avatar: "https://ui-avatars.com/api/?name=TestUser",
        account_type: "developer",
        is_superuser: true,
        capabilities: {
            manage_api_keys: true,
            view_widget_generator: true,
            create_users: true,
            manage_tenants: true,
            manage_own_inventory: true,
        },
    };
    return { current: developer as Record<string, unknown>, developer };
});

// Mock refine hooks
vi.mock("@refinedev/core", () => ({
    useMenu: () => ({
        menuItems: [
            { key: "dashboard", name: "dashboard", label: "Dashboard", route: "/" },
            { key: "locations", name: "locations", label: "Locations", route: "/locations" },
        ],
        selectedKey: "dashboard",
    }),
    useLogout: () => ({ mutate: vi.fn() }),
    useGetIdentity: () => ({ data: identityState.current, isLoading: false }),
    useOne: (opts: { resource: string; id: string; queryOptions?: { enabled?: boolean } }) => {
        if (!opts.queryOptions?.enabled) return { data: undefined, isLoading: false };
        const mockData: Record<string, Record<string, { name: string }>> = {
            "product-models": { "abc12345-def6-7890-abcd-ef1234567890": { name: "Widget A" } },
            locations: { "aaa12345-def6-7890-abcd-ef1234567890": { name: "Warehouse B" } },
            "work-orders": { "bbb12345-def6-7890-abcd-ef1234567890": { name: "WO-001" } },
        };
        const record = mockData[opts.resource]?.[opts.id];
        return { data: record ? { data: record } : undefined, isLoading: false };
    },
}));

// Mock CommandPalette to avoid pulling in full component tree
vi.mock("../../ui/CommandPalette", () => ({
    CommandPalette: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
        open ? <div data-testid="command-palette-mock" onClick={onClose}>CommandPalette</div> : null,
}));

function renderLayout(initialRoute = "/") {
    return render(
        <I18nWrapper>
            <ActingTenantProvider>
                <MemoryRouter initialEntries={[initialRoute]}>
                    <Layout>
                        <div data-testid="content">Page Content</div>
                    </Layout>
                </MemoryRouter>
            </ActingTenantProvider>
        </I18nWrapper>,
    );
}

describe("Layout", () => {
    beforeEach(() => {
        localStorage.clear();
        identityState.current = identityState.developer;
        // Default: desktop viewport (1280px)
        Object.defineProperty(window, "innerWidth", { value: 1280, writable: true });
        window.matchMedia = createMatchMedia(1280);
    });

    it("renders navigation groups", () => {
        renderLayout();
        expect(screen.getByText("Overview")).toBeTruthy();
        expect(screen.getByText("Setup")).toBeTruthy();
        expect(screen.getByText("Inventory")).toBeTruthy();
        expect(screen.getByText("Sales & Purchasing")).toBeTruthy();
        expect(screen.getByText("Settings")).toBeTruthy();
    });

    it("renders navigation items", () => {
        renderLayout();
        expect(screen.getByText("Dashboard")).toBeTruthy();
        expect(screen.getByText("Catalog")).toBeTruthy();
        expect(screen.getByText("Stock")).toBeTruthy();
        expect(screen.getByText("Locations")).toBeTruthy();
        expect(screen.getByText("Work Orders")).toBeTruthy();
    });

    it("renders user identity", () => {
        renderLayout();
        expect(screen.getByText("TestUser")).toBeTruthy();
        expect(screen.getByText("test@example.com")).toBeTruthy();
    });

    it("labels the user profile logout control via common namespace", () => {
        renderLayout();
        expect(screen.getByRole("button", { name: "Logout" })).toBeTruthy();
    });

    it("translates the logout label when language switches to Italian", async () => {
        await i18n.changeLanguage("it");
        try {
            renderLayout();
            expect(screen.getByRole("button", { name: "Esci" })).toBeTruthy();
        } finally {
            await i18n.changeLanguage("en");
        }
    });

    it("renders children in content area", () => {
        renderLayout();
        expect(screen.getByTestId("content")).toBeTruthy();
    });

    it("toggles sidebar collapsed state", () => {
        renderLayout();
        const toggleBtn = screen.getByTitle("Collapse sidebar (⌘\\)");
        fireEvent.click(toggleBtn);
        // After collapse, group labels should be hidden
        expect(screen.queryByText("Overview")).toBeNull();
        expect(localStorage.getItem("sidebar_collapsed")).toBe("true");
    });

    it("restores collapsed state from localStorage", () => {
        localStorage.setItem("sidebar_collapsed", "true");
        renderLayout();
        // Group labels should not be visible when collapsed
        expect(screen.queryByText("Overview")).toBeNull();
    });

    it("toggles sidebar via keyboard shortcut Ctrl+\\", () => {
        renderLayout();
        expect(screen.getByText("Overview")).toBeTruthy();
        fireEvent.keyDown(window, { key: "\\", ctrlKey: true });
        expect(screen.queryByText("Overview")).toBeNull();
    });

    it("displays company name from identity", () => {
        renderLayout();
        // Default fallback when no company
        expect(screen.getByText("Varasto")).toBeTruthy();
    });

    describe("breadcrumbs", () => {
        it("does not show breadcrumbs on dashboard", () => {
            renderLayout("/");
            expect(screen.queryByTestId("breadcrumb-nav")).toBeNull();
        });

        it("shows breadcrumbs with friendly labels on list pages", () => {
            renderLayout("/products");
            const nav = screen.getByTestId("breadcrumb-nav");
            expect(nav).toBeTruthy();
            expect(nav.textContent).toContain("Catalog");
        });

        it("uses ChevronRight separator between segments", () => {
            renderLayout("/work-orders/create");
            const nav = screen.getByTestId("breadcrumb-nav");
            // ChevronRight is an SVG — check there are svg elements as separators
            const svgs = nav.querySelectorAll("svg");
            expect(svgs.length).toBeGreaterThanOrEqual(1);
        });

        it("maps URL segments to friendly labels", () => {
            renderLayout("/work-orders");
            const nav = screen.getByTestId("breadcrumb-nav");
            expect(nav.textContent).toContain("Work Orders");
        });

        it("shows friendly resource name for UUID segments", () => {
            renderLayout("/products/abc12345-def6-7890-abcd-ef1234567890");
            const nav = screen.getByTestId("breadcrumb-nav");
            expect(nav.textContent).toContain("Widget A");
            expect(nav.textContent).toContain("Catalog");
        });

        it("shows friendly name for location UUID", () => {
            renderLayout("/locations/aaa12345-def6-7890-abcd-ef1234567890");
            const nav = screen.getByTestId("breadcrumb-nav");
            expect(nav.textContent).toContain("Warehouse B");
        });

        it("shows friendly name for work order UUID", () => {
            renderLayout("/work-orders/bbb12345-def6-7890-abcd-ef1234567890");
            const nav = screen.getByTestId("breadcrumb-nav");
            expect(nav.textContent).toContain("WO-001");
        });

        it("makes non-last breadcrumbs clickable links", () => {
            renderLayout("/work-orders/create");
            const nav = screen.getByTestId("breadcrumb-nav");
            const links = nav.querySelectorAll("a");
            expect(links.length).toBeGreaterThanOrEqual(1);
            expect(links[0].getAttribute("href")).toBe("/work-orders");
        });

        it("last breadcrumb is not a link", () => {
            renderLayout("/products");
            const nav = screen.getByTestId("breadcrumb-nav");
            const links = nav.querySelectorAll("a");
            expect(links.length).toBe(0); // single segment = last = not a link
        });

        it("translates action segments via common namespace", () => {
            renderLayout("/work-orders/create");
            const nav = screen.getByTestId("breadcrumb-nav");
            expect(nav.textContent).toContain("Work Orders");
            expect(nav.textContent).toContain("Create");
        });

        it("translates breadcrumb labels when language switches to Italian", async () => {
            await i18n.changeLanguage("it");
            try {
                renderLayout("/work-orders");
                const nav = screen.getByTestId("breadcrumb-nav");
                expect(nav.textContent).toContain("Ordini di Lavoro");
            } finally {
                await i18n.changeLanguage("en");
            }
        });
    });

    describe("collapsible nav groups", () => {
        it("renders a toggle for every group; everyday groups start expanded", () => {
            renderLayout();
            expect(screen.getByTestId("nav-group-toggle-setup")).toBeTruthy();
            expect(screen.getByTestId("nav-group-toggle-inventory")).toBeTruthy();
            expect(screen.getByTestId("nav-group-toggle-settings")).toBeTruthy();
            // Setup is expanded by default → an item is visible and no count badge.
            expect(screen.getByText("Suppliers")).toBeTruthy();
            expect(
                screen.getByTestId("nav-group-toggle-setup").textContent,
            ).not.toMatch(/\(\d+\)/);
        });

        it("starts Settings collapsed with an item-count badge", () => {
            renderLayout();
            const toggle = screen.getByTestId("nav-group-toggle-settings");
            // Settings (collapsedByDefault) shows api-keys + notifications +
            // appearance for the developer identity (which lacks manage_users),
            // so 3 items.
            expect(toggle.textContent).toContain("(3)");
        });

        it("collapses a default-expanded group on click and persists the choice", () => {
            renderLayout();
            const toggle = screen.getByTestId("nav-group-toggle-setup");
            fireEvent.click(toggle);
            expect(toggle.textContent).toMatch(/\(\d+\)/);
            expect(JSON.parse(localStorage.getItem("nav_groups_expanded")!).setup).toBe(false);
        });

        it("expands Settings on click and hides the count badge", () => {
            renderLayout();
            const toggle = screen.getByTestId("nav-group-toggle-settings");
            fireEvent.click(toggle);
            expect(toggle.textContent).not.toMatch(/\(\d+\)/);
            expect(JSON.parse(localStorage.getItem("nav_groups_expanded")!).settings).toBe(true);
        });

        it("collapses Settings again on second click", () => {
            renderLayout();
            const toggle = screen.getByTestId("nav-group-toggle-settings");
            fireEvent.click(toggle); // expand
            fireEvent.click(toggle); // collapse
            expect(toggle.textContent).toContain("(3)");
            expect(JSON.parse(localStorage.getItem("nav_groups_expanded")!).settings).toBe(false);
        });

        it("restores per-group expanded state from localStorage", () => {
            localStorage.setItem("nav_groups_expanded", JSON.stringify({ settings: true }));
            renderLayout();
            expect(
                screen.getByTestId("nav-group-toggle-settings").textContent,
            ).not.toMatch(/\(\d+\)/);
        });

        it("auto-expands the group that owns the active route", () => {
            renderLayout("/settings/notifications");
            // Settings owns the active route → force-expanded, no count badge.
            expect(
                screen.getByTestId("nav-group-toggle-settings").textContent,
            ).not.toMatch(/\(\d+\)/);
        });

        it("exposes a description info affordance for each group", () => {
            renderLayout();
            expect(
                screen.getAllByRole("button", { name: /more info/i }).length,
            ).toBeGreaterThanOrEqual(5);
        });

        it("shows an area description when its info button is clicked", () => {
            renderLayout();
            // The first info button belongs to the Overview group (nav order).
            fireEvent.click(screen.getAllByRole("button", { name: /more info/i })[0]);
            expect(screen.getByText(/at-a-glance/i)).toBeTruthy();
        });
    });

    describe("capability gating", () => {
        const managerIdentity = {
            name: "ManagerUser",
            email: "manager@example.com",
            avatar: "https://ui-avatars.com/api/?name=ManagerUser",
            account_type: "manager",
            is_superuser: false,
            capabilities: {
                manage_api_keys: false,
                view_widget_generator: false,
                create_users: false,
                manage_tenants: false,
                manage_own_inventory: true,
            },
        };

        function expandSettings() {
            const toggle = screen.queryByTestId("nav-group-toggle-settings");
            if (toggle) fireEvent.click(toggle);
        }

        it("developer identity renders API Keys and Widget Generator entries", () => {
            renderLayout();
            expandSettings();
            expect(screen.getByText("API Keys")).toBeTruthy();
            expect(screen.getByText("Widgets")).toBeTruthy();
        });

        it("manager identity hides API Keys and Widget Generator entries", () => {
            identityState.current = managerIdentity;
            renderLayout();
            expandSettings();
            expect(screen.queryByText("API Keys")).toBeNull();
            expect(screen.queryByText("Widgets")).toBeNull();
        });

        it("manager identity still sees warehouse + remaining settings entries", () => {
            identityState.current = managerIdentity;
            renderLayout();
            expandSettings();
            // Warehouse resources stay visible
            expect(screen.getByText("Catalog")).toBeTruthy();
            expect(screen.getByText("Stock")).toBeTruthy();
            expect(screen.getByText("Movements")).toBeTruthy();
            // Non-gated settings entries remain
            expect(screen.getByText("Tracking Presets")).toBeTruthy();
            expect(screen.getByText("QR Codes")).toBeTruthy();
        });

        it("settings group count badge reflects only visible items for a manager", () => {
            identityState.current = managerIdentity;
            renderLayout();
            const toggle = screen.getByTestId("nav-group-toggle-settings");
            // Manager lacks manage_api_keys and manage_users, so the Settings
            // group shows Notifications + Appearance — 2 items.
            expect(toggle.textContent).toContain("(2)");
        });

        // CLEANUP-04: managers gain a dedicated, manager-safe Widget Preview
        // surface (view_widget_preview) while the developer Widget Generator
        // (view_widget_generator) stays hidden.
        const managerWithPreview = {
            ...managerIdentity,
            capabilities: { ...managerIdentity.capabilities, view_widget_preview: true },
        };

        it("manager with view_widget_preview sees Widget Preview but not Widget Generator", () => {
            identityState.current = managerWithPreview;
            renderLayout();
            expandSettings();
            expect(screen.getByText("Widget Preview")).toBeTruthy();
            expect(screen.queryByText("Widgets")).toBeNull();
        });

        // DEV-LICENSE-03: developers get a Workspace group with a Managed
        // Companies entry; managers (no manage_tenants capability) never see
        // the Workspace group at all because its only item is gated off.
        it("developer identity renders Workspace group with Managed Companies entry", () => {
            renderLayout();
            expect(screen.getByText("Workspace")).toBeTruthy();
            expect(screen.getByText("Managed Companies")).toBeTruthy();
        });

        it("developer identity renders Italian Workspace + Aziende gestite when locale is it", async () => {
            await i18n.changeLanguage("it");
            try {
                renderLayout();
                expect(screen.getByText("Workspace")).toBeTruthy();
                expect(screen.getByText("Aziende gestite")).toBeTruthy();
            } finally {
                await i18n.changeLanguage("en");
            }
        });

        it("manager identity hides the Workspace group entirely", () => {
            identityState.current = managerIdentity;
            renderLayout();
            expect(screen.queryByText("Workspace")).toBeNull();
            expect(screen.queryByText("Managed Companies")).toBeNull();
        });

        // DEV-LICENSE-04 task 2: pin per-tier sidebar visibility against the
        // post-DEV-LICENSE-02/03 contract. Developer must NOT see Widget
        // Preview (gated to managers); manager must NOT see Workspace nor
        // Widget Generator (gated to developer).
        it("developer mock (view_widget_preview=false) shows Managed Companies + Widgets, hides Widget Preview", () => {
            identityState.current = {
                name: "DevUser",
                email: "dev@example.com",
                avatar: "https://ui-avatars.com/api/?name=DevUser",
                account_type: "developer",
                is_superuser: false,
                capabilities: {
                    manage_api_keys: true,
                    view_widget_generator: true,
                    view_widget_preview: false,
                    create_users: true,
                    manage_tenants: true,
                    manage_own_inventory: true,
                },
            };
            renderLayout();
            expect(screen.getByText("Managed Companies")).toBeTruthy();
            expandSettings();
            expect(screen.getByText("Widgets")).toBeTruthy();
            expect(screen.queryByText("Widget Preview")).toBeNull();
        });

        it("manager mock (view_widget_preview=true) shows Widget Preview, hides Managed Companies + Widgets", () => {
            identityState.current = {
                name: "ManagerUser",
                email: "manager@example.com",
                avatar: "https://ui-avatars.com/api/?name=ManagerUser",
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
            renderLayout();
            expect(screen.queryByText("Managed Companies")).toBeNull();
            expandSettings();
            expect(screen.queryByText("Widgets")).toBeNull();
            expect(screen.getByText("Widget Preview")).toBeTruthy();
        });
    });

    it("opens command palette on Ctrl+K", () => {
        renderLayout();
        expect(screen.queryByTestId("command-palette-mock")).toBeNull();
        fireEvent.keyDown(window, { key: "k", ctrlKey: true });
        expect(screen.getByTestId("command-palette-mock")).toBeTruthy();
    });

    it("opens command palette via sidebar search button", () => {
        renderLayout();
        expect(screen.queryByTestId("command-palette-mock")).toBeNull();
        fireEvent.click(screen.getByTestId("sidebar-search-button"));
        expect(screen.getByTestId("command-palette-mock")).toBeTruthy();
    });

    it("shows ⌘K shortcut hint in expanded search button", () => {
        renderLayout();
        const searchBtn = screen.getByTestId("sidebar-search-button");
        expect(searchBtn.textContent).toContain("⌘K");
    });

    it("shows search button with ⌘K tooltip when collapsed", () => {
        renderLayout();
        fireEvent.click(screen.getByTitle("Collapse sidebar (⌘\\)"));
        const collapsedSearch = screen.getByTestId("sidebar-search-button-collapsed");
        expect(collapsedSearch).toBeTruthy();
        expect(collapsedSearch.getAttribute("title")).toBe("Search (⌘K)");
    });

    it("opens command palette via collapsed search button", () => {
        renderLayout();
        fireEvent.click(screen.getByTitle("Collapse sidebar (⌘\\)"));
        expect(screen.queryByTestId("command-palette-mock")).toBeNull();
        fireEvent.click(screen.getByTestId("sidebar-search-button-collapsed"));
        expect(screen.getByTestId("command-palette-mock")).toBeTruthy();
    });

    it("closes command palette on close callback", () => {
        renderLayout();
        fireEvent.keyDown(window, { key: "k", ctrlKey: true });
        expect(screen.getByTestId("command-palette-mock")).toBeTruthy();
        fireEvent.click(screen.getByTestId("command-palette-mock"));
        expect(screen.queryByTestId("command-palette-mock")).toBeNull();
    });

    describe("responsive / mobile", () => {
        beforeEach(() => {
            Object.defineProperty(window, "innerWidth", { value: 800, writable: true });
            window.matchMedia = createMatchMedia(800);
        });

        it("shows hamburger button on mobile", () => {
            renderLayout();
            expect(screen.getByTestId("hamburger-button")).toBeTruthy();
        });

        it("opens drawer on hamburger click", () => {
            renderLayout();
            fireEvent.click(screen.getByTestId("hamburger-button"));
            expect(screen.getByTestId("drawer-backdrop")).toBeTruthy();
            // Sidebar nav visible in drawer
            expect(screen.getByText("Overview")).toBeTruthy();
        });

        it("closes drawer on backdrop click", () => {
            renderLayout();
            fireEvent.click(screen.getByTestId("hamburger-button"));
            expect(screen.getByTestId("drawer-backdrop")).toBeTruthy();
            fireEvent.click(screen.getByTestId("drawer-backdrop"));
            expect(screen.queryByTestId("drawer-backdrop")).toBeNull();
        });

        it("hides sidebar inline on mobile", () => {
            renderLayout();
            // Collapse toggle should not be present (desktop only)
            expect(screen.queryByTitle(/Collapse sidebar/)).toBeNull();
            expect(screen.queryByTitle(/Expand sidebar/)).toBeNull();
        });
    });

    describe("active route indicator", () => {
        it("active item has font-medium and text-zinc-100", () => {
            renderLayout("/");
            const dashboardLink = screen.getByText("Dashboard").closest("a");
            expect(dashboardLink?.className).toContain("font-medium");
            expect(dashboardLink?.className).toContain("text-zinc-100");
        });

        it("inactive item has text-zinc-400 without font-medium", () => {
            renderLayout("/");
            const catalogLink = screen.getByText("Catalog").closest("a");
            expect(catalogLink?.className).toContain("text-zinc-400");
            expect(catalogLink?.className).not.toContain("font-medium");
        });

        it("active item has left border indicator", () => {
            renderLayout("/");
            const dashboardLink = screen.getByText("Dashboard").closest("a");
            const indicator = dashboardLink?.querySelector(".bg-indigo-500");
            expect(indicator).toBeTruthy();
            expect(indicator?.className).toContain("w-[2px]");
        });

        it("active group label is text-zinc-300", () => {
            renderLayout("/");
            // The active/inactive colour lives on the group toggle button so it
            // tints the label, count badge and chevron together.
            const overviewToggle = screen.getByText("Overview").closest("button");
            expect(overviewToggle?.className).toContain("text-zinc-300");
        });

        it("inactive group label is text-zinc-500", () => {
            renderLayout("/");
            const inventoryToggle = screen.getByText("Inventory").closest("button");
            expect(inventoryToggle?.className).toContain("text-zinc-500");
        });

        it("shows dot indicator under icon when collapsed and active", () => {
            renderLayout("/");
            // Collapse sidebar
            fireEvent.click(screen.getByTitle("Collapse sidebar (⌘\\)"));
            // Find active link (Dashboard at /)
            const links = document.querySelectorAll("a[href='/']");
            const dashboardLink = Array.from(links).find(
                (l) => l.className.includes("font-medium"),
            );
            const dot = dashboardLink?.querySelector(".rounded-full.bg-indigo-500");
            expect(dot).toBeTruthy();
            expect(dot?.className).toContain("w-1");
            expect(dot?.className).toContain("h-1");
        });

        it("does not show left border when collapsed", () => {
            renderLayout("/");
            fireEvent.click(screen.getByTitle("Collapse sidebar (⌘\\)"));
            const links = document.querySelectorAll("a[href='/']");
            const dashboardLink = Array.from(links).find(
                (l) => l.className.includes("font-medium"),
            );
            const leftBorder = dashboardLink?.querySelector(".w-\\[2px\\]");
            expect(leftBorder).toBeNull();
        });
    });
});
