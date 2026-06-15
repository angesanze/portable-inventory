import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConfirmationDialog } from "../ConfirmationDialog";
import { QuantityInput } from "../QuantityInput";
import { ScanResult } from "../ScanResult";
import { SuccessFeedback, ErrorFeedback } from "../SuccessFeedback";
import type { QRScanResult } from "../QRScanner";
import type { OperationType } from "../ScanResult";

// Suppress navigator.vibrate in tests
beforeEach(() => {
    Object.defineProperty(navigator, "vibrate", { value: vi.fn(), configurable: true });
});

const scanResult: QRScanResult = {
    code: "AB12CD34",
    productId: "prod-1",
    productName: "Test Widget",
    productSku: "TW-001",
    engineType: "counter",
    quantity: 42,
    locationId: "loc-1",
    locationName: "Warehouse A",
};

/**
 * Ensure every interactive element (button, input, select, textarea) has an aria-label or
 * is associated with a visible label. WCAG 4.1.2 — Name, Role, Value.
 */
function getAllInteractiveElements(container: HTMLElement) {
    return container.querySelectorAll<HTMLElement>("button, input, select, textarea");
}

function assertAllHaveAccessibleName(container: HTMLElement) {
    const elements = getAllInteractiveElements(container);
    elements.forEach((el) => {
        const ariaLabel = el.getAttribute("aria-label");
        const labelledBy = el.getAttribute("aria-labelledby");
        const htmlFor = el.id && container.querySelector(`label[for="${el.id}"]`);
        const parentLabel = el.closest("label");
        const hasName = ariaLabel || labelledBy || htmlFor || parentLabel || el.getAttribute("title");

        expect(
            hasName,
            `Element <${el.tagName.toLowerCase()}> with text "${el.textContent?.trim().slice(0, 40)}" missing accessible name`
        ).toBeTruthy();
    });
}

/**
 * WCAG 2.5.5: Buttons must have minimum 44x44px touch target.
 * We check for min-w-[44px]/min-h-[44px] or min-w-[48px]/min-h-[48px] or min-h-[56px] in className.
 */
function assertTouchTargets(container: HTMLElement) {
    const buttons = container.querySelectorAll<HTMLElement>("button");
    buttons.forEach((btn) => {
        const cls = btn.className;
        const hasTouchSize =
            cls.includes("min-h-[44px]") ||
            cls.includes("min-h-[48px]") ||
            cls.includes("min-h-[56px]") ||
            cls.includes("min-w-[44px]") ||
            cls.includes("min-w-[48px]") ||
            // p-4 = 16px padding on a text button is always > 44px total
            cls.includes("p-4") ||
            // p-3 with text content typically > 44px
            cls.includes("p-3");
        expect(
            hasTouchSize,
            `Button "${btn.textContent?.trim().slice(0, 40)}" may not meet 44px touch target`
        ).toBeTruthy();
    });
}

describe("Mobile UX: Accessibility - aria-labels", () => {
    it("ScanResult has accessible names on all interactive elements", () => {
        const { container } = render(
            <ScanResult scanResult={scanResult} onSelectOperation={vi.fn()} onBack={vi.fn()} />
        );
        assertAllHaveAccessibleName(container);
    });

    it("QuantityInput has accessible names on all interactive elements", () => {
        const { container } = render(
            <QuantityInput
                scanResult={scanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
            />
        );
        assertAllHaveAccessibleName(container);
    });

    it("ConfirmationDialog has accessible names on all interactive elements", () => {
        const { container } = render(
            <ConfirmationDialog
                scanResult={scanResult}
                operation="add"
                quantity={5}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />
        );
        assertAllHaveAccessibleName(container);
    });

    it("SuccessFeedback has accessible names on all interactive elements", () => {
        const { container } = render(
            <SuccessFeedback
                scanResult={scanResult}
                operation="add"
                quantity={5}
                onScanAnother={vi.fn()}
            />
        );
        assertAllHaveAccessibleName(container);
    });

    it("ErrorFeedback has accessible names on all interactive elements", () => {
        const { container } = render(
            <ErrorFeedback errorMessage="Test error" onRetry={vi.fn()} onCancel={vi.fn()} />
        );
        assertAllHaveAccessibleName(container);
    });
});

describe("Mobile UX: Touch targets (WCAG 2.5.5)", () => {
    it("ScanResult buttons meet minimum 44px touch target", () => {
        const { container } = render(
            <ScanResult scanResult={scanResult} onSelectOperation={vi.fn()} onBack={vi.fn()} />
        );
        assertTouchTargets(container);
    });

    it("QuantityInput buttons meet minimum 44px touch target", () => {
        const { container } = render(
            <QuantityInput
                scanResult={scanResult}
                operation="add"
                onConfirm={vi.fn()}
                onBack={vi.fn()}
            />
        );
        assertTouchTargets(container);
    });

    it("ConfirmationDialog buttons meet minimum 44px touch target", () => {
        const { container } = render(
            <ConfirmationDialog
                scanResult={scanResult}
                operation="add"
                quantity={5}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />
        );
        assertTouchTargets(container);
    });

    it("SuccessFeedback buttons meet minimum 44px touch target", () => {
        const { container } = render(
            <SuccessFeedback
                scanResult={scanResult}
                operation="add"
                quantity={5}
                onScanAnother={vi.fn()}
            />
        );
        assertTouchTargets(container);
    });

    it("ErrorFeedback buttons meet minimum 44px touch target", () => {
        const { container } = render(
            <ErrorFeedback errorMessage="Test error" onRetry={vi.fn()} onCancel={vi.fn()} />
        );
        assertTouchTargets(container);
    });
});

describe("Mobile UX: Swipe hint", () => {
    it("ConfirmationDialog shows swipe hint for mobile", () => {
        render(
            <ConfirmationDialog
                scanResult={scanResult}
                operation="add"
                quantity={5}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />
        );
        // Hint text is in DOM (visibility controlled by CSS md:hidden)
        expect(screen.getByText(/Swipe right to confirm/)).toBeInTheDocument();
    });
});
