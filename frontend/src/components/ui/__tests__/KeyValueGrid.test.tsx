import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { KeyValueGrid } from "../KeyValueGrid";

describe("KeyValueGrid", () => {
    it("renders labels and values", () => {
        render(
            <KeyValueGrid
                items={[
                    { label: "Name", value: "Widget A" },
                    { label: "SKU", value: "SKU-001" },
                ]}
            />
        );
        expect(screen.getByText("Name")).toBeTruthy();
        expect(screen.getByText("Widget A")).toBeTruthy();
        expect(screen.getByText("SKU")).toBeTruthy();
        expect(screen.getByText("SKU-001")).toBeTruthy();
    });

    it("renders em dash for null/undefined values", () => {
        render(
            <KeyValueGrid items={[{ label: "Notes", value: null }]} />
        );
        expect(screen.getByText("—")).toBeTruthy();
    });

    it("uses responsive grid classes", () => {
        const { container } = render(
            <KeyValueGrid items={[{ label: "A", value: "1" }]} />
        );
        const grid = container.firstElementChild!;
        expect(grid.className).toContain("grid");
        expect(grid.className).toContain("grid-cols-2");
        expect(grid.className).toContain("md:grid-cols-3");
        expect(grid.className).toContain("gap-x-8");
        expect(grid.className).toContain("gap-y-4");
    });

    it("applies label styling", () => {
        render(
            <KeyValueGrid items={[{ label: "Status", value: "Active" }]} />
        );
        const label = screen.getByText("Status");
        expect(label.className).toContain("text-sm");
        expect(label.className).toContain("text-zinc-500");
    });

    it("applies value styling", () => {
        render(
            <KeyValueGrid items={[{ label: "Status", value: "Active" }]} />
        );
        const value = screen.getByText("Active");
        expect(value.className).toContain("text-sm");
        expect(value.className).toContain("text-zinc-200");
        expect(value.className).toContain("font-medium");
    });

    it("applies col-span class when span > 1", () => {
        const { container } = render(
            <KeyValueGrid
                items={[{ label: "Description", value: "Long text", span: 2 }]}
            />
        );
        const item = container.querySelector(".col-span-2");
        expect(item).toBeTruthy();
    });

    it("does not apply col-span class when span is 1", () => {
        const { container } = render(
            <KeyValueGrid items={[{ label: "Name", value: "X", span: 1 }]} />
        );
        const grid = container.firstElementChild!;
        const item = grid.firstElementChild!;
        expect(item.className).not.toContain("col-span");
    });

    it("renders ReactNode values", () => {
        render(
            <KeyValueGrid
                items={[
                    {
                        label: "Status",
                        value: <span data-testid="badge">Active</span>,
                    },
                ]}
            />
        );
        expect(screen.getByTestId("badge")).toBeTruthy();
    });

    it("renders empty grid when items array is empty", () => {
        const { container } = render(<KeyValueGrid items={[]} />);
        const grid = container.firstElementChild!;
        expect(grid.children.length).toBe(0);
    });

    it("renders multiple items in order", () => {
        const { container } = render(
            <KeyValueGrid
                items={[
                    { label: "A", value: "1" },
                    { label: "B", value: "2" },
                    { label: "C", value: "3" },
                ]}
            />
        );
        const grid = container.firstElementChild!;
        expect(grid.children.length).toBe(3);
        expect(grid.children[0].textContent).toContain("A");
        expect(grid.children[1].textContent).toContain("B");
        expect(grid.children[2].textContent).toContain("C");
    });
});
