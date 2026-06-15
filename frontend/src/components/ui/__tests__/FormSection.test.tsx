import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FormSection } from "../FormSection";

describe("FormSection", () => {
    it("renders title and children", () => {
        render(
            <FormSection title="Basic Info">
                <input placeholder="Name" />
            </FormSection>
        );
        expect(screen.getByText("Basic Info")).toBeTruthy();
        expect(screen.getByPlaceholderText("Name")).toBeTruthy();
    });

    it("applies correct title styling", () => {
        render(<FormSection title="Title">Content</FormSection>);
        const title = screen.getByText("Title");
        expect(title.tagName).toBe("H3");
        expect(title.className).toContain("text-lg");
        expect(title.className).toContain("font-semibold");
        expect(title.className).toContain("text-zinc-200");
        expect(title.className).toContain("mb-1");
    });

    it("renders description when provided", () => {
        render(
            <FormSection title="Section" description="Helper text">
                Content
            </FormSection>
        );
        const desc = screen.getByText("Helper text");
        expect(desc.className).toContain("text-sm");
        expect(desc.className).toContain("text-zinc-500");
        expect(desc.className).toContain("mb-4");
    });

    it("does not render description element when omitted", () => {
        const { container } = render(
            <FormSection title="No Desc">Content</FormSection>
        );
        const paragraphs = container.querySelectorAll("p");
        expect(paragraphs.length).toBe(0);
    });

    it("wraps content in a Card", () => {
        const { container } = render(
            <FormSection title="Wrapped">Content</FormSection>
        );
        const card = container.firstElementChild as HTMLElement;
        expect(card.className).toContain("bg-zinc-900/80");
        expect(card.className).toContain("rounded-xl");
    });

    it("renders children in a flex column with gap", () => {
        render(
            <FormSection title="Fields">
                <span>Field 1</span>
                <span>Field 2</span>
            </FormSection>
        );
        const field1 = screen.getByText("Field 1");
        const wrapper = field1.parentElement!;
        expect(wrapper.className).toContain("flex");
        expect(wrapper.className).toContain("flex-col");
        expect(wrapper.className).toContain("gap-4");
    });

    it("renders titleExtra next to title", () => {
        render(
            <FormSection title="Profile" titleExtra={<span data-testid="tip">?</span>}>
                Content
            </FormSection>
        );
        const heading = screen.getByText("Profile").closest("h3");
        expect(heading?.querySelector("[data-testid='tip']")).toBeTruthy();
    });
});
