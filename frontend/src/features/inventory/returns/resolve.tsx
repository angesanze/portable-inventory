import { useMemo, useState } from "react";
import { useOne, useCustomMutation, useList } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PackageCheck } from "lucide-react";
import { FormPage } from "../../../components/ui/FormPage";
import { FormSection } from "../../../components/ui/FormSection";
import { Select } from "../../../components/ui/Select";
import { Badge, type BadgeVariant } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/Toast";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import { API_URL } from "../../../config";
import type {
    ResolveOrderRecord,
    ResolveLine,
    ResolveLocationRow,
    PartyOptionRow,
    ResolutionEntry,
} from "./types";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
    OPEN: "neutral",
    RECEIVED: "amber",
    RESOLVED: "emerald",
    CANCELLED: "red",
};

const RESOLUTIONS = ["RESTOCK", "SCRAP", "RETURN_TO_SUPPLIER"];

interface LineDraft {
    resolution: string;
    locationId: string;
    supplierId: string;
}

export const ReturnOrderResolve = () => {
    const { t } = useTranslation(["returns", "common"]);
    const navigate = useNavigate();
    const { id } = useParams();
    const { toast } = useToast();

    const { data, isLoading, refetch } = useOne<ResolveOrderRecord>({
        resource: "return-orders",
        id: id ?? "",
        queryOptions: { enabled: !!id },
    });
    const order = data?.data;

    const { data: locationsData } = useList<ResolveLocationRow>({
        resource: "locations",
        pagination: { mode: "off" },
    });
    const { data: suppliersData } = useList<PartyOptionRow>({
        resource: "suppliers",
        pagination: { mode: "off" },
    });
    const warehouseOptions = (locationsData?.data || [])
        .filter((l) => l.is_sellable && (l.type === "WAREHOUSE" || l.type === "STORE"))
        .map((l) => ({ value: l.id, label: l.name, description: l.type }));
    const supplierOptions = (suppliersData?.data || []).map((s) => ({
        value: s.id,
        label: s.name,
    }));

    const lines: ResolveLine[] = order?.lines ?? [];
    const pendingLines = lines.filter((l) => l.resolution === "PENDING");
    const isReceived = order && order.status === "RECEIVED";

    const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
    const getDraft = (lineId: string): LineDraft =>
        drafts[lineId] ?? { resolution: "", locationId: "", supplierId: "" };
    const setDraft = (lineId: string, patch: Partial<LineDraft>) =>
        setDrafts((prev) => ({
            ...prev,
            [lineId]: { ...getDraft(lineId), ...patch },
        }));

    const { mutateAsync: postAction, isLoading: isSubmitting } = useCustomMutation();
    const [submitError, setSubmitError] = useState<unknown>(null);

    const activeResolutions = useMemo(
        () =>
            pendingLines
                .map((line) => ({ line, draft: getDraft(line.id) }))
                .filter(({ draft }) => RESOLUTIONS.includes(draft.resolution)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [pendingLines, drafts],
    );

    const submitDisabled = activeResolutions.length === 0;

    const handleResolve = async () => {
        setSubmitError(null);
        const payload = {
            resolutions: activeResolutions.map(({ line, draft }) => {
                const entry: ResolutionEntry = { line_id: line.id, resolution: draft.resolution };
                if (draft.resolution === "RESTOCK" && draft.locationId) {
                    entry.location_id = draft.locationId;
                }
                if (draft.resolution === "RETURN_TO_SUPPLIER" && draft.supplierId) {
                    entry.supplier_id = draft.supplierId;
                }
                return entry;
            }),
        };
        try {
            await postAction({
                url: `${API_URL}/api/v1/return-orders/${id}/resolve/`,
                method: "post",
                values: payload,
                successNotification: false,
                errorNotification: false,
            });
            toast({ message: t("resolve.success"), variant: "success" });
            setDrafts({});
            refetch();
        } catch (err) {
            setSubmitError(err);
            toast({ message: t("resolve.failed"), variant: "error" });
        }
    };

    const handleReceive = async () => {
        setSubmitError(null);
        try {
            await postAction({
                url: `${API_URL}/api/v1/return-orders/${id}/receive/`,
                method: "post",
                values: {},
                successNotification: false,
                errorNotification: false,
            });
            toast({ message: t("receiveSuccess"), variant: "success" });
            refetch();
        } catch (err) {
            setSubmitError(err);
            toast({ message: t("actionFailed"), variant: "error" });
        }
    };

    if (isLoading || !order) {
        return <div className="p-12 text-center text-zinc-500">{t("common:loading")}</div>;
    }

    const isCustomer = order.kind === "CUSTOMER_RETURN";
    const party = isCustomer ? order.customer_name : order.supplier_name;

    return (
        <FormPage
            title={t("resolve.title", { number: order.number })}
            onSubmit={handleResolve}
            isLoading={isSubmitting}
            onCancel={() => navigate("/returns")}
            submitLabel={t("resolve.submit")}
            submitDisabled={submitDisabled || !isReceived}
        >
            {!!submitError && (
                <FormErrorBanner title={t("resolve.failed")} error={submitError} />
            )}

            <FormSection title={t("resolve.orderSection")}>
                <div className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-zinc-200">{order.number}</span>
                    <Badge variant={isCustomer ? "cyan" : "amber"}>
                        {t(`kind.${order.kind}`, String(order.kind))}
                    </Badge>
                    <span className="text-zinc-400">{party}</span>
                    <Badge variant={STATUS_VARIANTS[order.status] ?? "neutral"}>
                        {t(`status.${order.status}`, String(order.status))}
                    </Badge>
                </div>
                {order.status === "OPEN" && isCustomer && (
                    <div className="flex items-center gap-3">
                        <p className="text-sm text-amber-400">{t("resolve.notReceived")}</p>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={handleReceive}
                            data-testid="receive-into-quarantine"
                        >
                            {t("resolve.receiveFirst")}
                        </Button>
                    </div>
                )}
            </FormSection>

            {isReceived && (
                <FormSection
                    title={t("resolve.linesSection")}
                    description={t("resolve.linesSectionDesc")}
                >
                    {pendingLines.length === 0 ? (
                        <div className="flex items-center gap-2 text-sm text-emerald-400">
                            <PackageCheck size={16} />
                            {t("resolve.allResolved")}
                        </div>
                    ) : (
                        pendingLines.map((line) => {
                            const draft = getDraft(line.id);
                            return (
                                <div
                                    key={line.id}
                                    className="border border-white/[0.06] rounded-lg p-4 flex flex-col gap-3"
                                    data-testid={`resolve-line-${line.id}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium text-zinc-200 truncate">
                                                {line.product_name}
                                            </div>
                                            <div className="text-[11px] font-mono text-zinc-500">
                                                {line.product_sku}
                                                {line.physical_identifier
                                                    ? ` · ${line.physical_identifier}`
                                                    : ""}
                                            </div>
                                        </div>
                                        <span className="text-xs text-zinc-400 whitespace-nowrap">
                                            {Number(line.quantity)}
                                        </span>
                                    </div>

                                    <Select
                                        custom
                                        label={t("resolve.resolution")}
                                        value={draft.resolution}
                                        onChange={(val) =>
                                            setDraft(line.id, { resolution: String(val) })
                                        }
                                        options={RESOLUTIONS.map((r) => ({
                                            value: r,
                                            label: t(`resolutionLabel.${r}`),
                                        }))}
                                        placeholder={t("resolve.resolutionPlaceholder")}
                                    />

                                    {draft.resolution === "RESTOCK" && (
                                        <Select
                                            custom
                                            label={t("resolve.destination")}
                                            value={draft.locationId}
                                            onChange={(val) =>
                                                setDraft(line.id, { locationId: String(val) })
                                            }
                                            options={warehouseOptions}
                                            placeholder={t("resolve.destinationPlaceholder")}
                                        />
                                    )}

                                    {draft.resolution === "RETURN_TO_SUPPLIER" && (
                                        <Select
                                            custom
                                            label={t("resolve.supplier")}
                                            value={draft.supplierId}
                                            onChange={(val) =>
                                                setDraft(line.id, { supplierId: String(val) })
                                            }
                                            options={supplierOptions}
                                            placeholder={t("resolve.supplierPlaceholder")}
                                        />
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
