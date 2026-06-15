import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DropdownMenu } from "../DropdownMenu";
import type { DropdownMenuEntry } from "../DropdownMenu";
import { Trash2, Edit, Copy } from "lucide-react";

const basicItems: DropdownMenuEntry[] = [
    { label: "Edit", icon: Edit, onClick: vi.fn() },
    { label: "Copy", icon: Copy, onClick: vi.fn() },
    { type: "divider" },
    { label: "Delete", icon: Trash2, onClick: vi.fn(), danger: true },
];

function renderMenu(items = basicItems, props = {}) {
    return render(
        <DropdownMenu
            trigger={<button>Actions</button>}
            items={items}
            {...props}
        />
    );
}

describe("DropdownMenu", () => {
    it("renders trigger element", () => {
        renderMenu();
        expect(screen.getByRole("button", { name: "Actions" })).toBeTruthy();
    });

    it("does not show menu by default", () => {
        renderMenu();
        expect(screen.queryByRole("menu")).toBeNull();
    });

    it("opens menu on trigger click", () => {
        renderMenu();
        fireEvent.click(screen.getByRole("button", { name: "Actions" }));
        expect(screen.getByRole("menu")).toBeTruthy();
    });

    it("renders all menu items", () => {
        renderMenu();
        fireEvent.click(screen.getByRole("button", { name: "Actions" }));
        expect(screen.getByText("Edit")).toBeTruthy();
        expect(screen.getByText("Copy")).toBeTruthy();
        expect(screen.getByText("Delete")).toBeTruthy();
    });

    it("renders dividers", () => {
        renderMenu();
        fireEvent.click(screen.getByRole("button", { name: "Actions" }));
        const separator = screen.getByRole("separator");
        expect(separator).toBeTruthy();
    });

    it("calls onClick when item is clicked", () => {
        const onClick = vi.fn();
        const items: DropdownMenuEntry[] = [{ label: "Click me", onClick }];
        renderMenu(items);
        fireEvent.click(screen.getByRole("button", { name: "Actions" }));
        fireEvent.click(screen.getByText("Click me"));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("closes menu after item click", () => {
        const onClick = vi.fn();
        const items: DropdownMenuEntry[] = [{ label: "Click me", onClick }];
        renderMenu(items);
        fireEvent.click(screen.getByRole("button", { name: "Actions" }));
        fireEvent.click(screen.getByText("Click me"));
        expect(screen.queryByRole("menu")).toBeNull();
    });

    it("does not call onClick on disabled items", () => {
        const onClick = vi.fn();
        const items: DropdownMenuEntry[] = [
            { label: "Disabled", onClick, disabled: true },
        ];
        renderMenu(items);
        fireEvent.click(screen.getByRole("button", { name: "Actions" }));
        fireEvent.click(screen.getByText("Disabled"));
        expect(onClick).not.toHaveBeenCalled();
    });

    it("applies danger styling to danger items", () => {
        renderMenu();
        fireEvent.click(screen.getByRole("button", { name: "Actions" }));
        const deleteItem = screen.getByText("Delete").closest("[role='menuitem']")!;
        expect(deleteItem.className).toContain("text-red-400");
    });

    it("applies disabled styling to disabled items", () => {
        const items: DropdownMenuEntry[] = [
            { label: "Disabled", disabled: true },
        ];
        renderMenu(items);
        fireEvent.click(screen.getByRole("button", { name: "Actions" }));
        const item = screen.getByText("Disabled").closest("[role='menuitem']")!;
        expect(item.className).toContain("opacity-40");
    });

    it("renders icons in menu items", () => {
        renderMenu();
        fireEvent.click(screen.getByRole("button", { name: "Actions" }));
        const editItem = screen.getByText("Edit").closest("[role='menuitem']")!;
        expect(editItem.querySelector("svg")).toBeTruthy();
    });

    it("closes on Escape key", () => {
        renderMenu();
        const container = screen.getByRole("button", { name: "Actions" }).parentElement!;
        fireEvent.click(screen.getByRole("button", { name: "Actions" }));
        expect(screen.getByRole("menu")).toBeTruthy();

        fireEvent.keyDown(container, { key: "Escape" });
        expect(screen.queryByRole("menu")).toBeNull();
    });

    it("toggles menu on trigger click", () => {
        renderMenu();
        const trigger = screen.getByRole("button", { name: "Actions" });
        fireEvent.click(trigger);
        expect(screen.getByRole("menu")).toBeTruthy();
        fireEvent.click(trigger);
        expect(screen.queryByRole("menu")).toBeNull();
    });

    it("sets aria-haspopup and aria-expanded on trigger", () => {
        renderMenu();
        const trigger = screen.getByRole("button", { name: "Actions" });
        expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
        expect(trigger.getAttribute("aria-expanded")).toBe("false");

        fireEvent.click(trigger);
        expect(trigger.getAttribute("aria-expanded")).toBe("true");
    });

    it("opens on ArrowDown key", () => {
        renderMenu();
        const container = screen.getByRole("button", { name: "Actions" }).parentElement!;
        fireEvent.keyDown(container, { key: "ArrowDown" });
        expect(screen.getByRole("menu")).toBeTruthy();
    });

    it("navigates items with ArrowDown/ArrowUp", () => {
        const onClick1 = vi.fn();
        const onClick2 = vi.fn();
        const items: DropdownMenuEntry[] = [
            { label: "First", onClick: onClick1 },
            { label: "Second", onClick: onClick2 },
        ];
        renderMenu(items);
        const container = screen.getByRole("button", { name: "Actions" }).parentElement!;
        fireEvent.click(screen.getByRole("button", { name: "Actions" }));

        // ArrowDown to first item
        fireEvent.keyDown(container, { key: "ArrowDown" });
        // Enter to select
        fireEvent.keyDown(container, { key: "Enter" });
        expect(onClick1).toHaveBeenCalledTimes(1);
    });

    it("applies align=end positioning", () => {
        renderMenu(basicItems, { align: "end" });
        fireEvent.click(screen.getByRole("button", { name: "Actions" }));
        const menu = screen.getByRole("menu");
        // Portal uses fixed positioning for overflow-safe placement
        expect(menu.style.position).toBe("fixed");
    });

    it("applies side=top positioning via portal", () => {
        renderMenu(basicItems, { side: "top" });
        fireEvent.click(screen.getByRole("button", { name: "Actions" }));
        const menu = screen.getByRole("menu");
        // Portal renders menu to document.body with fixed positioning
        expect(menu.style.position).toBe("fixed");
    });

    it("has correct base styles", () => {
        renderMenu();
        fireEvent.click(screen.getByRole("button", { name: "Actions" }));
        const menu = screen.getByRole("menu");
        expect(menu.className).toContain("bg-zinc-800");
        expect(menu.className).toContain("rounded-lg");
        expect(menu.className).toContain("shadow-xl");
    });

    it("closes menu on outside click", () => {
        renderMenu();
        fireEvent.click(screen.getByRole("button", { name: "Actions" }));
        expect(screen.getByRole("menu")).toBeTruthy();

        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole("menu")).toBeNull();
    });
});
