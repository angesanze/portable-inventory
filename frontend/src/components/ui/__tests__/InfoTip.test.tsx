import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { InfoTip } from "../InfoTip";

describe("InfoTip", () => {
    it("renders trigger button with CircleHelp icon", () => {
        render(<InfoTip content="Help text" />);
        expect(screen.getByRole("button", { name: "More info" })).toBeTruthy();
    });

    it("does not show popover initially", () => {
        render(<InfoTip content="Help text" />);
        expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("shows popover on click", () => {
        render(<InfoTip content="Help text" />);
        fireEvent.click(screen.getByRole("button", { name: "More info" }));
        expect(screen.getByRole("tooltip")).toBeTruthy();
        expect(screen.getByText("Help text")).toBeTruthy();
    });

    it("closes popover on second click", () => {
        render(<InfoTip content="Help text" />);
        const btn = screen.getByRole("button", { name: "More info" });
        fireEvent.click(btn);
        expect(screen.getByRole("tooltip")).toBeTruthy();
        fireEvent.click(btn);
        expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("closes popover on click outside", () => {
        render(
            <div>
                <InfoTip content="Help text" />
                <span data-testid="outside">outside</span>
            </div>,
        );
        fireEvent.click(screen.getByRole("button", { name: "More info" }));
        expect(screen.getByRole("tooltip")).toBeTruthy();
        fireEvent.mouseDown(screen.getByTestId("outside"));
        expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("closes popover on Escape key", () => {
        render(<InfoTip content="Help text" />);
        fireEvent.click(screen.getByRole("button", { name: "More info" }));
        expect(screen.getByRole("tooltip")).toBeTruthy();
        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("renders title when provided", () => {
        render(<InfoTip content="Body text" title="My Title" />);
        fireEvent.click(screen.getByRole("button", { name: "More info" }));
        expect(screen.getByText("My Title")).toBeTruthy();
        expect(screen.getByText("Body text")).toBeTruthy();
    });

    it("renders ReactNode content", () => {
        render(
            <InfoTip
                content={
                    <span data-testid="custom-content">Rich content</span>
                }
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "More info" }));
        expect(screen.getByTestId("custom-content")).toBeTruthy();
    });

    it("sets aria-expanded correctly", () => {
        render(<InfoTip content="Help text" />);
        const btn = screen.getByRole("button", { name: "More info" });
        expect(btn.getAttribute("aria-expanded")).toBe("false");
        fireEvent.click(btn);
        expect(btn.getAttribute("aria-expanded")).toBe("true");
    });
});
