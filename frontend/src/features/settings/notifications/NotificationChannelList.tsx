import { useState } from "react";
import { useApiUrl, useDelete, useList, useUpdate } from "@refinedev/core";
import { useTranslation } from "react-i18next";
import { Bell, Mail, Pencil, Plus, Send, Trash2, Webhook } from "lucide-react";

import { PageHeader } from "../../../components/ui/PageHeader";
import { Card } from "../../../components/ui/Card";
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
import { ConfirmDialog, useConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { SkeletonRow } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { useToast } from "../../../components/ui/Toast";
import { ChannelFormModal } from "./ChannelFormModal";
import type { NotificationChannel, NotificationDelivery } from "./types";

const STATUS_VARIANTS: Record<NotificationDelivery["status"], BadgeVariant> = {
    SENT: "emerald",
    PENDING: "amber",
    FAILED: "rose",
};

export const NotificationChannelList = () => {
    const { t } = useTranslation(["settings", "common"]);
    const apiUrl = useApiUrl();
    const { toast } = useToast();
    const { confirm, dialogProps } = useConfirmDialog();

    const [modalOpen, setModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<NotificationChannel | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);

    const {
        data: channelData,
        isLoading,
        isError,
        refetch,
    } = useList({ resource: "notification-channels" }) as any;

    const { data: deliveryData, refetch: refetchDeliveries } = useList({
        resource: "notification-deliveries",
        pagination: { current: 1, pageSize: 20 },
    }) as any;

    const { mutate: updateChannel, isLoading: isUpdating } = useUpdate();
    const { mutate: deleteChannel } = useDelete();

    const channels: NotificationChannel[] = Array.isArray(channelData?.data) ? channelData.data : [];
    const deliveries: NotificationDelivery[] = Array.isArray(deliveryData?.data) ? deliveryData.data : [];

    const openCreate = () => {
        setEditTarget(null);
        setModalOpen(true);
    };

    const openEdit = (channel: NotificationChannel) => {
        setEditTarget(channel);
        setModalOpen(true);
    };

    const handleDelete = async (channel: NotificationChannel) => {
        const ok = await confirm({
            title: t("settings:notifications.deleteChannel"),
            message: t("settings:notifications.deleteMessage", { name: channel.name }),
            variant: "danger",
            confirmLabel: t("settings:notifications.deleteAction"),
        });
        if (!ok) return;
        deleteChannel(
            { resource: "notification-channels", id: channel.id },
            { onSuccess: () => refetch() },
        );
    };

    const handleSendTest = async (channel: NotificationChannel) => {
        setTestingId(channel.id);
        try {
            const response = await fetch(`${apiUrl}/notification-channels/${channel.id}/test/`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("access_token")}`,
                    "Content-Type": "application/json",
                },
            });
            const body = await response.json().catch(() => ({}));
            if (response.ok && body.success) {
                toast({ message: t("settings:notifications.testOk"), variant: "success" });
            } else {
                toast({
                    message: t("settings:notifications.testFailed", { error: body.error ?? response.status }),
                    variant: "error",
                });
            }
        } catch (error) {
            toast({
                message: t("settings:notifications.testFailed", { error: String(error) }),
                variant: "error",
            });
        } finally {
            setTestingId(null);
        }
    };

    const destinationOf = (channel: NotificationChannel) =>
        channel.kind === "EMAIL" ? channel.recipients : channel.url;

    return (
        <div>
            <PageHeader
                title={t("settings:notifications.listTitle")}
                subtitle={t("settings:notifications.subtitle")}
                count={channels.length}
                actions={
                    <Button variant="primary" icon={Plus} onClick={openCreate}>
                        {t("settings:notifications.addChannel")}
                    </Button>
                }
            />

            <ChannelFormModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={() => refetch()}
                channel={editTarget}
            />

            {isError ? (
                <ErrorState
                    title={t("settings:notifications.errorTitle")}
                    message={t("settings:notifications.errorMessage")}
                    onRetry={refetch}
                />
            ) : isLoading ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("settings:notifications.name")}</TableHead>
                            <TableHead>{t("settings:notifications.kind")}</TableHead>
                            <TableHead>{t("settings:notifications.destination")}</TableHead>
                            <TableHead>{t("common:status")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={5} />
                    </TableBody>
                </Table>
            ) : channels.length === 0 ? (
                <EmptyState
                    icon={Bell}
                    title={t("settings:notifications.emptyTitle")}
                    description={t("settings:notifications.emptyDesc")}
                    actionLabel={t("settings:notifications.addChannel")}
                    onAction={openCreate}
                />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("settings:notifications.name")}</TableHead>
                            <TableHead>{t("settings:notifications.kind")}</TableHead>
                            <TableHead>{t("settings:notifications.destination")}</TableHead>
                            <TableHead>{t("common:status")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {channels.map((channel) => (
                            <TableRow key={channel.id}>
                                <TableCell>
                                    <div className="font-medium text-zinc-200">{channel.name}</div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={channel.kind === "EMAIL" ? "indigo" : "cyan"}>
                                        <span className="inline-flex items-center gap-1">
                                            {channel.kind === "EMAIL" ? <Mail size={12} /> : <Webhook size={12} />}
                                            {channel.kind === "EMAIL"
                                                ? t("settings:notifications.kindEmail")
                                                : t("settings:notifications.kindWebhook")}
                                        </span>
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <span className="text-zinc-400 text-xs break-all">{destinationOf(channel)}</span>
                                </TableCell>
                                <TableCell>
                                    <button
                                        onClick={() =>
                                            updateChannel(
                                                {
                                                    resource: "notification-channels",
                                                    id: channel.id,
                                                    values: { is_active: !channel.is_active },
                                                },
                                                { onSuccess: () => refetch() },
                                            )
                                        }
                                        disabled={isUpdating}
                                        aria-label={
                                            channel.is_active
                                                ? t("settings:notifications.ariaDeactivate")
                                                : t("settings:notifications.ariaActivate")
                                        }
                                    >
                                        <Badge
                                            variant={channel.is_active ? "emerald" : "rose"}
                                            dot
                                            className="cursor-pointer hover:opacity-80 transition-opacity"
                                        >
                                            {channel.is_active
                                                ? t("settings:notifications.active")
                                                : t("settings:notifications.inactive")}
                                        </Badge>
                                    </button>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="inline-flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            icon={Send}
                                            disabled={testingId === channel.id}
                                            onClick={() => handleSendTest(channel)}
                                            data-testid={`send-test-${channel.id}`}
                                        >
                                            {t("settings:notifications.sendTest")}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            icon={Pencil}
                                            onClick={() => openEdit(channel)}
                                            aria-label={t("settings:notifications.editChannel")}
                                        />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            icon={Trash2}
                                            onClick={() => handleDelete(channel)}
                                            aria-label={t("settings:notifications.deleteChannel")}
                                        />
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            {/* Recent deliveries */}
            <Card className="mt-6">
                <h3 className="text-sm font-bold text-zinc-200 mb-3">
                    {t("settings:notifications.deliveriesTitle")}
                </h3>
                {deliveries.length === 0 ? (
                    <p className="text-sm text-zinc-500">{t("settings:notifications.deliveriesEmpty")}</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("settings:notifications.colWhen")}</TableHead>
                                <TableHead>{t("settings:notifications.colChannel")}</TableHead>
                                <TableHead>{t("settings:notifications.colEvent")}</TableHead>
                                <TableHead>{t("settings:notifications.colStatus")}</TableHead>
                                <TableHead>{t("settings:notifications.colAttempts")}</TableHead>
                                <TableHead>{t("settings:notifications.colError")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {deliveries.map((delivery) => (
                                <TableRow key={delivery.id}>
                                    <TableCell className="text-zinc-500 whitespace-nowrap">
                                        {new Date(delivery.created_at).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-zinc-300">{delivery.channel_name}</TableCell>
                                    <TableCell>
                                        <span className="text-zinc-400 text-xs">{delivery.event_message}</span>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={STATUS_VARIANTS[delivery.status] ?? "slate"} dot>
                                            {t(`settings:notifications.status${delivery.status}`)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-zinc-400 font-mono">{delivery.attempts}</TableCell>
                                    <TableCell>
                                        <span className="text-xs text-red-400/80 break-all">
                                            {delivery.last_error || "—"}
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
                {deliveries.length > 0 && (
                    <div className="mt-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => refetchDeliveries()}>
                            {t("common:refresh", { defaultValue: "Refresh" })}
                        </Button>
                    </div>
                )}
            </Card>

            <ConfirmDialog {...dialogProps} />
        </div>
    );
};
