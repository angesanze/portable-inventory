import { useMemo, useState } from "react";
import { useCustom } from "@refinedev/core";
import { useTranslation } from "react-i18next";
import { Download, Receipt } from "lucide-react";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "../../../components/ui/Table";
import { SkeletonRow } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { exportToExcel } from "../../../utils/exportToExcel";
import { API_URL } from "../../../config";

interface CogsRow {
    product_id: string | null;
    sku: string;
    name: string;
    quantity: number;
    cogs: number;
}

interface CogsResponse {
    from: string | null;
    to: string | null;
    total_cogs: number;
    total_quantity: number;
    by_product: CogsRow[];
}

const money = (n: number) => Number(n ?? 0).toFixed(2);

export const CogsReport = () => {
    const { t } = useTranslation(["reports", "common"]);

    // Default to the current month-to-date.
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 8)}01`;
    const [from, setFrom] = useState(monthStart);
    const [to, setTo] = useState(today);
    const [applied, setApplied] = useState<{ from: string; to: string }>({
        from: monthStart,
        to: today,
    });

    const query = useMemo(() => {
        const q: Record<string, string> = {};
        if (applied.from) q.from = applied.from;
        if (applied.to) q.to = applied.to;
        return q;
    }, [applied]);

    const { data, isLoading, isError, refetch } = useCustom<CogsResponse>({
        url: `${API_URL}/api/v1/reports/cogs/`,
        method: "get",
        config: { query },
    });

    const report = data?.data;
    const rows = report?.by_product ?? [];

    const [exporting, setExporting] = useState(false);
    const exportExcel = () => {
        setExporting(true);
        try {
            exportToExcel(
                rows,
                [
                    { key: "sku", header: t("colSku") },
                    { key: "name", header: t("colProduct") },
                    { key: "quantity", header: t("colQuantity") },
                    { key: (r) => money(r.cogs), header: t("colCogs") },
                ],
                `${t("cogsFilename")}.xlsx`,
            );
        } finally {
            setExporting(false);
        }
    };

    if (isError) {
        return (
            <ErrorState
                title={t("loadError")}
                message={t("loadErrorDesc")}
                onRetry={refetch}
            />
        );
    }

    return (
        <div>
            <PageHeader
                title={t("cogsTitle")}
                subtitle={t("cogsSubtitle")}
                actions={
                    <Button
                        variant="secondary"
                        icon={Download}
                        disabled={isLoading || exporting || rows.length === 0}
                        onClick={exportExcel}
                    >
                        {t("exportExcel")}
                    </Button>
                }
            />

            <Card className="mb-6">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="w-40">
                        <Input
                            label={t("dateFrom")}
                            type="date"
                            value={from}
                            onChange={(e) => setFrom(e.target.value)}
                            data-testid="cogs-from"
                        />
                    </div>
                    <div className="w-40">
                        <Input
                            label={t("dateTo")}
                            type="date"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            data-testid="cogs-to"
                        />
                    </div>
                    <Button
                        variant="primary"
                        onClick={() => setApplied({ from, to })}
                        data-testid="cogs-apply"
                    >
                        {t("apply")}
                    </Button>
                </div>
            </Card>

            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
                            <Receipt size={20} />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide text-zinc-500">
                                {t("totalCogs")}
                            </p>
                            <p
                                className="text-2xl font-semibold text-zinc-100 tabular-nums"
                                data-testid="cogs-total"
                            >
                                {money(report?.total_cogs ?? 0)}
                            </p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div>
                        <p className="text-xs uppercase tracking-wide text-zinc-500">
                            {t("totalQuantity")}
                        </p>
                        <p className="text-2xl font-semibold text-zinc-100 tabular-nums">
                            {Number(report?.total_quantity ?? 0).toLocaleString()}
                        </p>
                    </div>
                </Card>
            </div>

            <Card
                header={
                    <h3 className="text-sm font-semibold text-zinc-200">{t("byProduct")}</h3>
                }
            >
                {isLoading ? (
                    <Table>
                        <TableBody>
                            <SkeletonRow columns={4} />
                        </TableBody>
                    </Table>
                ) : rows.length === 0 ? (
                    <EmptyState
                        icon={Receipt}
                        title={t("emptyCogs")}
                        description={t("cogsSubtitle")}
                    />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("colSku")}</TableHead>
                                <TableHead>{t("colProduct")}</TableHead>
                                <TableHead className="text-right">{t("colQuantity")}</TableHead>
                                <TableHead className="text-right">{t("colCogs")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => (
                                <TableRow
                                    key={row.product_id ?? row.sku}
                                    data-testid={`cogs-row-${row.product_id ?? row.sku}`}
                                >
                                    <TableCell className="font-mono text-sm text-zinc-400">
                                        {row.sku}
                                    </TableCell>
                                    <TableCell className="text-zinc-200">{row.name}</TableCell>
                                    <TableCell className="text-right tabular-nums text-zinc-300">
                                        {Number(row.quantity).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-zinc-100 font-medium">
                                        {money(row.cogs)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Card>
        </div>
    );
};
