import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Tooltip } from "../Tooltip";

describe("Tooltip", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("renders children", () => {
        render(
            <Tooltip content="Help text">
                <button>Hover me</button>
            </Tooltip>
        );
        expect(screen.getByRole("button", { name: "Hover me" })).toBeTruthy();
    });

    it("does not show tooltip by default", () => {
        render(
            <Tooltip content="Help text">
                <button>Hover me</button>
            </Tooltip>
        );
        expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("shows tooltip on hover after delay", () => {
        render(
            <Tooltip content="Help text" delayMs={200}>
                <button>Hover me</button>
            </Tooltip>
        );
        fireEvent.mouseEnter(screen.getByRole("button").parentElement!);
        expect(screen.queryByRole("tooltip")).toBeNull();

        act(() => {
            vi.advanceTimersByTime(200);
        });

        expect(screen.getByRole("tooltip")).toBeTruthy();
        expect(screen.getByText("Help text")).toBeTruthy();
    });

    it("hides tooltip on mouse leave", () => {
        render(
            <Tooltip content="Help text" delayMs={0}>
                <button>Hover me</button>
            </Tooltip>
        );
        const wrapper = screen.getByRole("button").parentElement!;
        fireEvent.mouseEnter(wrapper);
        act(() => {
            vi.advanceTimersByTime(0);
        });
        expect(screen.getByRole("tooltip")).toBeTruthy();

        fireEvent.mouseLeave(wrapper);
        expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("shows tooltip on focus", () => {
        render(
            <Tooltip content="Help text" delayMs={0}>
                <button>Focus me</button>
            </Tooltip>
        );
        const wrapper = screen.getByRole("button").parentElement!;
        fireEvent.focus(wrapper);
        act(() => {
            vi.advanceTimersByTime(0);
        });
        expect(screen.getByRole("tooltip")).toBeTruthy();
    });

    it("hides tooltip on blur", () => {
        render(
            <Tooltip content="Help text" delayMs={0}>
                <button>Blur me</button>
            </Tooltip>
        );
        const wrapper = screen.getByRole("button").parentElement!;
        fireEvent.focus(wrapper);
        act(() => {
            vi.advanceTimersByTime(0);
        });
        expect(screen.getByRole("tooltip")).toBeTruthy();

        fireEvent.blur(wrapper);
        expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("applies side positioning class for top (default)", () => {
        render(
            <Tooltip content="Top" delayMs={0}>
                <button>Btn</button>
            </Tooltip>
        );
        fireEvent.mouseEnter(screen.getByRole("button").parentElement!);
        act(() => {
            vi.advanceTimersByTime(0);
        });
        const tooltip = screen.getByRole("tooltip");
        expect(tooltip.className).toContain("bottom-full");
    });

    it("applies side positioning class for bottom", () => {
        render(
            <Tooltip content="Bottom" side="bottom" delayMs={0}>
                <button>Btn</button>
            </Tooltip>
        );
        fireEvent.mouseEnter(screen.getByRole("button").parentElement!);
        act(() => {
            vi.advanceTimersByTime(0);
        });
        const tooltip = screen.getByRole("tooltip");
        expect(tooltip.className).toContain("top-full");
    });

    it("applies side positioning class for left", () => {
        render(
            <Tooltip content="Left" side="left" delayMs={0}>
                <button>Btn</button>
            </Tooltip>
        );
        fireEvent.mouseEnter(screen.getByRole("button").parentElement!);
        act(() => {
            vi.advanceTimersByTime(0);
        });
        expect(screen.getByRole("tooltip").className).toContain("right-full");
    });

    it("applies side positioning class for right", () => {
        render(
            <Tooltip content="Right" side="right" delayMs={0}>
                <button>Btn</button>
            </Tooltip>
        );
        fireEvent.mouseEnter(screen.getByRole("button").parentElement!);
        act(() => {
            vi.advanceTimersByTime(0);
        });
        expect(screen.getByRole("tooltip").className).toContain("left-full");
    });

    it("cancels pending tooltip on quick mouse leave", () => {
        render(
            <Tooltip content="Cancelled" delayMs={300}>
                <button>Quick</button>
            </Tooltip>
        );
        const wrapper = screen.getByRole("button").parentElement!;
        fireEvent.mouseEnter(wrapper);
        act(() => {
            vi.advanceTimersByTime(100);
        });
        fireEvent.mouseLeave(wrapper);
        act(() => {
            vi.advanceTimersByTime(300);
        });
        expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("renders ReactNode content", () => {
        render(
            <Tooltip content={<strong>Bold text</strong>} delayMs={0}>
                <button>Hover</button>
            </Tooltip>
        );
        fireEvent.mouseEnter(screen.getByRole("button").parentElement!);
        act(() => {
            vi.advanceTimersByTime(0);
        });
        expect(screen.getByText("Bold text")).toBeTruthy();
    });

    it("has correct base styles", () => {
        render(
            <Tooltip content="Styled" delayMs={0}>
                <button>Btn</button>
            </Tooltip>
        );
        fireEvent.mouseEnter(screen.getByRole("button").parentElement!);
        act(() => {
            vi.advanceTimersByTime(0);
        });
        const tooltip = screen.getByRole("tooltip");
        expect(tooltip.className).toContain("bg-zinc-800");
        expect(tooltip.className).toContain("rounded-md");
        expect(tooltip.className).toContain("text-xs");
        expect(tooltip.className).toContain("shadow-lg");
    });

    it("merges custom className", () => {
        render(
            <Tooltip content="Custom" delayMs={0} className="w-64">
                <button>Btn</button>
            </Tooltip>
        );
        fireEvent.mouseEnter(screen.getByRole("button").parentElement!);
        act(() => {
            vi.advanceTimersByTime(0);
        });
        expect(screen.getByRole("tooltip").className).toContain("w-64");
    });
});
