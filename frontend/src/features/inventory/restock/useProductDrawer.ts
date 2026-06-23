import { useMemo, useState } from "react";
import { useProductSeries } from "./useProductSeries";
import type { Card } from "./types";
import type { ChartPoint, Period, SeriesResponse } from "./drawerTypes";

interface UseProductDrawerResult {
    period: Period;
    setPeriod: (p: Period) => void;
    payload: SeriesResponse | undefined;
    isLoading: boolean;
    chartData: ChartPoint[];
    allZero: boolean;
    reorderT: number | null;
    criticalT: number | null;
}

/**
 * Owns the drawer's stock-series fetch and the derived chart/threshold view
 * models. Behaviour-identical to the inline logic previously held in
 * ``DrawerBody``: same query, same memoised transforms, same defaults.
 */
export const useProductDrawer = (card: Card): UseProductDrawerResult => {
    const [period, setPeriod] = useState<Period>(90);

    const { data, isLoading } = useProductSeries(card.id, period) as {
        data?: { data: SeriesResponse };
        isLoading: boolean;
    };
    const payload = data?.data;

    const reorderT = card.reorder_threshold ?? null;
    const criticalT = reorderT != null ? reorderT / 2 : null;

    const chartData = useMemo<ChartPoint[]>(() => {
        const series = payload?.series ?? [];
        return series.map((p) => ({
            date: p.date.slice(5),
            on_hand: p.on_hand,
            inbound: p.inbound,
            outbound: -p.outbound,
        }));
    }, [payload]);

    const allZero = useMemo(
        () =>
            chartData.length === 0 ||
            chartData.every(
                (p) => p.on_hand === 0 && p.inbound === 0 && p.outbound === 0,
            ),
        [chartData],
    );

    return {
        period,
        setPeriod,
        payload,
        isLoading,
        chartData,
        allZero,
        reorderT,
        criticalT,
    };
};
