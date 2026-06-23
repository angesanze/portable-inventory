import { useState, useCallback, useMemo } from "react";
import { useList, useCustomMutation } from "@refinedev/core";
import type { CrudFilters } from "@refinedev/core";
import { ArrowUpRight, ArrowDownLeft, ArrowRightLeft, LogIn, LogOut, Repeat, Plus, ChevronDown, PackagePlus, PackageMinus, Trash2, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { PageHeader } from "../../../components/ui/PageHeader";
import { FilterBar, type FilterConfig } from "../../../components/ui/FilterBar";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "../../../components/ui/Table";
import { Badge, type BadgeVariant } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Checkbox } from "../../../components/ui/Checkbox";
import { BulkActionsBar } from "../../../components/ui/BulkActionsBar";
import { BulkDeleteModal } from "../../../components/ui/BulkDeleteModal";
import { DropdownMenu, type DropdownMenuEntry } from "../../../components/ui/DropdownMenu";
import { SkeletonRow } from "../../../components/ui/Skeleton";
import { EmptyState, FilteredEmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { useTableSelection } from "../../../hooks/useTableSelection";
import { API_URL } from "../../../config";
import { exportToExcel } from "../../../utils/exportToExcel";
import { fetchAllPages } from "../../../utils/fetchAllPages";
import { MOVEMENT_EXPORT_COLUMNS, MOVEMENT_EXPORT_FILENAME } from "./exportColumns";
import type { MovementListRow, ProductModelProbeRow } from "./listTypes";

/** Minimal shape needed to derive a movement's direction (location routing). */
type MovementDirectionInput = Pick<MovementListRow, "from_location" | "to_location">;

// Language-stable direction key, derived from location types. Used both for
// the (translated) badge and for client-side filtering, so the filter keeps
// working regardless of the active language.
function directionKey(move: MovementDirectionInput): "TRANSFER" | "OUTBOUND" | "INBOUND" | "MOVEMENT" {
    const fromType = move.from_location?.type;
    const toType = move.to_location?.type;

    const isRealFrom = fromType && fromType !== "VIRTUAL" && fromType !== "LOSS";
    const isRealTo = toType && toType !== "VIRTUAL" && toType !== "LOSS";
    if (isRealFrom && isRealTo) return "TRANSFER";
    if (isRealFrom) return "OUTBOUND";
    if (isRealTo) return "INBOUND";
    return "MOVEMENT";
}

function directionBadge(move: MovementDirectionInput, t: TFunction): { label: string; variant: BadgeVariant } {
    switch (directionKey(move)) {
        case "TRANSFER":
            return { label: t("movements.transfer"), variant: "cyan" };
        case "OUTBOUND":
            return { label: t("movements.outboundShort"), variant: "rose" };
        case "INBOUND":
            return { label: t("movements.inboundShort"), variant: "emerald" };
        default:
            return { label: t("movements.movement"), variant: "neutral" };
    }
}

export const MovementList = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const [filters, setFilters] = useState<Record<string, string>>({
        product: "",
        direction: "",
    });

    const updateFilter = useCallback((key: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    }, []);

    const crudFilters: CrudFilters = useMemo(() => {
        const result: CrudFilters = [];
        if (filters.product) {
            result.push({ field: "search", operator: "contains", value: filters.product });
        }
        return result;
    }, [filters]);

    const { data: listData, isLoading, isError, refetch } = useList<MovementListRow>({
        resource: "movements",
        filters: crudFilters,
        sorters: [{ field: "occurred_at", order: "desc" }],
    });

    const { data: productsCheck } = useList<ProductModelProbeRow>({
        resource: "product-models",
        pagination: { pageSize: 1 },
    });
    const hasProducts = (productsCheck?.data?.length ?? 0) > 0;

    const navigate = useNavigate();

    const allMovements = Array.isArray(listData?.data) ? listData.data : [];

    // Client-side direction filter (direction is derived, not a backend field)
    const movements = useMemo(() => {
        if (!filters.direction) return allMovements;
        return allMovements.filter((move) => directionKey(move) === filters.direction);
    }, [allMovements, filters.direction]);

    const { mutateAsync: bulkDelete } = useCustomMutation();
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

    const [exporting, setExporting] = useState(false);
    // Export must cover the full filtered dataset, not the visible page —
    // `movements` is one server page.
    const exportAll = async () => {
        setExporting(true);
        try {
            const params: Record<string, string> = {};
            if (filters.product) params.search = filters.product;
            let all = await fetchAllPages<MovementListRow>(`${API_URL}/api/v1/movements/`, params);
            // Direction is derived client-side, so re-apply it on the full set.
            if (filters.direction) {
                all = all.filter((move) => directionKey(move) === filters.direction);
            }
            exportToExcel(all, MOVEMENT_EXPORT_COLUMNS, `${MOVEMENT_EXPORT_FILENAME}.xlsx`);
        } finally {
            setExporting(false);
        }
    };

    const selection = useTableSelection(movements);
    const selectedItems = useMemo(
        () =>
            movements
                .filter((m) => selection.selectedIds.has(m.id))
                .map((m) => {
                    const name = m.product_name || m.product_model?.name || t("movements.unknown");
                    const ts = new Date(m.occurred_at).toLocaleString();
                    return { id: String(m.id), label: `${ts} — ${name}` };
                }),
        [movements, selection.selectedIds, t],
    );

    const filterConfigs: FilterConfig[] = [
        {
            key: "product",
            label: t("movements.product"),
            type: "text",
            placeholder: t("movements.searchProductSku"),
            value: filters.product,
            onChange: (v) => updateFilter("product", v),
        },
        {
            key: "direction",
            label: t("movements.direction"),
            type: "select",
            options: [
                { label: t("movements.inboundShort"), value: "INBOUND" },
                { label: t("movements.outboundShort"), value: "OUTBOUND" },
                { label: t("movements.transfer"), value: "TRANSFER" },
            ],
            value: filters.direction,
            onChange: (v) => updateFilter("direction", v),
        },
    ];

    return (
        <div>
            <PageHeader
                title={t("movements.logTitle")}
                subtitle={t("movements.subtitle")}
                count={movements.length}
                actions={
                    <>
                        <Button
                            variant="secondary"
                            icon={Download}
                            disabled={isLoading || exporting}
                            onClick={exportAll}
                        >
                            {t("common:downloadExcel")}
                        </Button>
                        <DropdownMenu
                            trigger={
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
                                >
                                    {t("movements.shortcuts")}
                                    <ChevronDown size={14} />
                                </button>
                            }
                            items={[
                                { label: t("movements.receiveStock"), icon: PackagePlus, onClick: () => navigate("/movements/create?direction=inbound") },
                                { label: t("movements.shipOut"), icon: PackageMinus, onClick: () => navigate("/movements/create?direction=outbound") },
                                { label: t("movements.transfer"), icon: ArrowRightLeft, onClick: () => navigate("/movements/transfer") },
                            ] as DropdownMenuEntry[]}
                            align="end"
                        />
                        <button
                            type="button"
                            onClick={() => navigate("/movements/create")}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
                        >
                            <Plus size={14} />
                            {t("movements.newMovement")}
                        </button>
                    </>
                }
            />

            <FilterBar filters={filterConfigs} className="mb-4" />

            {isError ? (
                <ErrorState
                    title={t("movements.failedToLoad")}
                    message={t("movements.failedToLoadDesc")}
                    onRetry={refetch}
                />
            ) : isLoading ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10" />
                            <TableHead>{t("movements.timestamp")}</TableHead>
                            <TableHead>{t("movements.product")}</TableHead>
                            <TableHead>{t("movements.direction")}</TableHead>
                            <TableHead className="text-right">{t("movements.quantity")}</TableHead>
                            <TableHead>{t("movements.fromLocationCol")}</TableHead>
                            <TableHead>{t("movements.toLocationCol")}</TableHead>
                            <TableHead>{t("movements.user")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={8} />
                    </TableBody>
                </Table>
            ) : movements.length === 0 ? (
                Object.values(filters).some((v) => v) ? (
                    <FilteredEmptyState />
                ) : (
                    <EmptyState
                        icon={ArrowRightLeft}
                        title={t("movements.noMovementsRecorded")}
                        description={hasProducts
                            ? t("movements.emptyDesc")
                            : t("movements.emptyDescNoProducts")
                        }
                        helpItems={[
                            { icon: LogIn, text: t("movements.inboundHelp") },
                            { icon: LogOut, text: t("movements.outboundHelp") },
                            { icon: Repeat, text: t("movements.transferHelp") },
                        ]}
                        actionLabel={hasProducts ? t("movements.recordAMovement") : t("movements.createProductFirst")}
                        onAction={() => navigate(hasProducts ? "/movements/create" : "/products/create")}
                        secondaryActionLabel={hasProducts ? t("movements.createTransfer") : undefined}
                        onSecondaryAction={hasProducts ? () => navigate("/movements/transfer") : undefined}
                    />
                )
            ) : (
                <>
                    <BulkActionsBar
                        count={selection.selectedIds.size}
                        onClear={selection.clear}
                        actions={[
                            {
                                label: t("movements.bulkDeleteAction", {
                                    count: selection.selectedIds.size,
                                }),
                                icon: Trash2,
                                variant: "danger",
                                onClick: () => setBulkDeleteOpen(true),
                            },
                            {
                                label: t("common:bulkExportSelected"),
                                icon: Download,
                                onClick: () =>
                                    exportToExcel(
                                        movements.filter((m) =>
                                            selection.selectedIds.has(m.id),
                                        ),
                                        MOVEMENT_EXPORT_COLUMNS,
                                        `${MOVEMENT_EXPORT_FILENAME}-selected.xlsx`,
                                    ),
                            },
                        ]}
                    />
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10">
                                    <Checkbox
                                        aria-label={t("common:selectAll")}
                                        checked={
                                            selection.isPartial
                                                ? "indeterminate"
                                                : selection.isAllSelected
                                        }
                                        onChange={() => selection.toggleAll()}
                                    />
                                </TableHead>
                                <TableHead>{t("movements.timestamp")}</TableHead>
                                <TableHead>{t("movements.product")}</TableHead>
                                <TableHead>{t("movements.direction")}</TableHead>
                                <TableHead className="text-right">{t("movements.quantity")}</TableHead>
                                <TableHead>{t("movements.fromLocationCol")}</TableHead>
                                <TableHead>{t("movements.toLocationCol")}</TableHead>
                                <TableHead>{t("movements.user")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {movements.map((move) => {
                                const dir = directionBadge(move, t);
                                const qty = move.quantity ?? move.delta ?? 0;
                                const isNegative = Number(qty) < 0;
                                const productName = move.product_name || move.product_model?.name || t("movements.unknown");

                                return (
                                    <TableRow key={move.id}>
                                        <TableCell
                                            className="w-10"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <Checkbox
                                                aria-label={t("common:selectRow", { name: productName })}
                                                checked={selection.selectedIds.has(move.id)}
                                                onChange={() => selection.toggleOne(move.id)}
                                            />
                                        </TableCell>
                                        <TableCell className="font-mono text-zinc-400 text-xs whitespace-nowrap">
                                            {new Date(move.occurred_at).toLocaleString()}
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium text-zinc-200">
                                                {productName}
                                            </div>
                                            <div className="text-xs text-zinc-500 font-mono">
                                                {move.sku || move.product_model?.sku || ""}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={dir.variant} dot>
                                                {dir.label}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <span
                                                className={`inline-flex items-center gap-1 font-semibold ${
                                                    isNegative ? "text-rose-400" : "text-emerald-400"
                                                }`}
                                            >
                                                {isNegative ? (
                                                    <ArrowDownLeft size={14} />
                                                ) : (
                                                    <ArrowUpRight size={14} />
                                                )}
                                                {isNegative ? "" : "+"}
                                                {qty}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-zinc-400 text-sm">
                                            {move.supplier_name || move.from_location?.name || t("movements.external")}
                                        </TableCell>
                                        <TableCell className="text-zinc-400 text-sm">
                                            {move.to_location?.name || t("movements.external")}
                                        </TableCell>
                                        <TableCell className="text-zinc-400 text-sm">
                                            {move.performed_by?.username || move.performed_by_name || "—"}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </>
            )}

            <BulkDeleteModal
                open={bulkDeleteOpen}
                onClose={() => setBulkDeleteOpen(false)}
                items={selectedItems}
                extraWarning={t("movements.bulkDeleteAuditWarning")}
                onConfirm={async () => {
                    await bulkDelete({
                        url: `${API_URL}/api/v1/movements/bulk-delete/`,
                        method: "post",
                        values: {
                            ids: Array.from(selection.selectedIds),
                        },
                        successNotification: () => ({
                            message: t("movements.bulkDeleteSuccess", {
                                count: selectedItems.length,
                            }),
                            type: "success",
                        }),
                        errorNotification: () => ({
                            message: t("common:bulkDeleteFailed"),
                            type: "error",
                        }),
                    });
                    selection.clear();
                    setBulkDeleteOpen(false);
                    refetch();
                }}
            />
        </div>
    );
};
