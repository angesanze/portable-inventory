import { useList, useDelete, useUpdate, useApiUrl } from "@refinedev/core";
import { Trash2, RefreshCw, Copy, AlertTriangle, Plus, MoreVertical, KeyRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ApiKeyCreateModal } from "./ApiKeyCreateModal";
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
import { DropdownMenu } from "../../../components/ui/DropdownMenu";
import { ConfirmDialog, useConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { SkeletonRow } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { useToast } from "../../../components/ui/Toast";
import type { ApiKey } from "./types";

const PERMISSION_LABEL_KEYS: Record<string, string> = {
    read: "read",
    write: "write",
    delete: "delete",
    manage_qr: "qr",
    scan: "scan",
};

const TIER_VARIANTS: Record<string, BadgeVariant> = {
    free: "slate",
    standard: "amber",
    premium: "indigo",
};

function formatRelativeDate(dateStr: string | null, t: TFunction): string {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return t("common:justNow");
    if (diffMins < 60) return t("common:minutesAgo", { count: diffMins });
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return t("common:hoursAgo", { count: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return t("common:daysAgo", { count: diffDays });
    return date.toLocaleDateString();
}

function isExpiringSoon(dateStr: string | null): boolean {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    const daysUntil = (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysUntil > 0 && daysUntil <= 7;
}

function isExpired(dateStr: string | null): boolean {
    if (!dateStr) return false;
    return new Date(dateStr) <= new Date();
}

export const ApiKeyList = () => {
    const { t } = useTranslation(["settings", "common"]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [rotatedKey, setRotatedKey] = useState<{ id: string; key: string } | null>(null);
    const apiUrl = useApiUrl();

    const { data: listData, isLoading, isError, refetch } = useList<ApiKey>({
        resource: "api-keys",
    });

    const { mutate: deleteKey } = useDelete();
    const { mutate: updateKey, isLoading: isUpdating } = useUpdate();
    const { confirm, dialogProps } = useConfirmDialog();
    const { toast } = useToast();

    const keys = Array.isArray(listData?.data) ? listData.data : [];

    const handleRotate = async (keyId: string, label: string) => {
        if (!await confirm({ title: t("settings:apiKeys.rotateKey"), message: t("settings:apiKeys.rotateMessage", { label }), variant: "danger", confirmLabel: t("settings:apiKeys.rotateAction") })) return;
        try {
            const response = await fetch(`${apiUrl}/api-keys/${keyId}/rotate/`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("access_token")}`,
                    "Content-Type": "application/json",
                },
            });
            if (!response.ok) throw new Error("Rotation failed");
            const data = await response.json();
            setRotatedKey({ id: data.id, key: data.key });
            refetch();
        } catch (error) {
            console.error(error);
            toast({ message: t("settings:apiKeys.rotateFailed"), variant: "error" });
        }
    };

    const handleRevoke = async (keyId: string, label: string) => {
        if (!await confirm({ title: t("settings:apiKeys.revokeKey"), message: t("settings:apiKeys.revokeMessage", { label }), variant: "danger", confirmLabel: t("settings:apiKeys.revokeAction") })) return;
        deleteKey(
            { resource: "api-keys", id: keyId },
            { onSuccess: () => refetch() }
        );
    };

    return (
        <div>
            <PageHeader
                title={t("settings:apiKeys.listTitle")}
                subtitle={t("settings:apiKeys.subtitle")}
                count={keys.length}
                actions={
                    <Button variant="primary" icon={Plus} onClick={() => setIsModalOpen(true)}>
                        {t("settings:apiKeys.generateKey")}
                    </Button>
                }
            />

            <ApiKeyCreateModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={() => refetch()}
            />

            {rotatedKey && (
                <Card className="mb-4 border-amber-500/30">
                    <div className="space-y-2">
                        <p className="text-amber-400 font-bold text-sm">{t("settings:apiKeys.newKeyGenerated")}</p>
                        <div className="flex items-center gap-3">
                            <code className="flex-1 text-amber-400 font-mono text-sm break-all bg-zinc-950 px-3 py-2 rounded-lg border border-white/[0.06]">
                                {rotatedKey.key}
                            </code>
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={Copy}
                                onClick={() => {
                                    navigator.clipboard.writeText(rotatedKey.key);
                                    toast({ message: t("settings:apiKeys.copied"), variant: "success" });
                                }}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-red-400 font-bold uppercase">{t("settings:apiKeys.keyNotShownAgain")}</p>
                            <button onClick={() => setRotatedKey(null)} className="text-xs text-zinc-500 hover:text-white transition-colors">
                                {t("settings:apiKeys.dismiss")}
                            </button>
                        </div>
                    </div>
                </Card>
            )}

            {isError ? (
                <ErrorState
                    title={t("settings:apiKeys.errorTitle")}
                    message={t("settings:apiKeys.errorMessage")}
                    onRetry={refetch}
                />
            ) : isLoading ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("settings:apiKeys.label")}</TableHead>
                            <TableHead>{t("settings:apiKeys.permissions")}</TableHead>
                            <TableHead>{t("settings:apiKeys.tier")}</TableHead>
                            <TableHead>{t("settings:apiKeys.expires")}</TableHead>
                            <TableHead>{t("settings:apiKeys.lastUsed")}</TableHead>
                            <TableHead>{t("settings:apiKeys.usage")}</TableHead>
                            <TableHead>{t("common:status")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={8} />
                    </TableBody>
                </Table>
            ) : keys.length === 0 ? (
                <EmptyState
                    icon={KeyRound}
                    title={t("settings:apiKeys.emptyTitle")}
                    description={t("settings:apiKeys.emptyDesc")}
                    actionLabel={t("settings:apiKeys.generateKey")}
                    onAction={() => setIsModalOpen(true)}
                />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("settings:apiKeys.label")}</TableHead>
                            <TableHead>{t("settings:apiKeys.permissions")}</TableHead>
                            <TableHead>{t("settings:apiKeys.tier")}</TableHead>
                            <TableHead>{t("settings:apiKeys.expires")}</TableHead>
                            <TableHead>{t("settings:apiKeys.lastUsed")}</TableHead>
                            <TableHead>{t("settings:apiKeys.usage")}</TableHead>
                            <TableHead>{t("common:status")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {keys.map((key) => {
                            const expired = isExpired(key.expires_at);
                            const expiringSoon = isExpiringSoon(key.expires_at);

                            return (
                                <TableRow key={key.id} className={expired ? "opacity-60" : ""}>
                                    <TableCell>
                                        <div className="font-medium text-zinc-200">{key.label || t("settings:apiKeys.unnamedKey")}</div>
                                        <div className="text-zinc-600 font-mono text-xs mt-0.5">
                                            {key.key_hint || "****"}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {key.permissions && Object.entries(key.permissions)
                                                .filter(([, v]) => v)
                                                .map(([k]) => (
                                                    <Badge key={k} variant="cyan">
                                                        {PERMISSION_LABEL_KEYS[k] ? t(`settings:apiKeys.permissionLabels.${PERMISSION_LABEL_KEYS[k]}`) : k}
                                                    </Badge>
                                                ))
                                            }
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={TIER_VARIANTS[key.rate_limit_tier] || "slate"}>
                                            {TIER_VARIANTS[key.rate_limit_tier] ? t(`settings:apiKeys.tiers.${key.rate_limit_tier}`) : key.rate_limit_tier}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {!key.expires_at ? (
                                            <span className="text-zinc-600">{t("settings:apiKeys.never")}</span>
                                        ) : expired ? (
                                            <span className="text-red-400 flex items-center gap-1">
                                                <AlertTriangle size={12} />
                                                {t("settings:apiKeys.expired")}
                                            </span>
                                        ) : expiringSoon ? (
                                            <span className="text-amber-400 flex items-center gap-1">
                                                <AlertTriangle size={12} />
                                                {new Date(key.expires_at).toLocaleDateString()}
                                            </span>
                                        ) : (
                                            <span className="text-zinc-400">
                                                {new Date(key.expires_at).toLocaleDateString()}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-zinc-500">
                                        {formatRelativeDate(key.last_used_at, t)}
                                    </TableCell>
                                    <TableCell className="text-zinc-400 font-mono">
                                        {(key.usage_count ?? 0).toLocaleString()}
                                    </TableCell>
                                    <TableCell>
                                        <button
                                            onClick={() => updateKey({
                                                resource: "api-keys",
                                                id: key.id,
                                                values: { is_active: !key.is_active }
                                            })}
                                            disabled={isUpdating}
                                            aria-label={key.is_active ? t("settings:apiKeys.ariaDeactivate") : t("settings:apiKeys.ariaActivate")}
                                        >
                                            <Badge
                                                variant={key.is_active ? "emerald" : "rose"}
                                                dot
                                                className="cursor-pointer hover:opacity-80 transition-opacity"
                                            >
                                                {key.is_active ? t("settings:apiKeys.active") : t("settings:apiKeys.blocked")}
                                            </Badge>
                                        </button>
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
                                                    label: t("settings:apiKeys.rotateKey"),
                                                    icon: RefreshCw,
                                                    onClick: () => handleRotate(key.id, key.label),
                                                },
                                                { type: "divider" as const },
                                                {
                                                    label: t("settings:apiKeys.revokeKey"),
                                                    icon: Trash2,
                                                    danger: true,
                                                    onClick: () => handleRevoke(key.id, key.label),
                                                },
                                            ]}
                                        />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            )}

            <ConfirmDialog {...dialogProps} />
        </div>
    );
};
