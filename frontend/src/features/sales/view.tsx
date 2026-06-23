import { useEffect, useMemo, useState } from "react";
import { useList, useOne, useCustomMutation, useCustom } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    CheckCircle2,
    Truck,
    Printer,
    ArrowLeft,
    ClipboardList,
    ListChecks,
} from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Badge, type BadgeVariant } from "../../components/ui/Badge";
import { useToast } from "../../components/ui/Toast";
import { FormErrorBanner } from "../../components/ui/ErrorState";
import { API_URL } from "../../config";
import type {
    SalesOrderRecord,
    SalesLocationRow,
    PickList,
    PickListLine,
    ShipmentEntry,
} from "./types";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
    DRAFT: "neutral",
    CONFIRMED: "amber",
    PICKING: "cyan",
    PARTIALLY_SHIPPED: "cyan",
    SHIPPED: "emerald",
    CANCELLED: "red",
};

const SHIPPABLE = ["CONFIRMED", "PICKING", "PARTIALLY_SHIPPED"];

interface ShipDraft {
    quantity: string;
    batchId: string;
    serials: string;
}

const parseSerials = (raw: string): string[] =>
    raw.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean);

export const SalesOrderView = () => {
    const { t } = useTranslation(["sales", "common"]);
    const navigate = useNavigate();
    const { id } = useParams();
    const { toast } = useToast();

    const { data, isLoading, refetch } = useOne<SalesOrderRecord>({
        resource: "sales-orders",
        id: id ?? "",
        queryOptions: { enabled: !!id },
    });
    const so = data?.data;

    const { data: locationsData } = useList<SalesLocationRow>({
        resource: "locations",
        pagination: { mode: "off" },
    });
    const realLocations = (locationsData?.data || []).filter(
        (l) => l.type === "WAREHOUSE" || l.type === "STORE",
    );
    const locationOptions = realLocations.map((l) => ({
        value: l.id,
        label: l.name,
        description: l.type,
    }));

    const [tab, setTab] = useState<"overview" | "pick">("overview");
    const [locationId, setLocationId] = useState("");
    const [actionError, setActionError] = useState<unknown>(null);
    const [ships, setShips] = useState<Record<string, ShipDraft>>({});

    useEffect(() => {
        if (realLocations.length === 1 && !locationId) {
            setLocationId(String(realLocations[0].id));
        }
    }, [realLocations.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const status = so?.status ?? "";
    const isDraft = status === "DRAFT";
    const isShippable = SHIPPABLE.includes(status);

    // Pick list is fetched only once the order is reservable (CONFIRMED+).
    const { data: pickData, refetch: refetchPick } = useCustom<PickList>({
        url: `${API_URL}/api/v1/sales-orders/${id}/pick_list/`,
        method: "get",
        queryOptions: { enabled: !!id && !!so && !isDraft && status !== "CANCELLED" },
    });
    const pick = pickData?.data;
    const pickLines: PickListLine[] = pick?.lines ?? [];

    const { mutateAsync: postAction, isLoading: isActing } = useCustomMutation();

    const lines = so?.lines ?? [];

    const getShip = (lineId: string): ShipDraft =>
        ships[lineId] ?? { quantity: "", batchId: "", serials: "" };
    const updateShip = (lineId: string, patch: Partial<ShipDraft>) =>
        setShips((prev) => ({ ...prev, [lineId]: { ...getShip(lineId), ...patch } }));

    const pickByLine = useMemo(() => {
        const map: Record<string, PickListLine> = {};
        for (const p of pickLines) map[p.line_id] = p;
        return map;
    }, [pickLines]);

    const handleConfirm = async () => {
        setActionError(null);
        if (!locationId) {
            toast({ message: t("view.locationRequired"), variant: "error" });
            return;
        }
        try {
            await postAction({
                url: `${API_URL}/api/v1/sales-orders/${id}/confirm/`,
                method: "post",
                values: { location_id: locationId },
                successNotification: false,
                errorNotification: false,
            });
            toast({ message: t("view.confirmSuccess"), variant: "success" });
            refetch();
            refetchPick();
        } catch (err) {
            setActionError(err);
            toast({ message: t("view.confirmFailed"), variant: "error" });
        }
    };

    const activeShipments = useMemo(
        () =>
            lines
                .map((line) => ({ line, draft: getShip(line.id) }))
                .filter(({ draft }) => parseFloat(draft.quantity) > 0),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [lines, ships],
    );

    const handleShip = async () => {
        setActionError(null);
        if (activeShipments.length === 0) return;
        const shipments = activeShipments.map(({ line, draft }) => {
            const entry: ShipmentEntry = { line_id: line.id, quantity: draft.quantity };
            if (line.product_profile === "SERIALIZED") {
                const s = parseSerials(draft.serials);
                if (s.length) entry.serials = s;
            } else if (draft.batchId) {
                entry.batch_id = draft.batchId;
            }
            return entry;
        });
        try {
            await postAction({
                url: `${API_URL}/api/v1/sales-orders/${id}/ship/`,
                method: "post",
                values: { shipments },
                successNotification: false,
                errorNotification: false,
            });
            toast({ message: t("view.shipSuccess"), variant: "success" });
            setShips({});
            refetch();
            refetchPick();
        } catch (err) {
            setActionError(err);
            toast({ message: t("view.shipFailed"), variant: "error" });
        }
    };

    if (isLoading || !so) {
        return <div className="p-12 text-center text-zinc-500">{t("common:loading")}</div>;
    }

    const shipDisabled = activeShipments.length === 0 || isActing;

    return (
        <div className="sales-order-view">
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    .pick-print, .pick-print * { visibility: visible; }
                    .pick-print { position: absolute; left: 0; top: 0; width: 100%; }
                    .no-print { display: none !important; }
                }
            `}</style>

            <div className="flex items-center justify-between mb-5 no-print">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate("/sales")}
                        className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg"
                        aria-label={t("common:back")}
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-lg text-zinc-100">{so.number}</span>
                            <Badge variant={STATUS_VARIANTS[status] ?? "neutral"}>
                                {t(`status.${status}`, status)}
                            </Badge>
                        </div>
                        <div className="text-sm text-zinc-400">{so.customer_name}</div>
                    </div>
                </div>
                {isDraft && (
                    <Button variant="secondary" onClick={() => navigate(`/sales/edit/${so.id}`)}>
                        {t("common:edit")}
                    </Button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b border-white/[0.06] no-print">
                <button
                    className={`px-3 py-2 text-sm flex items-center gap-1.5 border-b-2 -mb-px ${
                        tab === "overview"
                            ? "border-emerald-400 text-zinc-100"
                            : "border-transparent text-zinc-400 hover:text-zinc-200"
                    }`}
                    onClick={() => setTab("overview")}
                    data-testid="tab-overview"
                >
                    <ListChecks size={15} />
                    {t("view.tabOverview")}
                </button>
                {!isDraft && status !== "CANCELLED" && (
                    <button
                        className={`px-3 py-2 text-sm flex items-center gap-1.5 border-b-2 -mb-px ${
                            tab === "pick"
                                ? "border-emerald-400 text-zinc-100"
                                : "border-transparent text-zinc-400 hover:text-zinc-200"
                        }`}
                        onClick={() => setTab("pick")}
                        data-testid="tab-pick"
                    >
                        <ClipboardList size={15} />
                        {t("view.tabPick")}
                    </button>
                )}
            </div>

            {!!actionError && (
                <div className="mb-4 no-print">
                    <FormErrorBanner title={t("view.actionFailed")} error={actionError} />
                </div>
            )}

            {tab === "overview" && (
                <div className="flex flex-col gap-4 no-print">
                    {/* Confirm panel (DRAFT only) */}
                    {isDraft && (
                        <Card>
                            <h3 className="text-sm font-medium text-zinc-200 mb-1">
                                {t("view.confirmTitle")}
                            </h3>
                            <p className="text-xs text-zinc-400 mb-3">{t("view.confirmDesc")}</p>
                            <Select
                                custom
                                label={t("view.location")}
                                value={locationId}
                                onChange={(val) => setLocationId(String(val))}
                                options={locationOptions}
                                placeholder={t("view.locationPlaceholder")}
                                required
                            />
                            <div className="mt-3">
                                <Button
                                    variant="primary"
                                    icon={CheckCircle2}
                                    disabled={!locationId || isActing}
                                    onClick={handleConfirm}
                                    data-testid="confirm-button"
                                >
                                    {t("view.confirmAction")}
                                </Button>
                            </div>
                        </Card>
                    )}

                    {/* Line states */}
                    <Card>
                        <h3 className="text-sm font-medium text-zinc-200 mb-3">
                            {t("view.linesTitle")}
                        </h3>
                        <div className="flex flex-col gap-2">
                            {lines.map((line) => {
                                const pl = pickByLine[line.id];
                                const reserved = pl ? Number(pl.reserved) : 0;
                                return (
                                    <div
                                        key={line.id}
                                        className="flex items-center justify-between gap-3 border border-white/[0.06] rounded-lg p-3"
                                        data-testid={`line-${line.id}`}
                                    >
                                        <div className="min-w-0">
                                            <div className="text-sm text-zinc-200 truncate">
                                                {line.product_name}
                                            </div>
                                            <div className="text-[11px] font-mono text-zinc-500">
                                                {line.product_sku}
                                            </div>
                                        </div>
                                        <div className="text-xs text-zinc-400 whitespace-nowrap flex gap-3">
                                            <span>
                                                {t("view.ordered")}{" "}
                                                <span className="text-zinc-200">
                                                    {Number(line.quantity_ordered)}
                                                </span>
                                            </span>
                                            <span>
                                                {t("view.reserved")}{" "}
                                                <span className="text-amber-300" data-testid={`reserved-${line.id}`}>
                                                    {reserved}
                                                </span>
                                            </span>
                                            <span>
                                                {t("view.shipped")}{" "}
                                                <span className="text-emerald-300" data-testid={`shipped-${line.id}`}>
                                                    {Number(line.quantity_shipped)}
                                                </span>
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>

                    {/* Ship panel */}
                    {isShippable && (
                        <Card>
                            <h3 className="text-sm font-medium text-zinc-200 mb-1">
                                {t("view.shipTitle")}
                            </h3>
                            <p className="text-xs text-zinc-400 mb-3">{t("view.shipDesc")}</p>
                            <div className="flex flex-col gap-3">
                                {lines
                                    .filter(
                                        (l) =>
                                            Number(l.quantity_ordered) - Number(l.quantity_shipped) > 0,
                                    )
                                    .map((line) => {
                                        const draft = getShip(line.id);
                                        const pending =
                                            Number(line.quantity_ordered) -
                                            Number(line.quantity_shipped);
                                        const pl = pickByLine[line.id];
                                        const isSerialized = line.product_profile === "SERIALIZED";
                                        const isBatch =
                                            line.product_profile === "BATCH_TRACKED" ||
                                            line.product_profile === "PERISHABLE";
                                        const batchOptions = (pl?.batches ?? []).map((b) => ({
                                            value: b.id,
                                            label: b.batch_identifier,
                                            description: b.expiry_date
                                                ? `${b.location ?? ""} · ${b.expiry_date}`
                                                : (b.location ?? undefined),
                                        }));
                                        return (
                                            <div
                                                key={line.id}
                                                className="border border-white/[0.06] rounded-lg p-3 flex flex-col gap-3"
                                                data-testid={`ship-line-${line.id}`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-sm text-zinc-200 truncate">
                                                        {line.product_name}
                                                    </span>
                                                    <span className="text-xs text-zinc-400 whitespace-nowrap">
                                                        {t("view.pending")}{" "}
                                                        <span
                                                            className="text-amber-300"
                                                            data-testid={`pending-${line.id}`}
                                                        >
                                                            {pending}
                                                        </span>
                                                    </span>
                                                </div>
                                                <Input
                                                    label={t("view.qtyToShip")}
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    value={draft.quantity}
                                                    onChange={(e) =>
                                                        updateShip(line.id, { quantity: e.target.value })
                                                    }
                                                    data-testid={`qty-${line.id}`}
                                                />
                                                {isBatch &&
                                                    parseFloat(draft.quantity) > 0 &&
                                                    batchOptions.length > 0 && (
                                                        <Select
                                                            custom
                                                            label={t("view.selectBatch")}
                                                            value={draft.batchId}
                                                            onChange={(val) =>
                                                                updateShip(line.id, {
                                                                    batchId: String(val),
                                                                })
                                                            }
                                                            options={batchOptions}
                                                            placeholder={t("view.batchPlaceholder")}
                                                        />
                                                    )}
                                                {isSerialized && parseFloat(draft.quantity) > 0 && (
                                                    <Input
                                                        label={t("view.serials")}
                                                        value={draft.serials}
                                                        onChange={(e) =>
                                                            updateShip(line.id, {
                                                                serials: e.target.value,
                                                            })
                                                        }
                                                        placeholder={t("view.serialsPlaceholder")}
                                                        helperText={t("view.serialsHelper")}
                                                        data-testid={`serials-${line.id}`}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                            <div className="mt-4">
                                <Button
                                    variant="primary"
                                    icon={Truck}
                                    disabled={shipDisabled}
                                    onClick={handleShip}
                                    data-testid="ship-button"
                                >
                                    {t("view.shipAction")}
                                </Button>
                            </div>
                        </Card>
                    )}
                </div>
            )}

            {tab === "pick" && (
                <div className="pick-print">
                    <div className="flex items-center justify-between mb-4 no-print">
                        <h3 className="text-sm font-medium text-zinc-200">
                            {t("view.pickListTitle")}
                        </h3>
                        <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
                            {t("view.print")}
                        </Button>
                    </div>
                    <div className="mb-3 text-sm">
                        <span className="font-mono">{so.number}</span> — {so.customer_name}
                    </div>
                    <div className="flex flex-col gap-3">
                        {pickLines.map((pl) => (
                            <Card key={pl.line_id} data-testid={`pick-line-${pl.line_id}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <div className="text-sm text-zinc-200">{pl.product_name}</div>
                                        <div className="text-[11px] font-mono text-zinc-500">
                                            {pl.product_sku}
                                        </div>
                                    </div>
                                    <div className="text-xs text-zinc-400">
                                        {t("view.pending")} {Number(pl.quantity_pending)}
                                    </div>
                                </div>
                                {(pl.serials?.length ?? 0) > 0 && (
                                    <div className="text-xs text-zinc-300">
                                        {t("view.serials")}:{" "}
                                        {pl.serials?.map((s) => s.identifier).join(", ")}
                                    </div>
                                )}
                                {(pl.batches?.length ?? 0) > 0 && (
                                    <ul className="text-xs text-zinc-300 list-disc pl-4">
                                        {pl.batches?.map((b) => (
                                            <li key={b.id}>
                                                {b.batch_identifier} — {Number(b.quantity)}
                                                {b.expiry_date ? ` · ${b.expiry_date}` : ""}
                                                {b.location ? ` · ${b.location}` : ""}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
