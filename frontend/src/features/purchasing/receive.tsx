import { useEffect, useMemo, useState } from "react";
import { useList, useOne, useCustomMutation } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PackageCheck } from "lucide-react";
import { FormPage } from "../../components/ui/FormPage";
import { FormSection } from "../../components/ui/FormSection";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Badge, type BadgeVariant } from "../../components/ui/Badge";
import { useToast } from "../../components/ui/Toast";
import { FormErrorBanner } from "../../components/ui/ErrorState";
import { API_URL } from "../../config";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
    DRAFT: "neutral",
    CONFIRMED: "amber",
    PARTIALLY_RECEIVED: "cyan",
    RECEIVED: "emerald",
    CANCELLED: "red",
};

const BATCH_PROFILES = ["BATCH_TRACKED", "PERISHABLE"];

interface ReceiptDraft {
    quantity: string;
    batchIdentifier: string;
    lotNumber: string;
    expiryDate: string;
    serials: string;
}

const emptyReceipt = (): ReceiptDraft => ({
    quantity: "",
    batchIdentifier: "",
    lotNumber: "",
    expiryDate: "",
    serials: "",
});

const parseSerials = (raw: string): string[] =>
    raw
        .split(/[,\n;]/)
        .map((s) => s.trim())
        .filter(Boolean);

