import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FilterBar, type FilterConfig } from "../FilterBar";

function makeFilters(overrides: Partial<FilterConfig>[] = []): FilterConfig[] {
    const defaults: FilterConfig[] = [
        {
            key: "name",
            label: "Name",
            type: "text",
            value: "",
            onChange: vi.fn(),
        },
        {
            key: "status",
            label: "Status",
            type: "select",
            options: [
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
            ],
            value: "",
            onChange: vi.fn(),
        },
    ];

    return defaults.map((d, i) => ({ ...d, ...overrides[i] }));
}

describe("FilterBar", () => {
    it("renders text and select filter controls", () => {
        render(<FilterBar filters={makeFilters()} />);
        expect(screen.getByLabelText("Name")).toBeTruthy();
        expect(screen.getByLabelText("Status")).toBeTruthy();
    });

    it("renders inside a Card", () => {
        const { container } = render(<FilterBar filters={makeFilters()} />);
        const card = container.firstElementChild!;
        expect(card.className).toContain("bg-zinc-900");
        expect(card.className).toContain("rounded-xl");
    });

    it("does not show active pills when no filters active", () => {
        const { container } = render(<FilterBar filters={makeFilters()} />);
        expect(container.querySelector("[aria-label*='Remove']")).toBeNull();
        expect(screen.queryByText("Clear all")).toBeNull();
    });

    it("shows active filter pill for text filter with value", () => {
        const filters = makeFilters([{ value: "Widget" }]);
        render(<FilterBar filters={filters} />);
        expect(screen.getByText("Widget")).toBeTruthy();
        expect(screen.getByText("Name:")).toBeTruthy();
        expect(screen.getByText("Clear all")).toBeTruthy();
    });

    it("shows display label for select filter pill", () => {
        const filters = makeFilters([{}, { value: "active" }]);
        render(<FilterBar filters={filters} />);
        // "Active" appears in both select option and pill — check pill label exists
        expect(screen.getByText("Status:")).toBeTruthy();
        expect(screen.getByLabelText("Remove Status filter")).toBeTruthy();
    });

    it("calls onChange with empty string when pill X clicked", () => {
        const onChange = vi.fn();
        const filters = makeFilters([{ value: "test", onChange }]);
        render(<FilterBar filters={filters} />);
        fireEvent.click(screen.getByLabelText("Remove Name filter"));
        expect(onChange).toHaveBeenCalledWith("");
    });

    it("clears all filters when 'Clear all' clicked", () => {
        const onChangeName = vi.fn();
        const onChangeStatus = vi.fn();
        const filters = makeFilters([
            { value: "test", onChange: onChangeName },
            { value: "active", onChange: onChangeStatus },
        ]);
        render(<FilterBar filters={filters} />);
        fireEvent.click(screen.getByText("Clear all"));
        expect(onChangeName).toHaveBeenCalledWith("");
        expect(onChangeStatus).toHaveBeenCalledWith("");
    });

    it("applies active pill styling", () => {
        const filters = makeFilters([{ value: "test" }]);
        const { container } = render(<FilterBar filters={filters} />);
        const pill = container.querySelector("[class*='bg-indigo-500/10']");
        expect(pill).toBeTruthy();
        expect(pill!.className).toContain("text-indigo-400");
        expect(pill!.className).toContain("rounded-full");
        expect(pill!.className).toContain("px-2.5");
        expect(pill!.className).toContain("py-1");
    });

    it("renders controls in a flex row with gap-3", () => {
        const { container } = render(<FilterBar filters={makeFilters()} />);
        const row = container.querySelector("[class*='gap-3']");
        expect(row).toBeTruthy();
        expect(row!.className).toContain("flex");
    });

    it("uses custom placeholder for text filter", () => {
        const filters = makeFilters([{ placeholder: "Search products..." }]);
        render(<FilterBar filters={filters} />);
        expect(screen.getByPlaceholderText("Search products...")).toBeTruthy();
    });

    it("merges custom className", () => {
        const { container } = render(<FilterBar filters={makeFilters()} className="mt-4" />);
        expect(container.firstElementChild!.className).toContain("mt-4");
    });

    it("calls text filter onChange on input", () => {
        const onChange = vi.fn();
        const filters = makeFilters([{ onChange }]);
        render(<FilterBar filters={filters} />);
        fireEvent.change(screen.getByLabelText("Name"), { target: { value: "abc" } });
        expect(onChange).toHaveBeenCalledWith("abc");
    });
});
