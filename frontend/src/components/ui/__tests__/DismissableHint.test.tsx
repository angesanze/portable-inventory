import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Info } from "lucide-react";
import { DismissableHint } from "../DismissableHint";

describe("DismissableHint", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("renders children and default icon", () => {
        render(<DismissableHint id="test-hint">Hint text</DismissableHint>);
        expect(screen.getByText("Hint text")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Dismiss hint" })).toBeTruthy();
    });

    it("renders custom icon", () => {
        const { container } = render(
            <DismissableHint id="test-hint" icon={Info}>
                Hint text
            </DismissableHint>,
        );
        // Component renders — icon prop accepted without error
        expect(container.querySelector("svg")).toBeTruthy();
    });

    it("dismisses on close button click", () => {
        render(<DismissableHint id="test-hint">Hint text</DismissableHint>);
        expect(screen.getByText("Hint text")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Dismiss hint" }));
        expect(screen.queryByText("Hint text")).toBeNull();
    });

    it("stores dismissed state in localStorage", () => {
        render(<DismissableHint id="my-hint">Hint text</DismissableHint>);
        fireEvent.click(screen.getByRole("button", { name: "Dismiss hint" }));
        expect(localStorage.getItem("hint_dismissed_my-hint")).toBe("true");
    });

    it("does not render if already dismissed in localStorage", () => {
        localStorage.setItem("hint_dismissed_test-hint", "true");
        render(<DismissableHint id="test-hint">Hint text</DismissableHint>);
        expect(screen.queryByText("Hint text")).toBeNull();
    });

    it("renders if localStorage throws", () => {
        const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("quota exceeded");
        });
        render(<DismissableHint id="test-hint">Hint text</DismissableHint>);
        expect(screen.getByText("Hint text")).toBeTruthy();
        spy.mockRestore();
    });

    it("applies custom className", () => {
        const { container } = render(
            <DismissableHint id="test-hint" className="mb-4">
                Hint text
            </DismissableHint>,
        );
        expect(container.firstElementChild?.classList.contains("mb-4")).toBe(true);
    });

    it("still dismisses visually if localStorage setItem throws", () => {
        const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("quota exceeded");
        });
        render(<DismissableHint id="test-hint">Hint text</DismissableHint>);
        fireEvent.click(screen.getByRole("button", { name: "Dismiss hint" }));
        expect(screen.queryByText("Hint text")).toBeNull();
        spy.mockRestore();
    });
});
