import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ToastProvider, useToast } from "../Toast";
import type { ToastOptions } from "../Toast";

function Trigger({ opts }: { opts: ToastOptions }) {
    const { toast } = useToast();
    return <button data-testid="trigger" onClick={() => toast(opts)} />;
}

function renderWithProvider(opts: ToastOptions) {
    return render(
        <ToastProvider>
            <Trigger opts={opts} />
        </ToastProvider>
    );
}

describe("Toast", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        act(() => {
            vi.runOnlyPendingTimers();
        });
        vi.useRealTimers();
    });

    it("shows a toast with the message", () => {
        renderWithProvider({ message: "Saved!" });
        act(() => {
            fireEvent.click(screen.getByTestId("trigger"));
        });
        expect(screen.getByTestId("toast")).toBeTruthy();
        expect(screen.getByText("Saved!")).toBeTruthy();
    });

    it("auto-dismisses after the default duration", () => {
        renderWithProvider({ message: "Bye" });
        act(() => {
            fireEvent.click(screen.getByTestId("trigger"));
        });
        expect(screen.queryByTestId("toast")).not.toBeNull();
        act(() => {
            vi.advanceTimersByTime(4000);
        });
        expect(screen.queryByTestId("toast")).toBeNull();
    });

    it("respects a custom duration", () => {
        renderWithProvider({ message: "Quick", duration: 1000 });
        act(() => {
            fireEvent.click(screen.getByTestId("trigger"));
        });
        act(() => {
            vi.advanceTimersByTime(999);
        });
        expect(screen.queryByTestId("toast")).not.toBeNull();
        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(screen.queryByTestId("toast")).toBeNull();
    });

    it("dismisses on click", () => {
        renderWithProvider({ message: "Click me" });
        act(() => {
            fireEvent.click(screen.getByTestId("trigger"));
        });
        expect(screen.queryByTestId("toast")).not.toBeNull();
        act(() => {
            fireEvent.click(screen.getByTestId("toast"));
        });
        expect(screen.queryByTestId("toast")).toBeNull();
    });

    it("stacks multiple toasts", () => {
        renderWithProvider({ message: "Stacked" });
        act(() => {
            fireEvent.click(screen.getByTestId("trigger"));
            fireEvent.click(screen.getByTestId("trigger"));
        });
        expect(screen.getAllByTestId("toast")).toHaveLength(2);
    });

    it("throws when useToast used outside a provider", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        expect(() => render(<Trigger opts={{ message: "x" }} />)).toThrow(
            /useToast must be used within a ToastProvider/
        );
        spy.mockRestore();
    });
});
