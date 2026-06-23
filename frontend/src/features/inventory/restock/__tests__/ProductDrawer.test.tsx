import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithI18n } from "../../../../test-utils/i18n-wrapper";
import { ToastProvider } from "../../../../components/ui/Toast";
import { ProductDrawer } from "../ProductDrawer";
import type { Card } from "../types";

// Stub recharts: jsdom has no layout, and we want to assert reference-line
// props made it into the chart payload.
vi.mock("recharts", () => {
    const passthrough =
        (testid: string) =>
        ({ children }: { children?: React.ReactNode }) => (
            <div data-testid={testid}>{children}</div>
        );
    return {
        ResponsiveContainer: passthrough("rc-responsive"),
        ComposedChart: ({
            children,
            data,
        }: {
            children?: React.ReactNode;
            data?: unknown[];
        }) => (
            <div data-testid="rc-composed" data-points={data?.length ?? 0}>
                {children}
            </div>
        ),
        CartesianGrid: () => <div data-testid="rc-grid" />,
        XAxis: () => <div data-testid="rc-xaxis" />,
        YAxis: () => <div data-testid="rc-yaxis" />,
        Tooltip: () => <div data-testid="rc-tooltip" />,
        Area: ({ dataKey }: { dataKey?: string }) => (
            <div data-testid="rc-area" data-key={dataKey} />
        ),
        Bar: ({ dataKey }: { dataKey?: string }) => (
            <div data-testid={`rc-bar-${dataKey}`} data-key={dataKey} />
        ),
        ReferenceLine: ({ y, stroke }: { y?: number; stroke?: string }) => (
            <div
                data-testid="rc-refline"
                data-y={String(y)}
                data-stroke={stroke}
            />
        ),
    };
});

const series = Array.from({ length: 10 }, (_, i) => ({
    date: `2026-05-${String(i + 1).padStart(2, "0")}`,
    on_hand: 20 - i,
    inbound: i === 3 ? 5 : 0,
    outbound: i === 6 ? 2 : 1,
}));

const seriesResponse = {
    product_id: "pm-1",
    days: 90,
    series,
    velocity: { "7d": 1.23, "30d": 0.87, "90d": 0.42 },
    projection: {
        current_qty: 11,
        daily_burn: 1.1,
        days_to_reorder: 4.5,
        days_to_critical: 9.2,
        days_to_out: 14.7,
        suggested_reorder_qty: 30,
    },
};

const pmRecord = {
    id: "pm-1",
    reorder_threshold: 10,
    critical_threshold: 5,
    max_threshold: 50,
    reorder_qty: 20,
};

const updateMutate = vi.fn(
    (_args: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
        opts?.onSuccess?.({ data: {} });
    },
);

vi.mock("@refinedev/core", () => ({
    useCustom: vi.fn(() => ({
        data: { data: seriesResponse },
        isLoading: false,
        isError: false,
    })),
    useOne: vi.fn(() => ({
        data: { data: pmRecord },
        isLoading: false,
    })),
    useUpdate: vi.fn(() => ({
        mutate: updateMutate,
        isLoading: false,
    })),
    useGetIdentity: vi.fn(() => ({
        data: { capabilities: { manage_own_inventory: true } },
        isLoading: false,
    })),
}));

const renderWithProviders = (ui: React.ReactElement) =>
    renderWithI18n(<ToastProvider>{ui}</ToastProvider>);

const card: Card = {
    id: "pm-1",
    sku: "SKU-001",
    name: "Widget Alpha",
    qty: 11,
    reorder_threshold: 10,
    max_threshold: 50,
    bucket: "REORDER",
    urgency: 0.6,
    velocity_7d: 1.23,
    days_to_runout: 9,
    sparkline: [20, 18, 16, 14, 12, 11],
};

