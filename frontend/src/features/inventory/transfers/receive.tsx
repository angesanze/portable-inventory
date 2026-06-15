import { useMemo, useState } from "react";
import { useOne, useCustomMutation } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PackageCheck } from "lucide-react";
import { FormPage } from "../../../components/ui/FormPage";
import { FormSection } from "../../../components/ui/FormSection";
import { Input } from "../../../components/ui/Input";
import { Badge, type BadgeVariant } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/Toast";
import { ConfirmDialog, useConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import { API_URL } from "../../../config";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
    DRAFT: "neutral",
    IN_TRANSIT: "amber",
    PARTIALLY_RECEIVED: "cyan",
    RECEIVED: "emerald",
    CANCELLED: "red",
};

export const TransferOrderReceive = () => {
    const { t } = useTranslation(["transfers", "common"]);
    const navigate = useNavigate();
    const { id } = useParams();
    const { toast } = useToast();
    const { confirm, dialogProps } = useConfirmDialog();

    const { data, isLoading, refetch } = useOne({
        resource: "transfer-orders",
        id: id ?? "",
        queryOptions: { enabled: !!id },
    });
    const order = data?.data as any;

    const [quantities, setQuantities] = useState<Record<string, string>>({});

    const lines: any[] = order?.lines ?? [];
    const transitOf = (line: any) =>
        Number(line.quantity_sent) -
        Number(line.quantity_received) -
        Number(line.quantity_shortage);
    const openLines = lines.filter((l) => transitOf(l) > 0);
    const isReceivable =
        order && ["IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(order.status);

    const getQty = (lineId: string) => quantities[lineId] ?? "";
    const setQty = (lineId: string, value: string) =>
        setQuantities((prev) => ({ ...prev, [lineId]: value }));

    const { mutateAsync: postAction, isLoading: isSubmitting } = useCustomMutation();
    const [submitError, setSubmitError] = useState<unknown>(null);

    const activeReceipts = useMemo(
        () =>
            openLines
                .map((line) => ({ line, qty: getQty(line.id) }))
                .filter(({ qty }) => parseFloat(qty) > 0),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [openLines, quantities],
    );

    const submitDisabled = activeReceipts.length === 0;

    const handleReceive = async () => {
        setSubmitError(null);
        const payload = {
            receipts: activeReceipts.map(({ line, qty }) => ({
                line_id: line.id,
                quantity: qty,
            })),
        };
        try {
            await postAction({
                url: `${API_URL}/api/v1/transfer-orders/${id}/receive/`,
                method: "post",
                values: payload,
                successNotification: false,
                errorNotification: false,
            });
            toast({ message: t("receive.success"), variant: "success" });
            setQuantities({});
            refetch();
        } catch (err) {
            setSubmitError(err);
            toast({ message: t("receive.failed"), variant: "error" });
        }
    };

    const handleShortage = async (line: any) => {
        const residual = transitOf(line);
        if (
            !(await confirm({
                title: t("receive.shortageTitle"),
                message: t("receive.shortageMessage", {
                    qty: residual,
                    product: line.product_name,
                }),
                variant: "danger",
                confirmLabel: t("receive.shortageConfirm"),
            }))
        ) {
            return;
        }
        setSubmitError(null);
        try {
            await postAction({
                url: `${API_URL}/api/v1/transfer-orders/${id}/shortage/`,
                method: "post",
                values: { line_id: line.id, quantity: String(residual) },
                successNotification: false,
                errorNotification: false,
            });
            toast({ message: t("receive.shortageSuccess"), variant: "success" });
            refetch();
        } catch (err) {
            setSubmitError(err);
            toast({ message: t("receive.failed"), variant: "error" });
        }
    };

    if (isLoading || !order) {
        return <div className="p-12 text-center text-zinc-500">{t("common:loading")}</div>;
    }

    return (
        <FormPage
            title={t("receive.title", { number: order.number })}
            onSubmit={handleReceive}
            isLoading={isSubmitting}
            onCancel={() => navigate("/transfers")}
            submitLabel={t("receive.submit")}
            submitDisabled={submitDisabled || !isReceivable}
        >
            {!!submitError && (
                <FormErrorBanner title={t("receive.failed")} error={submitError} />
            )}

            <FormSection title={t("receive.orderSection")}>
                <div className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-zinc-200">{order.number}</span>
                    <span className="text-zinc-400">
                        {order.from_location_name} → {order.to_location_name}
                    </span>
                    <Badge variant={STATUS_VARIANTS[order.status] ?? "neutral"}>
                        {t(`status.${order.status}`, order.status)}
                    </Badge>
                </div>
                {!isReceivable && (
                    <p className="text-sm text-amber-400">{t("receive.notReceivable")}</p>
                )}
            </FormSection>

            {isReceivable && (
                <FormSection
                    title={t("receive.linesSection")}
                    description={t("receive.linesSectionDesc")}
                >
                    {openLines.length === 0 ? (
                        <div className="flex items-center gap-2 text-sm text-emerald-400">
                            <PackageCheck size={16} />
                            {t("receive.fullyReceived")}
                        </div>
                    ) : (
                        openLines.map((line) => {
                            const inTransit = transitOf(line);
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
                                            {t("receive.sent")}{" "}
                                            <span className="text-zinc-200">{Number(line.quantity_sent)}</span>
                                            {" · "}
                                            {t("receive.received")}{" "}
                                            <span className="text-zinc-200">{Number(line.quantity_received)}</span>
                                            {" · "}
                                            {t("receive.inTransit")}{" "}
                                            <span
                                                className="text-amber-300 font-medium"
                                                data-testid={`transit-${line.id}`}
                                            >
                                                {inTransit}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-end gap-3">
                                        <div className="flex-1">
                                            <Input
                                                label={t("receive.qtyToReceive")}
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={getQty(line.id)}
                                                onChange={(e) => setQty(line.id, e.target.value)}
                                                data-testid={`qty-${line.id}`}
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={() => handleShortage(line)}
                                            data-testid={`shortage-${line.id}`}
                                        >
                                            {t("receive.reportShortage")}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </FormSection>
            )}

            <ConfirmDialog {...dialogProps} />
        </FormPage>
    );
};
