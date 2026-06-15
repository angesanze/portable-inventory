import { useState } from "react";
import { useCustom } from "@refinedev/core";
import { useTranslation } from "react-i18next";
import { Download, Wallet, MapPin } from "lucide-react";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
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

interface ProductValuationRow {
    product_id: string;
    sku: string;
    name: string;
    quantity: number;
    avg_unit_cost: number;
    stock_value: number;
}

interface LocationValuationRow {
    location_id: string | null;
    location: string;
    stock_value: number;
}

interface ValuationResponse {
    total_value: number;
    by_product: ProductValuationRow[];
    by_location: LocationValuationRow[];
}

const money = (n: number) => Number(n ?? 0).toFixed(2);

export const ValuationReport = () => {
    const { t } = useTranslation(["reports", "common"]);

    const { data, isLoading, isError, refetch } = useCustom<ValuationResponse>({
        url: `${API_URL}/api/v1/reports/valuation/`,
        method: "get",
    });

    const report = data?.data;
    const byProduct = report?.by_product ?? [];
    const byLocation = report?.by_location ?? [];

    const [exporting, setExporting] = useState(false);
    const exportExcel = () => {
        setExporting(true);
        try {
            exportToExcel(
                byProduct,
                [
                    { key: "sku", header: t("colSku") },
                    { key: "name", header: t("colProduct") },
                    { key: "quantity", header: t("colQuantity") },
                    { key: (r) => money(r.avg_unit_cost), header: t("colAvgCost") },
                    { key: (r) => money(r.stock_value), header: t("colValue") },
                ],
                `${t("valuationFilename")}.xlsx`,
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
                title={t("valuationTitle")}
                subtitle={t("valuationSubtitle")}
                actions={
                    <Button
                        variant="secondary"
                        icon={Download}
                        disabled={isLoading || exporting || byProduct.length === 0}
                        onClick={exportExcel}
                    >
                        {t("exportExcel")}
                    </Button>
                }
            />

            <div className="mb-6">
                <Card>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                            <Wallet size={20} />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide text-zinc-500">
                                {t("totalValue")}
                            </p>
                            <p
                                className="text-2xl font-semibold text-zinc-100 tabular-nums"
                                data-testid="valuation-total"
                            >
                                {money(report?.total_value ?? 0)}
                            </p>
                        </div>
                    </div>
                </Card>
            </div>

            <Card
                className="mb-6"
                header={
                    <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                        <MapPin size={16} /> {t("byLocation")}
                    </h3>
                }
            >
                {isLoading ? (
                    <Table>
                        <TableBody>
                            <SkeletonRow columns={2} />
                        </TableBody>
                    </Table>
                ) : byLocation.length === 0 ? (
                    <p className="text-sm text-zinc-500">{t("emptyValuation")}</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("colLocation")}</TableHead>
                                <TableHead className="text-right">{t("colValue")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {byLocation.map((row) => (
                                <TableRow key={row.location_id ?? row.location}>
                                    <TableCell className="text-zinc-200">{row.location}</TableCell>
                                    <TableCell className="text-right tabular-nums text-zinc-300">
                                        {money(row.stock_value)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Card>

            <Card
                header={
                    <h3 className="text-sm font-semibold text-zinc-200">{t("byProduct")}</h3>
                }
            >
                {isLoading ? (
                    <Table>
                        <TableBody>
                            <SkeletonRow columns={5} />
                        </TableBody>
                    </Table>
                ) : byProduct.length === 0 ? (
                    <EmptyState
                        icon={Wallet}
                        title={t("emptyValuation")}
                        description={t("valuationSubtitle")}
                    />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("colSku")}</TableHead>
                                <TableHead>{t("colProduct")}</TableHead>
                                <TableHead className="text-right">{t("colQuantity")}</TableHead>
                                <TableHead className="text-right">{t("colAvgCost")}</TableHead>
                                <TableHead className="text-right">{t("colValue")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {byProduct.map((row) => (
                                <TableRow key={row.product_id} data-testid={`valuation-row-${row.product_id}`}>
                                    <TableCell className="font-mono text-sm text-zinc-400">
                                        {row.sku}
                                    </TableCell>
                                    <TableCell className="text-zinc-200">{row.name}</TableCell>
                                    <TableCell className="text-right tabular-nums text-zinc-300">
                                        {Number(row.quantity).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-zinc-300">
                                        {money(row.avg_unit_cost)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-zinc-100 font-medium">
                                        {money(row.stock_value)}
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
