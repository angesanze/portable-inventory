import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DetailPage } from "../DetailPage";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
    useNavigate: () => mockNavigate,
}));

describe("DetailPage", () => {
    beforeEach(() => {
        mockNavigate.mockReset();
    });

    it("renders title as h1", () => {
        render(
            <DetailPage title="Widget A">
                <div>content</div>
            </DetailPage>
        );
        const heading = screen.getByRole("heading", { level: 1 });
        expect(heading.textContent).toBe("Widget A");
    });

    it("renders title with correct styling", () => {
        render(
            <DetailPage title="Test">
                <div>content</div>
            </DetailPage>
        );
        const heading = screen.getByRole("heading", { level: 1 });
        expect(heading.className).toContain("text-2xl");
        expect(heading.className).toContain("font-semibold");
        expect(heading.className).toContain("text-zinc-50");
    });

    it("renders subtitle when provided", () => {
        render(
            <DetailPage title="Test" subtitle="SKU-001">
                <div>content</div>
            </DetailPage>
        );
        expect(screen.getByText("SKU-001")).toBeTruthy();
    });

    it("does not render subtitle when not provided", () => {
        const { container } = render(
            <DetailPage title="Test">
                <div>content</div>
            </DetailPage>
        );
        const subtitles = container.querySelectorAll("p.text-sm.text-zinc-400");
        expect(subtitles.length).toBe(0);
    });

    it("renders badges", () => {
        render(
            <DetailPage
                title="Test"
                badges={[
                    { label: "Active", variant: "success" },
                    { label: "Bulk", variant: "info" },
                ]}
            >
                <div>content</div>
            </DetailPage>
        );
        expect(screen.getByText("Active")).toBeTruthy();
        expect(screen.getByText("Bulk")).toBeTruthy();
    });

    it("renders badges with dot indicator", () => {
        const { container } = render(
            <DetailPage
                title="Test"
                badges={[{ label: "Status", variant: "success", dot: true }]}
            >
                <div>content</div>
            </DetailPage>
        );
        // Badge with dot has a small circle element
        const badge = screen.getByText("Status").closest("span");
        const dotEl = badge?.querySelector("span.rounded-full");
        expect(dotEl).toBeTruthy();
    });

    it("renders actions", () => {
        render(
            <DetailPage
                title="Test"
                actions={<button>Edit</button>}
            >
                <div>content</div>
            </DetailPage>
        );
        expect(screen.getByText("Edit")).toBeTruthy();
    });

    it("renders back button", () => {
        render(
            <DetailPage title="Test">
                <div>content</div>
            </DetailPage>
        );
        expect(screen.getByText("Back")).toBeTruthy();
    });

    it("back button navigates back", () => {
        render(
            <DetailPage title="Test">
                <div>content</div>
            </DetailPage>
        );
        fireEvent.click(screen.getByText("Back"));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it("renders children", () => {
        render(
            <DetailPage title="Test">
                <div>Section A</div>
                <div>Section B</div>
            </DetailPage>
        );
        expect(screen.getByText("Section A")).toBeTruthy();
        expect(screen.getByText("Section B")).toBeTruthy();
    });

    it("children are in a flex column with gap", () => {
        render(
            <DetailPage title="Test">
                <div>Child 1</div>
                <div>Child 2</div>
            </DetailPage>
        );
        const child = screen.getByText("Child 1");
        const wrapper = child.parentElement!;
        expect(wrapper.className).toContain("flex");
        expect(wrapper.className).toContain("flex-col");
        expect(wrapper.className).toContain("gap-6");
    });

    it("shows loading state with skeleton", () => {
        const { container } = render(
            <DetailPage title="Test" isLoading>
                <div>content</div>
            </DetailPage>
        );
        const skeletons = container.querySelectorAll(".animate-pulse");
        expect(skeletons.length).toBeGreaterThan(0);
        expect(screen.queryByText("content")).toBeNull();
    });

    it("does not render badges section when badges array is empty", () => {
        const { container } = render(
            <DetailPage title="Test" badges={[]}>
                <div>content</div>
            </DetailPage>
        );
        // No badge container rendered
        const heading = screen.getByRole("heading", { level: 1 });
        const headerBlock = heading.parentElement!;
        // Should have heading only, no badge wrapper div with mt-2
        const badgeWrapper = headerBlock.querySelector(".mt-2");
        expect(badgeWrapper).toBeNull();
    });

    it("does not render actions wrapper when no actions", () => {
        const { container } = render(
            <DetailPage title="Test">
                <div>content</div>
            </DetailPage>
        );
        const actionsWrapper = container.querySelector(".shrink-0");
        expect(actionsWrapper).toBeNull();
    });
});
