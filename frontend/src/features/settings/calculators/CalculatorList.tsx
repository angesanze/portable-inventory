import { useMemo, useState } from "react";
import { useList, useDelete, useCustomMutation } from "@refinedev/core";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Edit2, MoreVertical, Zap, Hash, ArrowLeftRight, Layers, Fingerprint, Ruler, Clock, Package, Download } from "lucide-react";
import { PageHeader } from "../../../components/ui/PageHeader";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "../../../components/ui/Table";
import { Badge } from "../../../components/ui/Badge";
import type { BadgeVariant } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Checkbox } from "../../../components/ui/Checkbox";
import { BulkActionsBar } from "../../../components/ui/BulkActionsBar";
import { BulkDeleteModal } from "../../../components/ui/BulkDeleteModal";
import { DropdownMenu } from "../../../components/ui/DropdownMenu";
import { ConfirmDialog, useConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { SkeletonRow } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { DismissableHint } from "../../../components/ui/DismissableHint";
import { useTableSelection } from "../../../hooks/useTableSelection";
import { API_URL } from "../../../config";
import { exportToExcel } from "../../../utils/exportToExcel";
import { fetchAllPages } from "../../../utils/fetchAllPages";
import { CALCULATOR_EXPORT_COLUMNS, CALCULATOR_EXPORT_FILENAME } from "./exportColumns";

const PresetUsageCount = ({ presetId }: { presetId: string }) => {
    const { t } = useTranslation(["settings", "common"]);
    const { data, isLoading } = useList({
        resource: "product-models",
        filters: [{ field: "default_calculator", operator: "eq", value: presetId }],
        pagination: { pageSize: 1 },
    }) as any;

    if (isLoading) {
        return <span className="text-zinc-600 text-sm">…</span>;
    }

    const count = data?.total ?? 0;

    if (count === 0) {
        return <span className="text-zinc-500 text-sm">{t("common:notUsed")}</span>;
    }

    return (
        <Link
            to={`/products?default_calculator=${presetId}`}
            className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
            {t("settings:trackingPresets.products", { count })}
        </Link>
    );
};

const ENGINE_VARIANTS: Record<string, BadgeVariant> = {
    counter: "info",
    converter: "indigo",
    bucket: "amber",
    tracker: "cyan",
    dimension: "emerald",
    time_based: "rose",
};

const ENGINE_LABEL_KEYS: Record<string, string> = {
    counter: "counter",
    converter: "converter",
    bucket: "bucket",
    tracker: "tracker",
    dimension: "dimension",
    time_based: "timeBased",
};

export const CalculatorList = () => {
    const { t } = useTranslation(["settings", "common"]);
    const navigate = useNavigate();
    const { data: listData, isLoading, isError, refetch } = useList({
        resource: "calculator-templates",
    }) as any;
    const { mutate: deleteTemplate } = useDelete();
    const { mutateAsync: bulkDelete } = useCustomMutation();
    const { confirm, dialogProps } = useConfirmDialog();
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

    const templates = Array.isArray(listData?.data) ? listData.data : [];

    const [exporting, setExporting] = useState(false);
    // Export must cover the full dataset, not the visible page —
    // `templates` is one server page.
    const exportAll = async () => {
        setExporting(true);
        try {
            const all = await fetchAllPages<any>(`${API_URL}/api/v1/calculator-templates/`);
            exportToExcel(all, CALCULATOR_EXPORT_COLUMNS, `${CALCULATOR_EXPORT_FILENAME}.xlsx`);
        } finally {
            setExporting(false);
        }
    };

    const selection = useTableSelection(templates);
    const selectedItems = useMemo(
        () =>
            templates
                .filter((tpl: any) => selection.selectedIds.has(tpl.id))
                .map((tpl: any) => ({ id: String(tpl.id), label: tpl.name as string })),
        [templates, selection.selectedIds],
    );

    return (
        <div>
            <PageHeader
                title={t("settings:trackingPresets.title")}
                subtitle={t("settings:trackingPresets.subtitle")}
                count={templates.length}
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
                        <Button
                            variant="primary"
                            icon={Plus}
                            onClick={() => navigate("/settings/calculators/create")}
                        >
                            {t("settings:trackingPresets.newPreset")}
                        </Button>
                    </>
                }
            />

            <DismissableHint id="tracking-presets-intro" className="mb-6">
                {t("settings:trackingPresets.hint")}
            </DismissableHint>

            {isError ? (
                <ErrorState
                    title={t("settings:trackingPresets.errorTitle")}
                    message={t("settings:trackingPresets.errorMessage")}
                    onRetry={refetch}
                />
            ) : isLoading ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10" />
                            <TableHead>{t("common:name")}</TableHead>
                            <TableHead>{t("settings:trackingPresets.engineType")}</TableHead>
                            <TableHead>{t("settings:trackingPresets.configSummary")}</TableHead>
                            <TableHead>{t("settings:trackingPresets.usedBy")}</TableHead>
                            <TableHead>{t("common:created")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={7} />
                    </TableBody>
                </Table>
            ) : templates.length === 0 ? (
                <EmptyState
                    icon={Zap}
                    title={t("settings:trackingPresets.emptyTitle")}
                    description={t("settings:trackingPresets.emptyDesc")}
                    helpItems={[
                        { icon: Hash, text: t("settings:trackingPresets.counterHelp") },
                        { icon: ArrowLeftRight, text: t("settings:trackingPresets.converterHelp") },
                        { icon: Ruler, text: t("settings:trackingPresets.dimensionHelp") },
                        { icon: Layers, text: t("settings:trackingPresets.batchHelp") },
                    ]}
                    actionLabel={t("settings:trackingPresets.emptyAction")}
                    onAction={() => navigate("/settings/calculators/create")}
                />
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
                                        templates.filter((tpl: any) =>
                                            selection.selectedIds.has(tpl.id),
                                        ),
                                        CALCULATOR_EXPORT_COLUMNS,
                                        `${CALCULATOR_EXPORT_FILENAME}-selected.xlsx`,
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
                            <TableHead>{t("settings:trackingPresets.engineType")}</TableHead>
                            <TableHead>{t("settings:trackingPresets.configSummary")}</TableHead>
                            <TableHead>{t("settings:trackingPresets.usedBy")}</TableHead>
                            <TableHead>{t("common:created")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {templates.map((tmpl: any) => {
                            const variant = ENGINE_VARIANTS[tmpl.engine_type] ?? ("slate" as BadgeVariant);
                            const labelKey = ENGINE_LABEL_KEYS[tmpl.engine_type];
                            const engLabel = labelKey
                                ? t(`settings:trackingPresets.engineTypes.${labelKey}`)
                                : tmpl.engine_type;
                            const configKeys = Object.keys(tmpl.engine_config || {});
                            const summary = configKeys.length
                                ? configKeys.join(", ")
                                : t("settings:trackingPresets.configDefaults");

                            return (
                                <TableRow key={tmpl.id}>
                                    <TableCell
                                        className="w-10"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Checkbox
                                            aria-label={t("common:selectRow", { name: tmpl.name })}
                                            checked={selection.selectedIds.has(tmpl.id)}
                                            onChange={() => selection.toggleOne(tmpl.id)}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium text-zinc-200">
                                        {tmpl.name}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={variant}>
                                            {engLabel}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-zinc-500 font-mono">
                                        {summary}
                                    </TableCell>
                                    <TableCell>
                                        <PresetUsageCount presetId={tmpl.id} />
                                    </TableCell>
                                    <TableCell className="text-zinc-500">
                                        {tmpl.created_at
                                            ? new Date(tmpl.created_at).toLocaleDateString()
                                            : "—"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu
                                            trigger={
                                                <button className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" aria-label={t("common:moreActions")}>
                                                    <MoreVertical size={16} />
                                                </button>
                                            }
                                            align="end"
                                            items={[
                                                {
                                                    label: t("common:edit"),
                                                    icon: Edit2,
                                                    onClick: () =>
                                                        navigate(`/settings/calculators/edit/${tmpl.id}`),
                                                },
                                                { type: "divider" as const },
                                                {
                                                    label: t("common:delete"),
                                                    icon: Trash2,
                                                    danger: true,
                                                    onClick: async () => {
                                                        if (
                                                            await confirm({
                                                                title: t("settings:trackingPresets.deletePreset"),
                                                                message: t("settings:trackingPresets.deleteConfirm"),
                                                                variant: "danger",
                                                                confirmLabel: t("common:delete"),
                                                            })
                                                        ) {
                                                            deleteTemplate({
                                                                resource: "calculator-templates",
                                                                id: tmpl.id,
                                                            });
                                                        }
                                                    },
                                                },
                                            ]}
                                        />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
                </>
            )}

            <ConfirmDialog {...dialogProps} />
            <BulkDeleteModal
                open={bulkDeleteOpen}
                onClose={() => setBulkDeleteOpen(false)}
                items={selectedItems}
                onConfirm={async () => {
                    await bulkDelete({
                        url: `${API_URL}/api/v1/calculator-templates/bulk-delete/`,
                        method: "post",
                        values: {
                            ids: Array.from(selection.selectedIds),
                            force: true,
                        },
                        successNotification: () => ({
                            message: t("settings:trackingPresets.bulkDeleteSuccess", {
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
