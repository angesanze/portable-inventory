import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "../Badge";

describe("Badge", () => {
    it("renders children text", () => {
        render(<Badge>Active</Badge>);
        expect(screen.getByText("Active")).toBeTruthy();
    });

    it("applies neutral variant by default", () => {
        render(<Badge>Default</Badge>);
        const el = screen.getByText("Default");
        expect(el.className).toContain("bg-zinc-500/10");
        expect(el.className).toContain("text-zinc-400");
    });

    it("applies semantic variant styles", () => {
        const { rerender } = render(<Badge variant="success">Ok</Badge>);
        expect(screen.getByText("Ok").className).toContain("bg-emerald-500/10");

        rerender(<Badge variant="warning">Warn</Badge>);
        expect(screen.getByText("Warn").className).toContain("bg-amber-500/10");

        rerender(<Badge variant="error">Err</Badge>);
        expect(screen.getByText("Err").className).toContain("bg-rose-500/10");

        rerender(<Badge variant="info">Info</Badge>);
        expect(screen.getByText("Info").className).toContain("bg-cyan-500/10");

        rerender(<Badge variant="primary">Pri</Badge>);
        expect(screen.getByText("Pri").className).toContain("bg-indigo-500/10");
    });

    it("supports legacy color variants", () => {
        const { rerender } = render(<Badge variant="emerald">E</Badge>);
        expect(screen.getByText("E").className).toContain("text-emerald-400");

        rerender(<Badge variant="rose">R</Badge>);
        expect(screen.getByText("R").className).toContain("text-rose-400");

        rerender(<Badge variant="red">X</Badge>);
        expect(screen.getByText("X").className).toContain("text-red-400");

        rerender(<Badge variant="slate">S</Badge>);
        expect(screen.getByText("S").className).toContain("text-zinc-400");

        rerender(<Badge variant="cyan">C</Badge>);
        expect(screen.getByText("C").className).toContain("text-cyan-400");

        rerender(<Badge variant="amber">A</Badge>);
        expect(screen.getByText("A").className).toContain("text-amber-400");

        rerender(<Badge variant="indigo">I</Badge>);
        expect(screen.getByText("I").className).toContain("text-indigo-400");
    });

    it("has design-system styling: pill shape, uppercase, tight text", () => {
        render(<Badge>Status</Badge>);
        const el = screen.getByText("Status");
        expect(el.className).toContain("rounded-full");
        expect(el.className).toContain("uppercase");
        expect(el.className).toContain("tracking-wider");
        expect(el.className).toContain("text-[11px]");
        expect(el.className).toContain("font-medium");
    });

    it("shows dot indicator when dot prop is true", () => {
        render(<Badge dot variant="success">Active</Badge>);
        const badge = screen.getByText("Active");
        const dot = badge.querySelector("span");
        expect(dot).toBeTruthy();
        expect(dot!.className).toContain("rounded-full");
        expect(dot!.className).toContain("bg-emerald-400");
    });

    it("does not show dot by default", () => {
        render(<Badge>No Dot</Badge>);
        const badge = screen.getByText("No Dot");
        const innerSpans = badge.querySelectorAll("span");
        expect(innerSpans.length).toBe(0);
    });

    it("merges custom className", () => {
        render(<Badge className="ml-2">Custom</Badge>);
        expect(screen.getByText("Custom").className).toContain("ml-2");
    });
});
