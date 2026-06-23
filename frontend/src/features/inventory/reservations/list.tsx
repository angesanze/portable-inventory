import { useState, useCallback, useMemo } from "react";
import { useList, useCustomMutation } from "@refinedev/core";
import type { CrudFilters } from "@refinedev/core";
import { Plus, Bookmark, ChevronLeft, ChevronRight } from "lucide-react";
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
import { ConfirmDialog, useConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { SkeletonRow } from "../../../components/ui/Skeleton";
import { EmptyState, FilteredEmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { useToast } from "../../../components/ui/Toast";
import { API_URL } from "../../../config";
import { CreateReservationModal } from "./CreateReservationModal";

const PAGE_SIZE = 20;

export type ReservationStatus = "ACTIVE" | "CONSUMED" | "RELEASED" | "EXPIRED";

export interface ReservationRow {
    id: string;
    quantity: string | number;
    status: ReservationStatus;
    reference: string;
    expires_at: string | null;
    created_at: string;
    product_sku: string;
    product_name: string;
    location_name: string | null;
    batch_identifier: string | null;
    physical_identifier: string | null;
}

function statusVariant(status: ReservationStatus): BadgeVariant {
    switch (status) {
        case "ACTIVE": return "emerald";
        case "CONSUMED": return "cyan";
        case "RELEASED": return "neutral";
        case "EXPIRED": return "rose";
        default: return "neutral";
    }
}

function statusLabel(status: ReservationStatus, t: TFunction): string {
    switch (status) {
        case "ACTIVE": return t("reservations.statusActive");
        case "CONSUMED": return t("reservations.statusConsumed");
        case "RELEASED": return t("reservations.statusReleased");
        case "EXPIRED": return t("reservations.statusExpired");
        default: return status;
    }
}

function statusOptions(t: TFunction) {
    return [
        { label: t("reservations.statusActive"), value: "ACTIVE" },
        { label: t("reservations.statusConsumed"), value: "CONSUMED" },
        { label: t("reservations.statusReleased"), value: "RELEASED" },
        { label: t("reservations.statusExpired"), value: "EXPIRED" },
    ];
}

export const ReservationList = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const { toast } = useToast();
    const { confirm, dialogProps } = useConfirmDialog();

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [createOpen, setCreateOpen] = useState(false);

    // Any filter change must reset to page 1 — the old page may not exist
    // in the narrowed result set.
    const updateSearch = useCallback((value: string) => {
        setSearch(value);
        setPage(1);
    }, []);
    const updateStatus = useCallback((value: string) => {
        setStatus(value);
        setPage(1);
    }, []);

    const crudFilters: CrudFilters = useMemo(() => {
        const result: CrudFilters = [];
        if (search) {
            result.push({ field: "search", operator: "contains", value: search });
        }
        if (status) {
            result.push({ field: "status", operator: "eq", value: status });
        }
        return result;
    }, [search, status]);

    const { data: listData, isLoading, isError, refetch } = useList<ReservationRow>({
        resource: "reservations",
        filters: crudFilters,
        pagination: { current: page, pageSize: PAGE_SIZE },
    });

    const reservations: ReservationRow[] = Array.isArray(listData?.data)
        ? listData.data
        : [];
    const total: number = listData?.total ?? reservations.length;
    const hasPrevious = page > 1;
    const hasNext = page * PAGE_SIZE < total;

    const { mutateAsync: releaseReservation } = useCustomMutation();

    const handleRelease = async (reservation: ReservationRow) => {
        const confirmed = await confirm({
            title: t("reservations.releaseTitle"),
            message: t("reservations.releaseConfirm", {
                name: reservation.product_name,
            }),
            confirmLabel: t("reservations.release"),
            variant: "danger",
        });
        if (!confirmed) return;
        try {
            await releaseReservation({
                url: `${API_URL}/api/v1/reservations/${reservation.id}/release/`,
                method: "post",
                values: {},
                successNotification: false,
                errorNotification: false,
            });
            toast({
                message: t("reservations.releaseSuccess"),
                variant: "success",
            });
            refetch();
        } catch {
            toast({
                message: t("reservations.releaseError"),
                variant: "error",
            });
        }
    };

    const filterConfigs: FilterConfig[] = [
        {
            key: "search",
            label: t("reservations.searchLabel"),
            type: "text",
            placeholder: t("reservations.searchPlaceholder"),
            value: search,
            onChange: updateSearch,
        },
        {
            key: "status",
            label: t("common:status"),
            type: "select",
            options: statusOptions(t),
            value: status,
            onChange: updateStatus,
        },
    ];

    const hasActiveFilters = !!(search || status);

    const columnHeaders = (
        <TableRow>
            <TableHead>{t("reservations.product")}</TableHead>
            <TableHead className="text-right">{t("reservations.quantity")}</TableHead>
            <TableHead>{t("reservations.location")}</TableHead>
            <TableHead>{t("reservations.reference")}</TableHead>
            <TableHead>{t("reservations.expiresAt")}</TableHead>
            <TableHead>{t("common:status")}</TableHead>
            <TableHead>{t("reservations.createdAt")}</TableHead>
            <TableHead className="text-right">{t("common:actions")}</TableHead>
        </TableRow>
    );

    return (
        <div>
            <PageHeader
                title={t("reservations.title")}
                subtitle={t("reservations.subtitle")}
                count={total}
                actions={
                    <Button
                        variant="primary"
                        icon={Plus}
                        onClick={() => setCreateOpen(true)}
                    >
                        {t("reservations.newReservation")}
                    </Button>
                }
            />

            <FilterBar filters={filterConfigs} className="mb-4" />

            {isError ? (
                <ErrorState
                    title={t("reservations.failedToLoad")}
                    message={t("reservations.failedToLoadDesc")}
                    onRetry={refetch}
                />
            ) : isLoading ? (
                <Table>
                    <TableHeader>{columnHeaders}</TableHeader>
                    <TableBody>
                        <SkeletonRow columns={8} />
                    </TableBody>
                </Table>
            ) : reservations.length === 0 ? (
                hasActiveFilters ? (
                    <FilteredEmptyState />
                ) : (
                    <EmptyState
                        icon={Bookmark}
                        title={t("reservations.emptyTitle")}
                        description={t("reservations.emptyDesc")}
                        actionLabel={t("reservations.newReservation")}
                        onAction={() => setCreateOpen(true)}
                    />
                )
            ) : (
                <>
                    <Table>
                        <TableHeader>{columnHeaders}</TableHeader>
                        <TableBody>
                            {reservations.map((r) => (
                                <TableRow key={r.id}>
                                    <TableCell className="font-medium text-zinc-200">
                                        <div>{r.product_name}</div>
                                        <div className="text-xs text-zinc-500 font-mono">
                                            {r.product_sku}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-semibold text-zinc-200">
                                        {Number(r.quantity).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-zinc-400">
                                        {r.location_name || t("reservations.anyLocation")}
                                        {r.physical_identifier && (
                                            <div className="text-xs text-zinc-500 font-mono">
                                                {r.physical_identifier}
                                            </div>
                                        )}
                                        {r.batch_identifier && (
                                            <div className="text-xs text-zinc-500 font-mono">
                                                {r.batch_identifier}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                        {r.reference || "—"}
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm whitespace-nowrap">
                                        {r.expires_at
                                            ? new Date(r.expires_at).toLocaleString()
                                            : "—"}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={statusVariant(r.status)} dot>
                                            {statusLabel(r.status, t)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm whitespace-nowrap">
                                        {r.created_at
                                            ? new Date(r.created_at).toLocaleString()
                                            : "—"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {r.status === "ACTIVE" && (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => handleRelease(r)}
                                                data-testid={`release-${r.id}`}
                                            >
                                                {t("reservations.release")}
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    {/* Server-side pagination footer */}
                    {(hasNext || hasPrevious) && (
                        <div className="flex items-center justify-between px-1 py-3">
                            <span className="text-xs text-zinc-500 tabular-nums">
                                {t("reservations.totalCount", { count: total })}
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={ChevronLeft}
                                    disabled={!hasPrevious}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                >
                                    {t("reservations.prev")}
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={ChevronRight}
                                    disabled={!hasNext}
                                    onClick={() => setPage((p) => p + 1)}
                                >
                                    {t("reservations.next")}
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}

            <ConfirmDialog {...dialogProps} />
            <CreateReservationModal
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={() => refetch()}
            />
        </div>
    );
};
