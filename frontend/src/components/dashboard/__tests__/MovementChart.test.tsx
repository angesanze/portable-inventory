import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderWithI18n, i18n } from "../../../test-utils/i18n-wrapper";

vi.mock("@refinedev/core", () => ({
    useList: vi.fn(() => ({
        data: {
            data: [
                { id: 1, occurred_at: new Date().toISOString(), quantity: 5 },
                { id: 2, occurred_at: new Date().toISOString(), quantity: -3 },
            ],
        },
    })),
}));

// Mock recharts to avoid SVG rendering issues in JSDOM
vi.mock("recharts", () => {
    const React = require("react");
    return {
        ResponsiveContainer: ({ children }: any) => (
            <div data-testid="responsive-container">{children}</div>
        ),
        LineChart: ({ children }: any) => (
            <div data-testid="line-chart">{children}</div>
        ),
        Line: ({ dataKey }: any) => <div data-testid={`line-${dataKey}`} />,
        XAxis: () => <div />,
        YAxis: () => <div />,
        Tooltip: () => <div />,
        CartesianGrid: () => <div />,
    };
});

import { MovementChart } from "../MovementChart";

describe("MovementChart", () => {
    afterEach(async () => {
        await i18n.changeLanguage("en");
    });

    it("renders title and period selector", () => {
        renderWithI18n(<MovementChart />);
        expect(screen.getByText("Movement Activity")).toBeTruthy();
        expect(screen.getByText("7d")).toBeTruthy();
        expect(screen.getByText("30d")).toBeTruthy();
        expect(screen.getByText("90d")).toBeTruthy();
    });

    it("renders LineChart (not AreaChart)", () => {
        renderWithI18n(<MovementChart />);
        expect(screen.getByTestId("line-chart")).toBeTruthy();
    });

    it("renders inbound and outbound lines", () => {
        renderWithI18n(<MovementChart />);
        expect(screen.getByTestId("line-inbound")).toBeTruthy();
        expect(screen.getByTestId("line-outbound")).toBeTruthy();
    });

    it("switches active period on click", () => {
        renderWithI18n(<MovementChart />);
        const btn30d = screen.getByText("30d");
        fireEvent.click(btn30d);
        // Active button gets distinct styling
        expect(btn30d.className).toContain("bg-zinc-700");
        // 7d no longer active
        expect(screen.getByText("7d").className).not.toContain("bg-zinc-700");
    });

    it("uses Card component as container", () => {
        const { container } = renderWithI18n(<MovementChart />);
        const card = container.firstElementChild as HTMLElement;
        expect(card.className).toContain("bg-zinc-900/80");
        expect(card.className).toContain("rounded-xl");
    });

    it("renders Italian title when language is switched to it", async () => {
        await i18n.changeLanguage("it");
        renderWithI18n(<MovementChart />);
        expect(screen.getByText("Attività Movimenti")).toBeTruthy();
    });
});
