import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
    Skeleton,
    SkeletonRow,
    SkeletonCard,
    SkeletonDetailPage,
    SkeletonList,
} from "../Skeleton";

describe("Skeleton", () => {
    it("renders with base styles", () => {
        render(<Skeleton />);
        const el = screen.getByRole("status");
        expect(el.className).toContain("animate-pulse");
        expect(el.className).toContain("rounded");
        expect(el.className).toContain("bg-zinc-800");
    });

    it("merges custom className", () => {
        render(<Skeleton className="h-7 w-16" />);
        const el = screen.getByRole("status");
        expect(el.className).toContain("h-7");
        expect(el.className).toContain("w-16");
    });

    it("applies inline width and height", () => {
        render(<Skeleton width="100px" height="20px" />);
        const el = screen.getByRole("status");
        expect(el.style.width).toBe("100px");
        expect(el.style.height).toBe("20px");
    });

    it("has accessible aria-label", () => {
        render(<Skeleton />);
        expect(screen.getByLabelText("Loading")).toBeTruthy();
    });
});

describe("SkeletonRow", () => {
    it("renders correct number of rows and columns", () => {
        const { container } = render(
            <table>
                <tbody>
                    <SkeletonRow columns={3} rows={2} />
                </tbody>
            </table>,
        );
        const rows = container.querySelectorAll("tr");
        expect(rows.length).toBe(2);
        const cells = rows[0].querySelectorAll("td");
        expect(cells.length).toBe(3);
    });

    it("defaults to 5 rows", () => {
        const { container } = render(
            <table>
                <tbody>
                    <SkeletonRow columns={2} />
                </tbody>
            </table>,
        );
        expect(container.querySelectorAll("tr").length).toBe(5);
    });

    it("each cell contains an animated skeleton bar", () => {
        const { container } = render(
            <table>
                <tbody>
                    <SkeletonRow columns={1} rows={1} />
                </tbody>
            </table>,
        );
        const skeleton = container.querySelector(".animate-pulse");
        expect(skeleton).toBeTruthy();
        expect(skeleton!.className).toContain("bg-zinc-800");
    });
});

describe("SkeletonCard", () => {
    it("renders card-like container with skeleton lines", () => {
        const { container } = render(<SkeletonCard lines={3} />);
        const el = container.firstElementChild as HTMLElement;
        expect(el.className).toContain("bg-zinc-900/80");
        expect(el.className).toContain("border");
        expect(el.className).toContain("rounded-xl");
        const bars = el.querySelectorAll(".animate-pulse");
        expect(bars.length).toBe(3);
    });

    it("defaults to 3 lines", () => {
        const { container } = render(<SkeletonCard />);
        expect(container.querySelectorAll(".animate-pulse").length).toBe(3);
    });

    it("merges custom className", () => {
        const { container } = render(<SkeletonCard className="mt-4" />);
        expect((container.firstElementChild as HTMLElement).className).toContain("mt-4");
    });
});

describe("SkeletonDetailPage", () => {
    it("renders multiple skeleton elements", () => {
        const { container } = render(<SkeletonDetailPage />);
        const bars = container.querySelectorAll(".animate-pulse");
        expect(bars.length).toBeGreaterThan(5);
    });
});

describe("SkeletonList", () => {
    it("renders specified number of skeleton items", () => {
        const { container } = render(<SkeletonList items={3} />);
        const bars = container.querySelectorAll(".animate-pulse");
        expect(bars.length).toBe(3 * 4); // 4 skeleton divs per item
    });

    it("defaults to 4 items", () => {
        const { container } = render(<SkeletonList />);
        const bars = container.querySelectorAll(".animate-pulse");
        expect(bars.length).toBe(4 * 4);
    });
});
