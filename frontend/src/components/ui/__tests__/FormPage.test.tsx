import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FormPage } from "../FormPage";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
    useNavigate: () => mockNavigate,
}));

describe("FormPage", () => {
    beforeEach(() => {
        mockNavigate.mockReset();
    });

    it("renders title", () => {
        render(
            <FormPage title="Create Product" onSubmit={vi.fn()}>
                <div>content</div>
            </FormPage>
        );
        expect(screen.getByText("Create Product")).toBeTruthy();
    });

    it("renders title as h1 with correct styling", () => {
        render(
            <FormPage title="Edit Location" onSubmit={vi.fn()}>
                <div>content</div>
            </FormPage>
        );
        const heading = screen.getByRole("heading", { level: 1 });
        expect(heading.className).toContain("text-2xl");
        expect(heading.className).toContain("font-semibold");
        expect(heading.className).toContain("text-zinc-50");
    });

    it("renders back button with arrow", () => {
        render(
            <FormPage title="Test" onSubmit={vi.fn()}>
                <div>content</div>
            </FormPage>
        );
        expect(screen.getByText("Back")).toBeTruthy();
    });

    it("back button navigates back when no onCancel", () => {
        render(
            <FormPage title="Test" onSubmit={vi.fn()}>
                <div>content</div>
            </FormPage>
        );
        fireEvent.click(screen.getByText("Back"));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it("back button calls onCancel when provided", () => {
        const onCancel = vi.fn();
        render(
            <FormPage title="Test" onSubmit={vi.fn()} onCancel={onCancel}>
                <div>content</div>
            </FormPage>
        );
        fireEvent.click(screen.getByText("Back"));
        expect(onCancel).toHaveBeenCalled();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("renders children", () => {
        render(
            <FormPage title="Test" onSubmit={vi.fn()}>
                <div>Section A</div>
                <div>Section B</div>
            </FormPage>
        );
        expect(screen.getByText("Section A")).toBeTruthy();
        expect(screen.getByText("Section B")).toBeTruthy();
    });

    it("renders Cancel and Save buttons in footer", () => {
        render(
            <FormPage title="Test" onSubmit={vi.fn()}>
                <div>content</div>
            </FormPage>
        );
        expect(screen.getByText("Cancel")).toBeTruthy();
        expect(screen.getByText("Save")).toBeTruthy();
    });

    it("Cancel button calls onCancel", () => {
        const onCancel = vi.fn();
        render(
            <FormPage title="Test" onSubmit={vi.fn()} onCancel={onCancel}>
                <div>content</div>
            </FormPage>
        );
        fireEvent.click(screen.getByText("Cancel"));
        expect(onCancel).toHaveBeenCalled();
    });

    it("Cancel button navigates back when no onCancel", () => {
        render(
            <FormPage title="Test" onSubmit={vi.fn()}>
                <div>content</div>
            </FormPage>
        );
        fireEvent.click(screen.getByText("Cancel"));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it("calls onSubmit when form submitted", () => {
        const onSubmit = vi.fn();
        render(
            <FormPage title="Test" onSubmit={onSubmit}>
                <div>content</div>
            </FormPage>
        );
        fireEvent.click(screen.getByText("Save"));
        expect(onSubmit).toHaveBeenCalled();
    });

    it("prevents default form submission", () => {
        const onSubmit = vi.fn();
        render(
            <FormPage title="Test" onSubmit={onSubmit}>
                <div>content</div>
            </FormPage>
        );
        const form = screen.getByText("Save").closest("form")!;
        const event = new Event("submit", { bubbles: true, cancelable: true });
        const prevented = !form.dispatchEvent(event);
        expect(prevented).toBe(true);
    });

    it("shows loading state on Save button", () => {
        render(
            <FormPage title="Test" onSubmit={vi.fn()} isLoading>
                <div>content</div>
            </FormPage>
        );
        const saveButton = screen.getByText("Save").closest("button")!;
        expect(saveButton.disabled).toBe(true);
    });

    it("has max-w-2xl centered layout", () => {
        render(
            <FormPage title="Test" onSubmit={vi.fn()}>
                <div>content</div>
            </FormPage>
        );
        const form = screen.getByText("Test").closest("form")!;
        expect(form.className).toContain("max-w-2xl");
        expect(form.className).toContain("mx-auto");
    });

    it("has padding bottom for sticky footer clearance", () => {
        render(
            <FormPage title="Test" onSubmit={vi.fn()}>
                <div>content</div>
            </FormPage>
        );
        const form = screen.getByText("Test").closest("form")!;
        expect(form.className).toContain("pb-24");
    });

    it("children are in a flex column with gap", () => {
        render(
            <FormPage title="Test" onSubmit={vi.fn()}>
                <div>Child 1</div>
                <div>Child 2</div>
            </FormPage>
        );
        const child = screen.getByText("Child 1");
        const wrapper = child.parentElement!;
        expect(wrapper.className).toContain("flex");
        expect(wrapper.className).toContain("flex-col");
        expect(wrapper.className).toContain("gap-6");
    });

    it("sticky footer has border and backdrop blur", () => {
        const { container } = render(
            <FormPage title="Test" onSubmit={vi.fn()}>
                <div>content</div>
            </FormPage>
        );
        const footer = container.querySelector(".fixed.bottom-0")!;
        expect(footer).toBeTruthy();
        expect(footer.className).toContain("border-t");
        expect(footer.className).toContain("backdrop-blur");
    });
});
