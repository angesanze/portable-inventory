import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

// Mock the three sub-widgets to isolate routing logic
vi.mock("./TransactionWidget", () => ({
    TransactionWidget: () => <div data-testid="transaction-widget" />,
}));
vi.mock("./ScannerWidget", () => ({
    ScannerWidget: () => <div data-testid="scanner-widget" />,
}));
vi.mock("./QRConfigWidget", () => ({
    QRConfigWidget: () => <div data-testid="qrconfig-widget" />,
}));

import { Widget } from "./Widget";

describe("Widget Router", () => {
    afterEach(() => {
        window.history.pushState({}, "", "/");
    });

    it("routes to TransactionWidget by default", () => {
        window.history.pushState({}, "", "/?api_key=test");
        render(<Widget />);
        expect(screen.getByTestId("transaction-widget")).toBeInTheDocument();
    });

    it("routes to ScannerWidget when mode=scan", () => {
        window.history.pushState({}, "", "/?api_key=test&mode=scan");
        render(<Widget />);
        expect(screen.getByTestId("scanner-widget")).toBeInTheDocument();
    });

    it("routes to QRConfigWidget when configure_mode=true", () => {
        window.history.pushState({}, "", "/?api_key=test&configure_mode=true");
        render(<Widget />);
        expect(screen.getByTestId("qrconfig-widget")).toBeInTheDocument();
    });

    it("prioritizes configure_mode over mode=scan", () => {
        window.history.pushState({}, "", "/?api_key=test&configure_mode=true&mode=scan");
        render(<Widget />);
        expect(screen.getByTestId("qrconfig-widget")).toBeInTheDocument();
    });
});
