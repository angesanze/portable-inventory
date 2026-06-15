import { useState, useCallback, useMemo } from "react";
import { useList, useDelete, useCustomMutation } from "@refinedev/core";
import type { CrudFilters } from "@refinedev/core";
import { Eye, Edit2, Trash2, Plus, MoreVertical, MapPin, Warehouse, Store, Cloud, Download } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
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
import { DropdownMenu } from "../../../components/ui/DropdownMenu";
import { ConfirmDialog, useConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { SkeletonRow } from "../../../components/ui/Skeleton";
import { EmptyState, FilteredEmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { useTableSelection } from "../../../hooks/useTableSelection";
import { API_URL } from "../../../config";
import { exportToExcel } from "../../../utils/exportToExcel";
import { fetchAllPages } from "../../../utils/fetchAllPages";
import { LOCATION_EXPORT_COLUMNS, LOCATION_EXPORT_FILENAME } from "./exportColumns";

function typeVariant(type: string): BadgeVariant {
    switch (type) {
        case "WAREHOUSE": return "indigo";
        case "STORE": return "cyan";
        case "PHYSICAL": return "emerald";
        case "LOSS": return "rose";
        case "VIRTUAL": return "neutral";
        default: return "neutral";
    }
}

function typeLabel(type: string, t: TFunction): string {
    switch (type) {
        case "WAREHOUSE": return t("locations.warehouse");
        case "STORE": return t("locations.store");
        case "PHYSICAL": return t("locations.physical");
        case "LOSS": return t("locations.loss");
        case "VIRTUAL": return t("locations.virtual");
        default: return type || t("locations.unknown");
    }
}

export const LocationList = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const LOCATION_TYPE_OPTIONS = [
        { label: t("locations.warehouse"), value: "WAREHOUSE" },
        { label: t("locations.store"), value: "STORE" },
        { label: t("locations.physical"), value: "PHYSICAL" },
        { label: t("locations.loss"), value: "LOSS" },
        { label: t("locations.virtual"), value: "VIRTUAL" },
    ];
    const [filters, setFilters] = useState<Record<string, string>>({
        name: "",
        type: "",
    });

    const updateFilter = useCallback((key: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    }, []);

    const crudFilters: CrudFilters = useMemo(() => {
        const result: CrudFilters = [];
        if (filters.name) {
            result.push({ field: "search", operator: "contains", value: filters.name });
        }
        if (filters.type) {
            result.push({ field: "type", operator: "eq", value: filters.type });
        }
        return result;
    }, [filters]);

    const { data: listData, isLoading, isError, refetch } = useList({
        resource: "locations",
        filters: crudFilters,
        sorters: [{ field: "name", order: "asc" }],
    }) as any;

    const navigate = useNavigate();
    const { mutate: deleteLocation } = useDelete();
    const { mutateAsync: bulkDelete } = useCustomMutation();
    const { confirm, dialogProps } = useConfirmDialog();
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

    const locations = Array.isArray(listData?.data) ? listData.data : [];

    const [exporting, setExporting] = useState(false);
    // Export must cover the full filtered dataset, not the visible page —
    // `locations` is one server page.
    const exportAll = async () => {
        setExporting(true);
        try {
            const params: Record<string, string> = {};
            if (filters.name) params.search = filters.name;
            if (filters.type) params.type = filters.type;
            const all = await fetchAllPages<any>(`${API_URL}/api/v1/locations/`, params);
            exportToExcel(all, LOCATION_EXPORT_COLUMNS, `${LOCATION_EXPORT_FILENAME}.xlsx`);
        } finally {
            setExporting(false);
        }
    };

    const selection = useTableSelection(locations);
    const selectedItems = useMemo(
        () =>
            locations
                .filter((l: any) => selection.selectedIds.has(l.id))
                .map((l: any) => ({ id: String(l.id), label: l.name as string })),
        [locations, selection.selectedIds],
    );

    const filterConfigs: FilterConfig[] = [
        {
            key: "name",
            label: t("common:name"),
            type: "text",
            placeholder: t("locations.searchByName"),
            value: filters.name,
            onChange: (v) => updateFilter("name", v),
        },
        {
            key: "type",
            label: t("common:type"),
            type: "select",
            options: LOCATION_TYPE_OPTIONS,
            value: filters.type,
            onChange: (v) => updateFilter("type", v),
        },
    ];

    return (
        <div>
            <PageHeader
                title={t("locations.title")}
                subtitle={t("locations.subtitle")}
                count={locations.length}
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
                        <Link to="/locations/create">
                            <Button variant="primary" icon={Plus}>
                                {t("locations.newLocation")}
                            </Button>
                        </Link>
                    </>
                }
            />

            <FilterBar filters={filterConfigs} className="mb-4" />

            {isError ? (
                <ErrorState
                    title={t("locations.failedToLoad")}
                    message={t("locations.failedToLoadDesc")}
                    onRetry={refetch}
                />
            ) : isLoading ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10" />
                            <TableHead>{t("common:name")}</TableHead>
                            <TableHead>{t("common:type")}</TableHead>
                            <TableHead>{t("locations.parentLocation")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={5} />
                    </TableBody>
                </Table>
            ) : locations.length === 0 ? (
                Object.values(filters).some((v) => v) ? (
                    <FilteredEmptyState />
                ) : (
                    <EmptyState
                        icon={MapPin}
                        title={t("locations.emptyTitle")}
                        description={t("locations.emptyDesc")}
                        helpItems={[
                            { icon: Warehouse, text: t("locations.warehouseHelp") },
                            { icon: Store, text: t("locations.storeHelp") },
                            { icon: Cloud, text: t("locations.virtualHelp") },
                        ]}
                        actionLabel={t("locations.addLocation")}
                        onAction={() => navigate("/locations/create")}
                    />
                )
            ) : (
                <>
                    <BulkActionsBar
                        count={selection.selectedIds.size}
                        onClear={selection.clear}
                        actions={[
                            {
                                label: t("common:delete"),
                                icon: Trash2,
                                variant: "danger",
                                onClick: () => setBulkDeleteOpen(true),
                            },
                            {
                                label: t("common:bulkExportSelected"),
                                icon: Download,
                                onClick: () =>
                                    exportToExcel(
                                        locations.filter((l: any) =>
                                            selection.selectedIds.has(l.id),
                                        ),
                                        LOCATION_EXPORT_COLUMNS,
                                        `${LOCATION_EXPORT_FILENAME}-selected.xlsx`,
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
                            <TableHead>{t("common:name")}</TableHead>
                            <TableHead>{t("common:type")}</TableHead>
                            <TableHead>{t("locations.parentLocation")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {locations.map((loc: any) => (
                            <TableRow
                                key={loc.id}
                                className="cursor-pointer"
                                onClick={() => navigate(`/locations/${loc.id}`)}
                            >
                                <TableCell
                                    className="w-10"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Checkbox
                                        aria-label={t("common:selectRow", { name: loc.name })}
                                        checked={selection.selectedIds.has(loc.id)}
                                        onChange={() => selection.toggleOne(loc.id)}
                                    />
                                </TableCell>
                                <TableCell className="font-medium text-zinc-200">
                                    {loc.parent_id && (
                                        <span className="inline-block w-4 border-l-2 border-b-2 border-zinc-700 h-3 mr-2 align-middle rounded-bl-sm" />
                                    )}
                                    {loc.name}
                                </TableCell>
                                <TableCell>
                                    <Badge variant={typeVariant(loc.type)}>
                                        {typeLabel(loc.type, t)}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-zinc-400 text-sm">
                                    {loc.parent_name || (loc.parent_id ? loc.parent_id.slice(0, 8) + "..." : "—")}
                                </TableCell>
                                <TableCell
                                    className="text-right"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <DropdownMenu
                                        trigger={
                                            <button className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" aria-label={t("common:moreActions")}>
                                                <MoreVertical size={16} />
                                            </button>
                                        }
                                        align="end"
                                        items={[
                                            {
                                                label: t("common:view"),
                                                icon: Eye,
                                                onClick: () =>
                                                    navigate(`/locations/${loc.id}`),
                                            },
                                            {
                                                label: t("common:edit"),
                                                icon: Edit2,
                                                onClick: () =>
                                                    navigate(`/locations/edit/${loc.id}`),
                                            },
                                            { type: "divider" as const },
                                            {
                                                label: t("common:delete"),
                                                icon: Trash2,
                                                danger: true,
                                                onClick: async () => {
                                                    if (
                                                        await confirm({
                                                            title: t("locations.deleteTitle"),
                                                            message:
                                                                t("locations.deleteConfirm"),
                                                            variant: "danger",
                                                            confirmLabel: t("common:delete"),
                                                        })
                                                    ) {
                                                        deleteLocation({
                                                            resource: "locations",
                                                            id: loc.id,
                                                        });
                                                    }
                                                },
                                            },
                                        ]}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                </>
            )}

            <ConfirmDialog {...dialogProps} />
            <BulkDeleteModal
                open={bulkDeleteOpen}
                onClose={() => setBulkDeleteOpen(false)}
                items={selectedItems}
                cascadeLabel={t("locations.bulkDeleteRejectIfMovements")}
                cascadeDefault
                onConfirm={async (preserveCascade) => {
                    if (!preserveCascade) {
                        setBulkDeleteOpen(false);
                        const ok = await confirm({
                            title: t("locations.bulkDeleteCascadeConfirmTitle"),
                            message: t("locations.bulkDeleteCascadeConfirmMessage"),
                            variant: "danger",
                            confirmLabel: t("common:delete"),
                        });
                        if (!ok) return;
                    }
                    await bulkDelete({
                        url: `${API_URL}/api/v1/locations/bulk-delete/`,
                        method: "post",
                        values: {
                            ids: Array.from(selection.selectedIds),
                            preserve_movements: preserveCascade,
                        },
                        successNotification: () => ({
                            message: t("locations.bulkDeleteSuccess", {
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
