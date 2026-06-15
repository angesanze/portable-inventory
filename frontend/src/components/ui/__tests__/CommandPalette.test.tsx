import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import i18n from "../../../i18n";
import { CommandPalette } from "../CommandPalette";

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
    useNavigate: () => mockNavigate,
}));

describe("CommandPalette", () => {
    const defaultProps = {
        open: true,
        onClose: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it("renders nothing when closed", () => {
        const { container } = render(
            <CommandPalette open={false} onClose={vi.fn()} />,
        );
        expect(container.innerHTML).toBe("");
    });

    it("renders overlay and dialog when open", () => {
        render(<CommandPalette {...defaultProps} />);
        expect(screen.getByTestId("command-palette-overlay")).toBeTruthy();
        expect(screen.getByTestId("command-palette")).toBeTruthy();
        expect(screen.getByTestId("command-palette-input")).toBeTruthy();
    });

    it("shows all command categories when no query", () => {
        render(<CommandPalette {...defaultProps} />);
        expect(screen.getAllByText("Navigation").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Actions").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
    });

    it("shows search input with placeholder", () => {
        render(<CommandPalette {...defaultProps} />);
        const input = screen.getByTestId("command-palette-input") as HTMLInputElement;
        expect(input.placeholder).toBe("Type a command or search...");
    });

    it("filters results by query", () => {
        render(<CommandPalette {...defaultProps} />);
        const input = screen.getByTestId("command-palette-input");
        fireEvent.change(input, { target: { value: "dashboard" } });
        expect(screen.getByText("Dashboard")).toBeTruthy();
        // "Ship Out" should not match "dashboard"
        expect(screen.queryByText("Ship Out")).toBeNull();
    });

    it("shows 'No commands found' for non-matching query", () => {
        render(<CommandPalette {...defaultProps} />);
        const input = screen.getByTestId("command-palette-input");
        fireEvent.change(input, { target: { value: "xyznonexistent" } });
        expect(screen.getByText("No commands found")).toBeTruthy();
    });

    it("closes on overlay click", () => {
        const onClose = vi.fn();
        render(<CommandPalette open={true} onClose={onClose} />);
        fireEvent.click(screen.getByTestId("command-palette-overlay"));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("does not close on dialog body click", () => {
        const onClose = vi.fn();
        render(<CommandPalette open={true} onClose={onClose} />);
        fireEvent.click(screen.getByTestId("command-palette"));
        expect(onClose).not.toHaveBeenCalled();
    });

    it("closes on Escape key", () => {
        const onClose = vi.fn();
        render(<CommandPalette open={true} onClose={onClose} />);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("navigates on Enter key", () => {
        render(<CommandPalette {...defaultProps} />);
        // First item should be highlighted by default (Dashboard)
        fireEvent.keyDown(window, { key: "Enter" });
        expect(defaultProps.onClose).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("arrow down moves highlight", () => {
        render(<CommandPalette {...defaultProps} />);
        // Move down once from Dashboard to Products
        fireEvent.keyDown(window, { key: "ArrowDown" });
        fireEvent.keyDown(window, { key: "Enter" });
        expect(mockNavigate).toHaveBeenCalledWith("/products");
    });

    it("arrow up wraps around", () => {
        render(<CommandPalette {...defaultProps} />);
        // ArrowUp from 0 should wrap to last visible item
        fireEvent.keyDown(window, { key: "ArrowUp" });
        fireEvent.keyDown(window, { key: "Enter" });
        // Should have navigated to some command (last visible)
        expect(mockNavigate).toHaveBeenCalled();
    });

    it("navigates on command click", () => {
        render(<CommandPalette {...defaultProps} />);
        fireEvent.click(screen.getByTestId("command-item-0"));
        expect(defaultProps.onClose).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("handles routes with query params", () => {
        render(<CommandPalette {...defaultProps} />);
        const input = screen.getByTestId("command-palette-input");
        fireEvent.change(input, { target: { value: "receive" } });
        fireEvent.keyDown(window, { key: "Enter" });
        expect(mockNavigate).toHaveBeenCalledWith("/movements/create?direction=inbound");
    });

    it("matches on keywords", () => {
        render(<CommandPalette {...defaultProps} />);
        const input = screen.getByTestId("command-palette-input");
        fireEvent.change(input, { target: { value: "inbound" } });
        expect(screen.getByText("Receive Stock")).toBeTruthy();
    });

    it("mouse enter updates highlight", () => {
        render(<CommandPalette {...defaultProps} />);
        // Hover over second item
        fireEvent.mouseEnter(screen.getByTestId("command-item-1"));
        fireEvent.keyDown(window, { key: "Enter" });
        expect(mockNavigate).toHaveBeenCalledWith("/products");
    });

    it("limits visible results to 8", () => {
        render(<CommandPalette {...defaultProps} />);
        const results = screen.getByTestId("command-palette-results");
        // Count all command-item buttons
        const items = results.querySelectorAll("[data-testid^='command-item-']");
        expect(items.length).toBeLessThanOrEqual(8);
    });

    it("resets query when reopened", () => {
        const { rerender } = render(<CommandPalette open={true} onClose={vi.fn()} />);
        const input = screen.getByTestId("command-palette-input") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "test" } });
        expect(input.value).toBe("test");

        // Close and reopen
        rerender(<CommandPalette open={false} onClose={vi.fn()} />);
        rerender(<CommandPalette open={true} onClose={vi.fn()} />);

        const newInput = screen.getByTestId("command-palette-input") as HTMLInputElement;
        expect(newInput.value).toBe("");
    });

    describe("i18n", () => {
        it("renders translated labels and categories in Italian", async () => {
            await i18n.changeLanguage("it");
            try {
                render(<CommandPalette {...defaultProps} />);
                // Nav label + category header translated
                expect(screen.getByText("Prodotti")).toBeTruthy();
                expect(screen.getAllByText("Navigazione").length).toBeGreaterThan(0);
                expect(screen.getAllByText("Azioni").length).toBeGreaterThan(0);
                // Action command translated (first action, within visible limit)
                expect(screen.getByText("Crea Prodotto")).toBeTruthy();
                // Placeholder translated
                const input = screen.getByTestId("command-palette-input") as HTMLInputElement;
                expect(input.placeholder).toBe("Digita un comando o cerca...");
            } finally {
                await i18n.changeLanguage("en");
            }
        });

        it("filters by translated label", async () => {
            await i18n.changeLanguage("it");
            try {
                render(<CommandPalette {...defaultProps} />);
                const input = screen.getByTestId("command-palette-input");
                fireEvent.change(input, { target: { value: "spedisci" } });
                expect(screen.getByText("Spedisci")).toBeTruthy();
                expect(screen.queryByText("Prodotti")).toBeNull();
            } finally {
                await i18n.changeLanguage("en");
            }
        });
    });

    describe("recent commands", () => {
        function seedRecents(entries: { label: string; route: string }[]) {
            const data = entries.map((e, i) => ({ ...e, timestamp: Date.now() - i * 1000 }));
            localStorage.setItem("recentCommands", JSON.stringify(data));
        }

        it("shows recent section when recents exist and query is empty", () => {
            seedRecents([{ label: "Dashboard", route: "/" }]);
            render(<CommandPalette {...defaultProps} />);
            expect(screen.getByTestId("recent-commands-section")).toBeTruthy();
            expect(screen.getByText("Recent")).toBeTruthy();
        });

        it("does not show recent section when no recents", () => {
            render(<CommandPalette {...defaultProps} />);
            expect(screen.queryByTestId("recent-commands-section")).toBeNull();
        });

        it("does not show recent section when query is entered", () => {
            seedRecents([{ label: "Dashboard", route: "/" }]);
            render(<CommandPalette {...defaultProps} />);
            const input = screen.getByTestId("command-palette-input");
            fireEvent.change(input, { target: { value: "stock" } });
            expect(screen.queryByTestId("recent-commands-section")).toBeNull();
        });

        it("saves command to recents on select", () => {
            render(<CommandPalette {...defaultProps} />);
            // Select Dashboard (first item)
            fireEvent.keyDown(window, { key: "Enter" });
            const stored = JSON.parse(localStorage.getItem("recentCommands") || "[]");
            expect(stored).toHaveLength(1);
            expect(stored[0].label).toBe("Dashboard");
            expect(stored[0].route).toBe("/");
        });

        it("limits recents to 5 entries", () => {
            seedRecents([
                { label: "Dashboard", route: "/" },
                { label: "Products", route: "/products" },
                { label: "Stock", route: "/stock" },
                { label: "Locations", route: "/locations" },
                { label: "Movements", route: "/movements" },
            ]);
            render(<CommandPalette {...defaultProps} />);
            // Select another command to push a 6th
            const input = screen.getByTestId("command-palette-input");
            fireEvent.change(input, { target: { value: "work orders" } });
            fireEvent.keyDown(window, { key: "Enter" });
            const stored = JSON.parse(localStorage.getItem("recentCommands") || "[]");
            expect(stored.length).toBeLessThanOrEqual(5);
            expect(stored[0].label).toBe("Work Orders");
        });

        it("deduplicates recents by route", () => {
            seedRecents([{ label: "Dashboard", route: "/" }]);
            render(<CommandPalette {...defaultProps} />);
            // Select Dashboard again
            fireEvent.keyDown(window, { key: "Enter" });
            const stored = JSON.parse(localStorage.getItem("recentCommands") || "[]");
            const dashRoutes = stored.filter((r: { route: string }) => r.route === "/");
            expect(dashRoutes).toHaveLength(1);
        });

        it("clears recents when clear button clicked", () => {
            seedRecents([{ label: "Dashboard", route: "/" }]);
            render(<CommandPalette {...defaultProps} />);
            expect(screen.getByTestId("recent-commands-section")).toBeTruthy();
            fireEvent.click(screen.getByTestId("clear-recents"));
            expect(screen.queryByTestId("recent-commands-section")).toBeNull();
            expect(localStorage.getItem("recentCommands")).toBeNull();
        });

        it("navigates when selecting a recent command via Enter", () => {
            seedRecents([{ label: "Products", route: "/products" }]);
            render(<CommandPalette {...defaultProps} />);
            // First item should be recent "Products"
            fireEvent.keyDown(window, { key: "Enter" });
            expect(mockNavigate).toHaveBeenCalledWith("/products");
        });

        it("keeps total visible items within max limit", () => {
            seedRecents([
                { label: "Dashboard", route: "/" },
                { label: "Products", route: "/products" },
                { label: "Stock", route: "/stock" },
            ]);
            render(<CommandPalette {...defaultProps} />);
            const results = screen.getByTestId("command-palette-results");
            const items = results.querySelectorAll("[data-testid^='command-item-']");
            expect(items.length).toBeLessThanOrEqual(8);
        });
    });
});
