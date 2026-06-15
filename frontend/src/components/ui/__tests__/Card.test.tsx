import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Card, CardHeader, CardContent, CardFooter } from "../Card";

describe("Card", () => {
    it("renders children", () => {
        render(<Card>Hello</Card>);
        expect(screen.getByText("Hello")).toBeTruthy();
    });

    it("applies design-system base styles", () => {
        render(<Card>Base</Card>);
        const el = screen.getByText("Base").closest("div")!.parentElement!;
        expect(el.className).toContain("bg-zinc-900/80");
        expect(el.className).toContain("border");
        expect(el.className).toContain("border-white/[0.06]");
        expect(el.className).toContain("rounded-xl");
    });

    it("applies default md padding", () => {
        render(<Card>Padded</Card>);
        const content = screen.getByText("Padded").closest("div");
        expect(content!.className).toContain("p-5");
    });

    it("applies sm padding", () => {
        render(<Card padding="sm">Small</Card>);
        const content = screen.getByText("Small").closest("div");
        expect(content!.className).toContain("p-3");
    });

    it("applies lg padding", () => {
        render(<Card padding="lg">Large</Card>);
        const content = screen.getByText("Large").closest("div");
        expect(content!.className).toContain("p-7");
    });

    it("applies no padding when padding='none'", () => {
        render(<Card padding="none">None</Card>);
        const content = screen.getByText("None").closest("div");
        expect(content!.className).not.toContain("p-");
    });

    it("adds hover classes when hover prop is true", () => {
        render(<Card hover>Hoverable</Card>);
        const el = screen.getByText("Hoverable").closest("div")!.parentElement!;
        expect(el.className).toContain("hover:border-white/[0.1]");
        expect(el.className).toContain("hover:bg-zinc-900");
        expect(el.className).toContain("transition-colors");
    });

    it("does not add hover classes by default", () => {
        render(<Card>NoHover</Card>);
        const el = screen.getByText("NoHover").closest("div")!.parentElement!;
        expect(el.className).not.toContain("hover:border-white/[0.1]");
    });

    it("renders header prop with bottom border", () => {
        render(<Card header={<span>Title</span>}>Body</Card>);
        expect(screen.getByText("Title")).toBeTruthy();
        const headerDiv = screen.getByText("Title").closest("div");
        expect(headerDiv!.className).toContain("border-b");
        expect(headerDiv!.className).toContain("border-white/[0.06]");
    });

    it("merges custom className", () => {
        render(<Card className="mt-4">Custom</Card>);
        const el = screen.getByText("Custom").closest("div")!.parentElement!;
        expect(el.className).toContain("mt-4");
    });
});

describe("CardHeader", () => {
    it("renders with border-b styling", () => {
        render(<CardHeader>Header</CardHeader>);
        const el = screen.getByText("Header").closest("div");
        expect(el!.className).toContain("px-5");
        expect(el!.className).toContain("py-4");
        expect(el!.className).toContain("border-b");
        expect(el!.className).toContain("border-white/[0.06]");
    });
});

describe("CardContent", () => {
    it("renders with padding", () => {
        render(<CardContent>Content</CardContent>);
        const el = screen.getByText("Content").closest("div");
        expect(el!.className).toContain("p-5");
    });
});

describe("CardFooter", () => {
    it("renders with border-t styling", () => {
        render(<CardFooter>Footer</CardFooter>);
        const el = screen.getByText("Footer").closest("div");
        expect(el!.className).toContain("px-5");
        expect(el!.className).toContain("py-4");
        expect(el!.className).toContain("border-t");
        expect(el!.className).toContain("border-white/[0.06]");
    });
});

describe("Card composition", () => {
    it("composes CardHeader + CardContent + CardFooter", () => {
        render(
            <Card padding="none">
                <CardHeader>H</CardHeader>
                <CardContent>C</CardContent>
                <CardFooter>F</CardFooter>
            </Card>
        );
        expect(screen.getByText("H")).toBeTruthy();
        expect(screen.getByText("C")).toBeTruthy();
        expect(screen.getByText("F")).toBeTruthy();
    });
});
