import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Select } from "../Select";
import type { SelectOption } from "../Select";
import { Star } from "lucide-react";

const basicOptions: SelectOption[] = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
    { value: "c", label: "Gamma" },
];

const richOptions: SelectOption[] = [
    { value: 1, label: "One", description: "First item" },
    { value: 2, label: "Two", description: "Second item", icon: Star },
];

/* ─── Default (custom dropdown) ─────────────────────────────────── */

describe("Select – default (custom) mode", () => {
    it("renders custom combobox button, not native select", () => {
        render(<Select options={basicOptions} />);
        expect(screen.getByRole("combobox")).toBeTruthy();
        expect(document.querySelector("select")).toBeNull();
    });

    it("renders placeholder when no value selected", () => {
        render(<Select options={basicOptions} placeholder="Pick one" />);
        expect(screen.getByText("Pick one")).toBeTruthy();
    });

    it("renders label linked to combobox", () => {
        render(<Select options={basicOptions} label="Country" />);
        expect(screen.getByText("Country").tagName).toBe("LABEL");
        expect(screen.getByLabelText("Country").tagName).toBe("BUTTON");
    });

    it("applies design system base styles", () => {
        render(<Select options={basicOptions} />);
        const el = screen.getByRole("combobox");
        expect(el.className).toContain("bg-zinc-900");
        expect(el.className).toContain("rounded-lg");
        expect(el.className).toContain("h-9");
    });

    it("shows error text", () => {
        render(<Select options={basicOptions} error="Required" />);
        expect(screen.getByText("Required")).toBeTruthy();
    });

    it("shows helper text when no error", () => {
        render(<Select options={basicOptions} helperText="Pick wisely" />);
        expect(screen.getByText("Pick wisely")).toBeTruthy();
    });

    it("hides helper when error present", () => {
        render(<Select options={basicOptions} error="Oops" helperText="Pick wisely" />);
        expect(screen.queryByText("Pick wisely")).toBeNull();
    });
});

/* ─── Native select (opt-in via custom={false}) ─────────────────── */

describe("Select – native mode (custom={false})", () => {
    it("renders native <select> with options when custom={false}", () => {
        render(<Select custom={false} options={basicOptions} data-testid="sel" />);
        const el = screen.getByTestId("sel");
        expect(el.tagName).toBe("SELECT");
        expect(screen.getByText("Alpha")).toBeTruthy();
        expect(screen.getByText("Beta")).toBeTruthy();
    });
});

/* ─── Custom dropdown ──────────────────────────────────────────── */

describe("Select – custom mode", () => {
    it("renders button trigger, not native select", () => {
        render(<Select custom options={basicOptions} />);
        expect(screen.getByRole("combobox")).toBeTruthy();
        expect(screen.queryByRole("listbox")).toBeNull(); // closed
    });

    it("auto-enables custom mode when options have descriptions", () => {
        render(<Select options={richOptions} custom />);
        expect(screen.getByRole("combobox")).toBeTruthy();
    });

    it("opens dropdown on click and shows options", () => {
        render(<Select custom options={basicOptions} />);
        fireEvent.click(screen.getByRole("combobox"));
        expect(screen.getByText("Alpha")).toBeTruthy();
        expect(screen.getByText("Beta")).toBeTruthy();
    });

    it("calls onChange when option selected", () => {
        const onChange = vi.fn();
        render(<Select custom options={basicOptions} onChange={onChange} />);
        fireEvent.click(screen.getByRole("combobox"));
        fireEvent.click(screen.getByText("Beta"));
        expect(onChange).toHaveBeenCalledWith("b");
    });

    it("closes dropdown after selection", () => {
        const onChange = vi.fn();
        render(<Select custom options={basicOptions} onChange={onChange} />);
        fireEvent.click(screen.getByRole("combobox"));
        fireEvent.click(screen.getByText("Alpha"));
        // dropdown should close — options no longer visible as role=option
        expect(screen.queryAllByRole("option")).toHaveLength(0);
    });

    it("shows placeholder when no value selected", () => {
        render(<Select custom options={basicOptions} placeholder="Choose…" />);
        expect(screen.getByText("Choose…")).toBeTruthy();
    });

    it("shows selected option label", () => {
        render(<Select custom options={basicOptions} value="b" />);
        expect(screen.getByText("Beta")).toBeTruthy();
    });

    it("renders option descriptions", () => {
        render(<Select custom options={richOptions} />);
        fireEvent.click(screen.getByRole("combobox"));
        expect(screen.getByText("First item")).toBeTruthy();
        expect(screen.getByText("Second item")).toBeTruthy();
    });

    it("applies token-driven dropdown styles via inline CSS variables", () => {
        render(<Select custom options={basicOptions} />);
        fireEvent.click(screen.getByRole("combobox"));
        const dropdown = screen
            .getAllByRole("option")[0]
            .closest('[role="listbox"]') as HTMLElement | null;
        expect(dropdown).toBeTruthy();
        // Portal listbox is mounted into document.body — outside any `.pi-theme`
        // scope — so background must be set via inline CSS variable so it can
        // inherit per-company branding from documentElement (widget) or fall
        // back to the admin zinc default.
        const inlineStyle = dropdown!.getAttribute("style") ?? "";
        expect(inlineStyle).toContain("var(--pi-surface");
        expect(inlineStyle).toContain("var(--pi-border");
    });

    it("shows error text", () => {
        render(<Select custom options={basicOptions} error="Required" />);
        expect(screen.getByText("Required")).toBeTruthy();
    });

    it("renders hidden input with name", () => {
        const { container } = render(
            <Select custom options={basicOptions} name="category" value="a" />
        );
        const hidden = container.querySelector('input[type="hidden"]') as HTMLInputElement;
        expect(hidden).toBeTruthy();
        expect(hidden.name).toBe("category");
        expect(hidden.value).toBe("a");
    });

    it("does not open when disabled", () => {
        render(<Select custom options={basicOptions} disabled />);
        fireEvent.click(screen.getByRole("combobox"));
        expect(screen.queryAllByRole("option")).toHaveLength(0);
    });

    it("shows empty state", () => {
        render(<Select custom options={[]} />);
        fireEvent.click(screen.getByRole("combobox"));
        expect(screen.getByText("No options available")).toBeTruthy();
    });
});
