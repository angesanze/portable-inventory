import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ErrorState, FormErrorBanner } from "../ErrorState";

describe("ErrorState", () => {
    it("renders default title and message", () => {
        render(<ErrorState />);
        expect(screen.getByText("Something went wrong")).toBeDefined();
        expect(screen.getByText("An unexpected error occurred. Please try again.")).toBeDefined();
    });

    it("renders custom title and message", () => {
        render(<ErrorState title="Load failed" message="Could not fetch data." />);
        expect(screen.getByText("Load failed")).toBeDefined();
        expect(screen.getByText("Could not fetch data.")).toBeDefined();
    });

    it("renders retry button when onRetry provided", () => {
        const onRetry = vi.fn();
        render(<ErrorState onRetry={onRetry} />);
        const btn = screen.getByText("Try Again");
        expect(btn).toBeDefined();
        fireEvent.click(btn);
        expect(onRetry).toHaveBeenCalledOnce();
    });

    it("does not render retry button without onRetry", () => {
        render(<ErrorState />);
        expect(screen.queryByText("Try Again")).toBeNull();
    });

    it("applies custom className", () => {
        const { container } = render(<ErrorState className="my-class" />);
        expect(container.firstElementChild?.className).toContain("my-class");
    });
});

describe("FormErrorBanner", () => {
    it("renders with default title and fallback message", () => {
        render(<FormErrorBanner />);
        expect(screen.getByText("Error")).toBeDefined();
        expect(screen.getByText("An unexpected error occurred.")).toBeDefined();
    });

    it("renders custom title", () => {
        render(<FormErrorBanner title="Save Failed" />);
        expect(screen.getByText("Save Failed")).toBeDefined();
    });

    it("extracts detail from axios error response", () => {
        const error = { response: { data: { detail: "SKU already exists." } } };
        render(<FormErrorBanner error={error} />);
        expect(screen.getByText("SKU already exists.")).toBeDefined();
    });

    it("extracts array error from response", () => {
        const error = { response: { data: ["Insufficient stock."] } };
        render(<FormErrorBanner error={error} />);
        expect(screen.getByText("Insufficient stock.")).toBeDefined();
    });

    it("extracts engine_config error from response", () => {
        const error = { response: { data: { engine_config: ["Invalid config format."] } } };
        render(<FormErrorBanner error={error} />);
        expect(screen.getByText("Invalid config format.")).toBeDefined();
    });

    it("shows field-level errors", () => {
        const error = { response: { data: { sku: ["This field is required."] } } };
        render(<FormErrorBanner error={error} />);
        expect(screen.getByText("sku")).toBeDefined();
        expect(screen.getByText(/This field is required/)).toBeDefined();
    });

    it("falls back to error.message when no response data", () => {
        const error = { message: "Network Error" };
        render(<FormErrorBanner error={error} />);
        expect(screen.getByText("Network Error")).toBeDefined();
    });

    it("uses fallbackMessage when no error info available", () => {
        render(<FormErrorBanner error={{}} fallbackMessage="Custom fallback." />);
        expect(screen.getByText("Custom fallback.")).toBeDefined();
    });

    it("has role=alert for accessibility", () => {
        render(<FormErrorBanner />);
        expect(screen.getByRole("alert")).toBeDefined();
    });

    it("applies custom className", () => {
        const { container } = render(<FormErrorBanner className="extra" />);
        expect(container.firstElementChild?.className).toContain("extra");
    });
});
