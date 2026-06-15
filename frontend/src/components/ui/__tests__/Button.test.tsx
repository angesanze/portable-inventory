import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Button } from "../Button";
import { Plus } from "lucide-react";

describe("Button", () => {
    it("renders children text", () => {
        render(<Button>Click me</Button>);
        expect(screen.getByRole("button", { name: "Click me" })).toBeTruthy();
    });

    it("applies primary variant by default", () => {
        render(<Button>Primary</Button>);
        const btn = screen.getByRole("button");
        expect(btn.className).toContain("bg-gradient-to-r");
    });

    it("applies secondary variant styles", () => {
        render(<Button variant="secondary">Secondary</Button>);
        const btn = screen.getByRole("button");
        expect(btn.className).toContain("border-white/[0.06]");
    });

    it("applies ghost variant styles", () => {
        render(<Button variant="ghost">Ghost</Button>);
        const btn = screen.getByRole("button");
        expect(btn.className).toContain("text-zinc-400");
    });

    it("applies danger variant styles", () => {
        render(<Button variant="danger">Danger</Button>);
        const btn = screen.getByRole("button");
        expect(btn.className).toContain("bg-red-500/10");
    });

    it("applies size classes", () => {
        const { rerender } = render(<Button size="sm">Sm</Button>);
        expect(screen.getByRole("button").className).toContain("h-8");

        rerender(<Button size="md">Md</Button>);
        expect(screen.getByRole("button").className).toContain("h-9");

        rerender(<Button size="lg">Lg</Button>);
        expect(screen.getByRole("button").className).toContain("h-10");
    });

    it("renders icon when provided", () => {
        render(<Button icon={Plus}>Add</Button>);
        const btn = screen.getByRole("button");
        const svg = btn.querySelector("svg");
        expect(svg).toBeTruthy();
    });

    it("shows spinner and disables when loading", () => {
        render(<Button loading>Save</Button>);
        const btn = screen.getByRole("button");
        expect(btn.disabled).toBe(true);
        expect(btn.querySelector(".animate-spin")).toBeTruthy();
    });

    it("is disabled when disabled prop is set", () => {
        render(<Button disabled>Nope</Button>);
        expect(screen.getByRole("button").disabled).toBe(true);
    });

    it("calls onClick handler", () => {
        const onClick = vi.fn();
        render(<Button onClick={onClick}>Click</Button>);
        fireEvent.click(screen.getByRole("button"));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("does not call onClick when loading", () => {
        const onClick = vi.fn();
        render(<Button loading onClick={onClick}>Click</Button>);
        fireEvent.click(screen.getByRole("button"));
        expect(onClick).not.toHaveBeenCalled();
    });

    it("forwards ref", () => {
        const ref = vi.fn();
        render(<Button ref={ref}>Ref</Button>);
        expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
    });

    it("merges custom className", () => {
        render(<Button className="mt-4">Custom</Button>);
        expect(screen.getByRole("button").className).toContain("mt-4");
    });

    it("has focus-visible ring styles", () => {
        render(<Button>Focus</Button>);
        expect(screen.getByRole("button").className).toContain("focus-visible:ring-2");
    });
});