export const PurchaseOrderReceive = () => {
    const { t } = useTranslation(["purchasing", "common"]);
    const navigate = useNavigate();
    const { id } = useParams();
    const { toast } = useToast();

    const { data, isLoading, refetch } = useOne({
        resource: "purchase-orders",
        id: id ?? "",
        queryOptions: { enabled: !!id },
    });
    const po = data?.data as any;

    const { data: locationsData } = useList({
        resource: "locations",
        pagination: { mode: "off" },
    });
    const realLocations = (locationsData?.data || []).filter(
        (l: any) => l.type === "WAREHOUSE" || l.type === "STORE",
    );
    const locationOptions = realLocations.map((l: any) => ({
        value: l.id,
        label: l.name,
        description: l.type,
    }));

    const [locationId, setLocationId] = useState("");
    const [receipts, setReceipts] = useState<Record<string, ReceiptDraft>>({});

    // Auto-select when only one real location exists
    useEffect(() => {
        if (realLocations.length === 1 && !locationId) {
            setLocationId(String(realLocations[0].id));
        }
    }, [realLocations.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const lines: any[] = po?.lines ?? [];
    const pendingOf = (line: any) =>
        Number(line.quantity_ordered) - Number(line.quantity_received);
    const receivableLines = lines.filter((l) => pendingOf(l) > 0);
    const isReceivable = po && ["CONFIRMED", "PARTIALLY_RECEIVED"].includes(po.status);

    const getReceipt = (lineId: string): ReceiptDraft =>
        receipts[lineId] ?? emptyReceipt();
    const updateReceipt = (lineId: string, patch: Partial<ReceiptDraft>) => {
        setReceipts((prev) => ({
            ...prev,
            [lineId]: { ...getReceipt(lineId), ...patch },
        }));
    };

    const { mutateAsync: postReceive, isLoading: isSubmitting } = useCustomMutation();
    const [submitError, setSubmitError] = useState<unknown>(null);

    // Lines with a quantity entered, validated client-side for serials count
    const activeReceipts = useMemo(
        () =>
            receivableLines
                .map((line) => ({ line, draft: getReceipt(line.id) }))
                .filter(({ draft }) => parseFloat(draft.quantity) > 0),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [receivableLines, receipts],
    );

    const serialsMismatch = activeReceipts.some(({ line, draft }) => {
        if (line.product_profile !== "SERIALIZED") return false;
        return parseSerials(draft.serials).length !== parseFloat(draft.quantity);
    });

    const submitDisabled =
        !locationId || activeReceipts.length === 0 || serialsMismatch;

    const handleSubmit = async () => {
        setSubmitError(null);
        const payload = {
            location_id: locationId,
            receipts: activeReceipts.map(({ line, draft }) => {
                const entry: any = {
                    line_id: line.id,
                    quantity: draft.quantity,
                };
                if (line.product_profile === "SERIALIZED") {
                    entry.serials = parseSerials(draft.serials);
                } else if (BATCH_PROFILES.includes(line.product_profile)) {
                    const batchData: Record<string, string> = {};
                    if (draft.batchIdentifier) batchData.batch_identifier = draft.batchIdentifier;
                    if (draft.lotNumber) batchData.lot_number = draft.lotNumber;
                    if (Object.keys(batchData).length > 0) entry.batch_data = batchData;
                    if (draft.expiryDate) entry.expiry_date = draft.expiryDate;
                }
                return entry;
            }),
        };
        try {
            await postReceive({
                url: `${API_URL}/api/v1/purchase-orders/${id}/receive/`,
                method: "post",
                values: payload,
                successNotification: false,
                errorNotification: false,
            });
            toast({ message: t("receive.success"), variant: "success" });
            setReceipts({});
            refetch();
        } catch (err) {
            setSubmitError(err);
            toast({ message: t("receive.failed"), variant: "error" });
        }
    };

    if (isLoading || !po) {
        return <div className="p-12 text-center text-zinc-500">{t("common:loading")}</div>;
    }

    return (
        <FormPage
            title={t("receive.title", { number: po.number })}
            onSubmit={handleSubmit}
            isLoading={isSubmitting}
            onCancel={() => navigate("/purchasing")}
            submitLabel={t("receive.submit")}
            submitDisabled={submitDisabled || !isReceivable}
        >
            {!!submitError && (
                <FormErrorBanner title={t("receive.failed")} error={submitError} />
            )}

            <FormSection title={t("receive.orderSection")}>
                <div className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-zinc-200">{po.number}</span>
                    <span className="text-zinc-400">{po.supplier_name}</span>
                    <Badge variant={STATUS_VARIANTS[po.status] ?? "neutral"}>
                        {t(`status.${po.status}`, po.status)}
                    </Badge>
                </div>
                {!isReceivable && (
                    <p className="text-sm text-amber-400">{t("receive.notReceivable")}</p>
                )}
            </FormSection>

            {isReceivable && (
                <FormSection
                    title={t("receive.destinationSection")}
                    description={t("receive.destinationSectionDesc")}
                >
                    <Select
                        custom
                        label={t("receive.location")}
                        value={locationId}
                        onChange={(val) => setLocationId(String(val))}
                        options={locationOptions}
                        placeholder={t("receive.locationPlaceholder")}
                        required
                    />
                </FormSection>
            )}

            {isReceivable && (
                <FormSection
                    title={t("receive.linesSection")}
                    description={t("receive.linesSectionDesc")}
                >
                    {receivableLines.length === 0 ? (
                        <div className="flex items-center gap-2 text-sm text-emerald-400">
                            <PackageCheck size={16} />
                            {t("receive.fullyReceived")}
                        </div>
                    ) : (
                        receivableLines.map((line) => {
                            const draft = getReceipt(line.id);
                            const pending = pendingOf(line);
                            const isSerialized = line.product_profile === "SERIALIZED";
                            const isBatch = BATCH_PROFILES.includes(line.product_profile);
                            const serialCount = parseSerials(draft.serials).length;
                            const qty = parseFloat(draft.quantity);
                            const showSerialMismatch =
                                isSerialized && qty > 0 && serialCount !== qty;
                            return (
                                <div
                                    key={line.id}
                                    className="border border-white/[0.06] rounded-lg p-4 flex flex-col gap-3"
                                    data-testid={`receive-line-${line.id}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium text-zinc-200 truncate">
                                                {line.product_name}
                                            </div>
                                            <div className="text-[11px] font-mono text-zinc-500">
                                                {line.product_sku}
                                            </div>
                                        </div>
                                        <div className="text-xs text-zinc-400 whitespace-nowrap">
                                            {t("receive.ordered")}{" "}
                                            <span className="text-zinc-200">{Number(line.quantity_ordered)}</span>
                                            {" · "}
                                            {t("receive.received")}{" "}
                                            <span className="text-zinc-200">{Number(line.quantity_received)}</span>
                                            {" · "}
                                            {t("receive.pending")}{" "}
                                            <span className="text-amber-300 font-medium" data-testid={`pending-${line.id}`}>
                                                {pending}
                                            </span>
                                        </div>
                                    </div>

                                    <Input
                                        label={t("receive.qtyToReceive")}
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={draft.quantity}
                                        onChange={(e) =>
                                            updateReceipt(line.id, { quantity: e.target.value })
                                        }
                                        data-testid={`qty-${line.id}`}
                                    />

                                    {isBatch && qty > 0 && (
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <Input
                                                label={t("receive.batchIdentifier")}
                                                value={draft.batchIdentifier}
                                                onChange={(e) =>
                                                    updateReceipt(line.id, { batchIdentifier: e.target.value })
                                                }
                                                placeholder={t("receive.batchIdentifierPlaceholder")}
                                            />
                                            <Input
                                                label={t("receive.lotNumber")}
                                                value={draft.lotNumber}
                                                onChange={(e) =>
                                                    updateReceipt(line.id, { lotNumber: e.target.value })
                                                }
                                            />
                                            <Input
                                                label={t("receive.expiryDate")}
                                                type="date"
                                                value={draft.expiryDate}
                                                onChange={(e) =>
                                                    updateReceipt(line.id, { expiryDate: e.target.value })
                                                }
                                            />
                                        </div>
                                    )}

                                    {isSerialized && qty > 0 && (
                                        <div>
                                            <Input
                                                label={t("receive.serials")}
                                                value={draft.serials}
                                                onChange={(e) =>
                                                    updateReceipt(line.id, { serials: e.target.value })
                                                }
                                                placeholder={t("receive.serialsPlaceholder")}
                                                helperText={t("receive.serialsHelper")}
                                                data-testid={`serials-${line.id}`}
                                            />
                                            {showSerialMismatch && (
                                                <p className="mt-1 text-xs text-amber-400">
                                                    {t("receive.serialsMismatch")}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </FormSection>
            )}
        </FormPage>
    );
};
