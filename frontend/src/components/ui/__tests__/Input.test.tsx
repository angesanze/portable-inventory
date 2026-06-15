import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Input, Textarea } from "../Input";
import { Search } from "lucide-react";

describe("Input", () => {
    it("renders basic input", () => {
        render(<Input placeholder="Type here" />);
        expect(screen.getByPlaceholderText("Type here")).toBeTruthy();
    });

    it("renders label linked to input", () => {
        render(<Input label="Email" />);
        const label = screen.getByText("Email");
        const input = screen.getByLabelText("Email");
        expect(label.tagName).toBe("LABEL");
        expect(input.tagName).toBe("INPUT");
    });

    it("applies base styles", () => {
        render(<Input data-testid="inp" />);
        const input = screen.getByTestId("inp");
        expect(input.className).toContain("bg-zinc-900");
        expect(input.className).toContain("rounded-lg");
        expect(input.className).toContain("h-9");
    });

    it("shows error message and error ring", () => {
        render(<Input error="Required field" />);
        expect(screen.getByText("Required field")).toBeTruthy();
        const input = screen.getByRole("textbox");
        expect(input.className).toContain("ring-red-500/30");
        expect(input.className).toContain("border-red-500/50");
    });

    it("shows helper text when no error", () => {
        render(<Input helperText="Enter your email" />);
        expect(screen.getByText("Enter your email")).toBeTruthy();
    });

    it("hides helper text when error present", () => {
        render(<Input error="Bad" helperText="Enter your email" />);
        expect(screen.queryByText("Enter your email")).toBeNull();
        expect(screen.getByText("Bad")).toBeTruthy();
    });

    it("renders left icon with padding adjustment", () => {
        render(<Input icon={Search} data-testid="inp" />);
        const input = screen.getByTestId("inp");
        expect(input.className).toContain("pl-9");
        const svg = input.parentElement?.querySelector("svg");
        expect(svg).toBeTruthy();
    });

    it("forwards ref", () => {
        const ref = vi.fn();
        render(<Input ref={ref} />);
        expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
    });

    it("merges custom className", () => {
        render(<Input className="mt-4" data-testid="inp" />);
        expect(screen.getByTestId("inp").className).toContain("mt-4");
    });

    it("passes through HTML input props", () => {
        render(<Input type="email" required data-testid="inp" />);
        const input = screen.getByTestId("inp") as HTMLInputElement;
        expect(input.type).toBe("email");
        expect(input.required).toBe(true);
    });

    it("handles disabled state", () => {
        render(<Input disabled data-testid="inp" />);
        expect((screen.getByTestId("inp") as HTMLInputElement).disabled).toBe(true);
    });

    it("renders labelExtra next to label", () => {
        render(<Input label="SKU" labelExtra={<span data-testid="extra">?</span>} />);
        expect(screen.getByText("SKU")).toBeTruthy();
        expect(screen.getByTestId("extra")).toBeTruthy();
        const label = screen.getByText("SKU").closest("label");
        expect(label?.querySelector("[data-testid='extra']")).toBeTruthy();
    });
});

describe("Textarea", () => {
    it("renders textarea element", () => {
        render(<Textarea placeholder="Notes" />);
        const ta = screen.getByPlaceholderText("Notes");
        expect(ta.tagName).toBe("TEXTAREA");
    });

    it("renders label", () => {
        render(<Textarea label="Description" />);
        expect(screen.getByLabelText("Description")).toBeTruthy();
    });

    it("applies base styles", () => {
        render(<Textarea data-testid="ta" />);
        const ta = screen.getByTestId("ta");
        expect(ta.className).toContain("bg-zinc-900");
        expect(ta.className).toContain("rounded-lg");
        expect(ta.className).toContain("resize-y");
    });

    it("shows error message and ring", () => {
        render(<Textarea error="Too short" />);
        expect(screen.getByText("Too short")).toBeTruthy();
        const ta = screen.getByRole("textbox");
        expect(ta.className).toContain("ring-red-500/30");
    });

    it("forwards ref", () => {
        const ref = vi.fn();
        render(<Textarea ref={ref} />);
        expect(ref).toHaveBeenCalledWith(expect.any(HTMLTextAreaElement));
    });

    it("merges custom className", () => {
        render(<Textarea className="mt-2" data-testid="ta" />);
        expect(screen.getByTestId("ta").className).toContain("mt-2");
    });

    it("renders labelExtra next to label", () => {
        render(<Textarea label="Notes" labelExtra={<span data-testid="extra">?</span>} />);
        expect(screen.getByText("Notes")).toBeTruthy();
        const label = screen.getByText("Notes").closest("label");
        expect(label?.querySelector("[data-testid='extra']")).toBeTruthy();
    });
});
