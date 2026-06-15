import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { useSwipeGesture } from "../useSwipeGesture";

function SwipeTestHarness({
    onSwipeLeft,
    onSwipeRight,
    enabled = true,
    threshold = 80,
}: {
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
    enabled?: boolean;
    threshold?: number;
}) {
    const ref = useSwipeGesture<HTMLDivElement>(
        { onSwipeLeft, onSwipeRight },
        { enabled, threshold }
    );
    return (
        <div ref={ref} data-testid="swipe-area" style={{ width: 300, height: 300 }}>
            Swipe here
        </div>
    );
}

function simulateSwipe(el: HTMLElement, startX: number, endX: number, startY = 100, endY = 100) {
    fireEvent.touchStart(el, {
        touches: [{ clientX: startX, clientY: startY }],
    });
    fireEvent.touchEnd(el, {
        changedTouches: [{ clientX: endX, clientY: endY }],
    });
}

describe("useSwipeGesture", () => {
    it("fires onSwipeRight when swiped right past threshold", () => {
        const onSwipeRight = vi.fn();
        render(<SwipeTestHarness onSwipeRight={onSwipeRight} threshold={80} />);
        const el = screen.getByTestId("swipe-area");

        simulateSwipe(el, 50, 200); // dx = 150 > 80
        expect(onSwipeRight).toHaveBeenCalledOnce();
    });

    it("fires onSwipeLeft when swiped left past threshold", () => {
        const onSwipeLeft = vi.fn();
        render(<SwipeTestHarness onSwipeLeft={onSwipeLeft} threshold={80} />);
        const el = screen.getByTestId("swipe-area");

        simulateSwipe(el, 200, 50); // dx = -150 < -80
        expect(onSwipeLeft).toHaveBeenCalledOnce();
    });

    it("does NOT fire when swipe distance below threshold", () => {
        const onSwipeRight = vi.fn();
        const onSwipeLeft = vi.fn();
        render(<SwipeTestHarness onSwipeRight={onSwipeRight} onSwipeLeft={onSwipeLeft} threshold={80} />);
        const el = screen.getByTestId("swipe-area");

        simulateSwipe(el, 100, 140); // dx = 40 < 80
        expect(onSwipeRight).not.toHaveBeenCalled();
        expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it("does NOT fire when vertical movement too large", () => {
        const onSwipeRight = vi.fn();
        render(<SwipeTestHarness onSwipeRight={onSwipeRight} threshold={80} />);
        const el = screen.getByTestId("swipe-area");

        simulateSwipe(el, 50, 200, 50, 200); // dy = 150 > maxVertical(100)
        expect(onSwipeRight).not.toHaveBeenCalled();
    });

    it("does NOT fire when disabled", () => {
        const onSwipeRight = vi.fn();
        render(<SwipeTestHarness onSwipeRight={onSwipeRight} enabled={false} />);
        const el = screen.getByTestId("swipe-area");

        simulateSwipe(el, 50, 200);
        expect(onSwipeRight).not.toHaveBeenCalled();
    });
});