describe("ProductDrawer", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
    });

    it("returns null when card is null", () => {
        const { container } = renderWithI18n(
            <ProductDrawer card={null} onClose={() => {}} />,
        );
        expect(container.firstChild).toBeNull();
        expect(screen.queryByTestId("product-drawer")).not.toBeInTheDocument();
    });

    it("renders header with SKU, name, bucket badge and all three tabs", () => {
        renderWithProviders(<ProductDrawer card={card} onClose={() => {}} />);

        expect(screen.getByTestId("product-drawer")).toBeInTheDocument();
        expect(screen.getByText("SKU-001")).toBeInTheDocument();
        expect(screen.getByText("Widget Alpha")).toBeInTheDocument();
        expect(screen.getByText("Reorder")).toBeInTheDocument();

        const tabs = screen.getAllByRole("tab");
        expect(tabs.map((t) => t.textContent)).toEqual([
            "History",
            "Velocity",
            "Thresholds",
        ]);
    });

    it("history tab renders chart with reorder + critical reference lines", () => {
        renderWithProviders(<ProductDrawer card={card} onClose={() => {}} />);

        const chart = screen.getByTestId("rc-composed");
        expect(chart).toHaveAttribute("data-points", String(series.length));

        // on_hand area + inbound/outbound bars
        expect(screen.getByTestId("rc-area")).toHaveAttribute(
            "data-key",
            "on_hand",
        );
        expect(screen.getByTestId("rc-bar-inbound")).toBeInTheDocument();
        expect(screen.getByTestId("rc-bar-outbound")).toBeInTheDocument();

        // Two reference lines: reorder (10) amber, critical (5) red
        const reflines = screen.getAllByTestId("rc-refline");
        expect(reflines).toHaveLength(2);
        const byY = Object.fromEntries(
            reflines.map((el) => [
                el.getAttribute("data-y"),
                el.getAttribute("data-stroke"),
            ]),
        );
        expect(byY["10"]).toBe("#f59e0b");
        expect(byY["5"]).toBe("#ef4444");
    });

    it("velocity tab shows three rate tiles and four projection KPI rows", () => {
        renderWithProviders(<ProductDrawer card={card} onClose={() => {}} />);

        fireEvent.click(screen.getByRole("tab", { name: "Velocity" }));

        const tiles = screen.getByTestId("velocity-tiles");
        expect(within(tiles).getByText("1.23/d")).toBeInTheDocument();
        expect(within(tiles).getByText("0.87/d")).toBeInTheDocument();
        expect(within(tiles).getByText("0.42/d")).toBeInTheDocument();

        const panel = screen.getByTestId("projection-panel");
        expect(within(panel).getByText("Days to reorder")).toBeInTheDocument();
        expect(within(panel).getByText("4.5")).toBeInTheDocument();
        expect(within(panel).getByText("9.2")).toBeInTheDocument();
        expect(within(panel).getByText("14.7")).toBeInTheDocument();
        expect(
            within(panel).getByText("Suggested reorder qty"),
        ).toBeInTheDocument();
        expect(within(panel).getByText("30")).toBeInTheDocument();
    });

    it("velocity tab formats null projection values as ∞ and —", async () => {
        const { useCustom } = await import("@refinedev/core");
        const mock = useCustom as unknown as ReturnType<typeof vi.fn>;
        const nullResponse = {
            data: {
                data: {
                    ...seriesResponse,
                    projection: {
                        current_qty: 11,
                        daily_burn: 0,
                        days_to_reorder: null,
                        days_to_critical: null,
                        days_to_out: null,
                        suggested_reorder_qty: null,
                    },
                },
            },
            isLoading: false,
            isError: false,
        };
        mock.mockReturnValue(nullResponse);
        try {
            renderWithProviders(<ProductDrawer card={card} onClose={() => {}} />);
            fireEvent.click(screen.getByRole("tab", { name: "Velocity" }));

            const panel = screen.getByTestId("projection-panel");
            expect(within(panel).getAllByText("∞")).toHaveLength(3);
            expect(within(panel).getByText("—")).toBeInTheDocument();
        } finally {
            mock.mockReturnValue({
                data: { data: seriesResponse },
                isLoading: false,
                isError: false,
            });
        }
    });

    it("respects initialTab prop and opens directly on Thresholds", async () => {
        renderWithProviders(
            <ProductDrawer
                card={card}
                onClose={() => {}}
                initialTab="thresholds"
            />,
        );
        const thresholdsTab = screen.getByRole("tab", { name: "Thresholds" });
        expect(thresholdsTab).toHaveAttribute("aria-selected", "true");
        await waitFor(() =>
            expect(
                (screen.getByTestId("threshold-reorder") as HTMLInputElement)
                    .value,
            ).toBe("10"),
        );
    });

    it("calls onClose when overlay clicked and when ESC pressed", () => {
        const onClose = vi.fn();
        renderWithProviders(<ProductDrawer card={card} onClose={onClose} />);

        fireEvent.click(screen.getByTestId("drawer-overlay"));
        expect(onClose).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(document, { key: "Escape" });
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    describe("Thresholds tab", () => {
        beforeEach(() => {
            updateMutate.mockClear();
        });

        const openTab = () =>
            fireEvent.click(screen.getByRole("tab", { name: "Thresholds" }));

        it("renders four prefilled inputs from fetched product model", async () => {
            renderWithProviders(<ProductDrawer card={card} onClose={() => {}} />);
            openTab();

            const reorder = screen.getByTestId(
                "threshold-reorder",
            ) as HTMLInputElement;
            const critical = screen.getByTestId(
                "threshold-critical",
            ) as HTMLInputElement;
            const max = screen.getByTestId(
                "threshold-max",
            ) as HTMLInputElement;
            const qty = screen.getByTestId(
                "threshold-qty",
            ) as HTMLInputElement;

            await waitFor(() => expect(reorder.value).toBe("10"));
            expect(critical.value).toBe("5");
            expect(max.value).toBe("50");
            expect(qty.value).toBe("20");
        });

        it("calls useUpdate with edited values and fires onSaved", async () => {
            const onSaved = vi.fn();
            renderWithProviders(
                <ProductDrawer
                    card={card}
                    onClose={() => {}}
                    onSaved={onSaved}
                />,
            );
            openTab();
            const reorder = screen.getByTestId(
                "threshold-reorder",
            ) as HTMLInputElement;
            await waitFor(() => expect(reorder.value).toBe("10"));

            fireEvent.change(reorder, { target: { value: "12" } });
            fireEvent.click(screen.getByTestId("threshold-save"));

            expect(updateMutate).toHaveBeenCalledTimes(1);
            const [args] = updateMutate.mock.calls[0];
            expect(args).toEqual({
                resource: "product-models",
                id: "pm-1",
                values: {
                    reorder_threshold: 12,
                    critical_threshold: 5,
                    max_threshold: 50,
                    reorder_qty: 20,
                },
            });
            expect(onSaved).toHaveBeenCalledTimes(1);
        });

        it("shows inline error when critical > reorder and disables save", async () => {
            renderWithProviders(<ProductDrawer card={card} onClose={() => {}} />);
            openTab();
            const critical = screen.getByTestId(
                "threshold-critical",
            ) as HTMLInputElement;
            await waitFor(() => expect(critical.value).toBe("5"));

            fireEvent.change(critical, { target: { value: "99" } });
            expect(screen.getByTestId("threshold-error")).toHaveTextContent(
                "Critical must be ≤ reorder",
            );
            expect(screen.getByTestId("threshold-save")).toBeDisabled();
            fireEvent.click(screen.getByTestId("threshold-save"));
            expect(updateMutate).not.toHaveBeenCalled();
        });

        it("shows inline error when reorder > max and disables save", async () => {
            renderWithProviders(<ProductDrawer card={card} onClose={() => {}} />);
            openTab();
            const reorder = screen.getByTestId(
                "threshold-reorder",
            ) as HTMLInputElement;
            await waitFor(() => expect(reorder.value).toBe("10"));

            fireEvent.change(reorder, { target: { value: "999" } });
            expect(screen.getByTestId("threshold-error")).toHaveTextContent(
                "Reorder must be ≤ max",
            );
            expect(screen.getByTestId("threshold-save")).toBeDisabled();
        });

        it("disables inputs and shows read-only notice without manage_own_inventory", async () => {
            const { useGetIdentity } = await import("@refinedev/core");
            const mock = useGetIdentity as unknown as ReturnType<typeof vi.fn>;
            mock.mockReturnValue({
                data: { capabilities: { manage_own_inventory: false } },
                isLoading: false,
            });
            try {
                renderWithProviders(
                    <ProductDrawer card={card} onClose={() => {}} />,
                );
                openTab();

                expect(
                    screen.getByTestId("thresholds-readonly"),
                ).toHaveTextContent("Read-only");
                expect(screen.getByTestId("threshold-reorder")).toBeDisabled();
                expect(screen.getByTestId("threshold-critical")).toBeDisabled();
                expect(screen.getByTestId("threshold-max")).toBeDisabled();
                expect(screen.getByTestId("threshold-qty")).toBeDisabled();
                expect(screen.getByTestId("threshold-save")).toBeDisabled();
            } finally {
                mock.mockReturnValue({
                    data: { capabilities: { manage_own_inventory: true } },
                    isLoading: false,
                });
            }
        });

        it("sends null when an input is cleared", async () => {
            renderWithProviders(<ProductDrawer card={card} onClose={() => {}} />);
            openTab();
            const qty = screen.getByTestId(
                "threshold-qty",
            ) as HTMLInputElement;
            await waitFor(() => expect(qty.value).toBe("20"));

            fireEvent.change(qty, { target: { value: "" } });
            fireEvent.click(screen.getByTestId("threshold-save"));

            expect(updateMutate).toHaveBeenCalledTimes(1);
            const [args] = updateMutate.mock.calls[0];
            expect((args as { values: { reorder_qty: number | null } }).values
                .reorder_qty).toBeNull();
        });
    });
});
