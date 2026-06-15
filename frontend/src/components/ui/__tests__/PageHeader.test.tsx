import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PageHeader } from "../PageHeader";

describe("PageHeader", () => {
    it("renders title", () => {
        render(<PageHeader title="Products" />);
        expect(screen.getByText("Products")).toBeTruthy();
    });

    it("applies correct title styling", () => {
        render(<PageHeader title="Products" />);
        const heading = screen.getByRole("heading", { level: 1 });
        expect(heading.className).toContain("text-2xl");
        expect(heading.className).toContain("font-semibold");
        expect(heading.className).toContain("text-zinc-50");
    });

    it("renders subtitle when provided", () => {
        render(<PageHeader title="Products" subtitle="Manage your inventory" />);
        const subtitle = screen.getByText("Manage your inventory");
        expect(subtitle).toBeTruthy();
        expect(subtitle.className).toContain("text-sm");
        expect(subtitle.className).toContain("text-zinc-400");
    });

    it("does not render subtitle when not provided", () => {
        const { container } = render(<PageHeader title="Products" />);
        expect(container.querySelector("p")).toBeNull();
    });

    it("renders count as badge when provided", () => {
        render(<PageHeader title="Products" count={42} />);
        expect(screen.getByText("42")).toBeTruthy();
    });

    it("formats large count with locale string", () => {
        render(<PageHeader title="Products" count={1234} />);
        expect(screen.getByText("1,234")).toBeTruthy();
    });

    it("does not render badge when count not provided", () => {
        const { container } = render(<PageHeader title="Products" />);
        // Badge has uppercase tracking-wider classes
        const badges = container.querySelectorAll("[class*='uppercase']");
        expect(badges.length).toBe(0);
    });

    it("renders actions when provided", () => {
        render(
            <PageHeader
                title="Products"
                actions={<button>New Product</button>}
            />
        );
        expect(screen.getByText("New Product")).toBeTruthy();
    });

    it("does not render actions container when not provided", () => {
        const { container } = render(<PageHeader title="Products" />);
        // Only the left side div should exist as direct child
        const wrapper = container.firstElementChild!;
        expect(wrapper.children.length).toBe(1);
    });

    it("has flex layout with justify-between", () => {
        const { container } = render(<PageHeader title="Products" />);
        const wrapper = container.firstElementChild!;
        expect(wrapper.className).toContain("flex");
        expect(wrapper.className).toContain("justify-between");
        expect(wrapper.className).toContain("items-center");
        expect(wrapper.className).toContain("mb-6");
    });

    it("merges custom className", () => {
        const { container } = render(<PageHeader title="Products" className="mt-4" />);
        expect(container.firstElementChild!.className).toContain("mt-4");
    });

    it("renders count zero correctly", () => {
        render(<PageHeader title="Products" count={0} />);
        expect(screen.getByText("0")).toBeTruthy();
    });
});
