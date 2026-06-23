import { useList } from "@refinedev/core";
import { useEffect, useState } from "react";
import { useCapabilities } from "../../../hooks/useCapabilities";
import { useDefaultApiKey } from "../../../hooks/useDefaultApiKey";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { QRCodeSVG } from 'qrcode.react';
import { Eye, Settings, Lock, Unlock, Trash2, MoreVertical, QrCode } from "lucide-react";
import { useQRActions } from './useQRActions';
import type { QRCode, QRProductModel, QRApiKey, QRLocation, QRBatch, QRWorkOrder } from './types';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from '../../../components/ui/Table';
import { Badge } from '../../../components/ui/Badge';
import type { BadgeVariant } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Select, type SelectOption } from '../../../components/ui/Select';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { ConfirmDialog, useConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';

function statusVariant(status: string): BadgeVariant {
    switch (status) {
        case 'VIRGIN': return 'slate';
        case 'CONFIGURED': return 'emerald';
        case 'LOCKED': return 'rose';
        default: return 'neutral';
    }
}

function statusLabel(status: string, t: TFunction): string {
    switch (status) {
        case 'VIRGIN': return t("settings:qrCodes.notConfigured");
        case 'CONFIGURED': return t("settings:qrCodes.configured");
        case 'LOCKED': return t("settings:qrCodes.locked");
        default: return status;
    }
}

export const QRCodeList = () => {
    const { t } = useTranslation(["settings", "common"]);
    const { data, isLoading, isError, refetch } = useList<QRCode>({ resource: "qr-codes" });

    const { confirm, dialogProps } = useConfirmDialog();
    const {
        generating,
        handleGenerateBatch,
        handleLock,
        handleUnlock,
        handleConfigure,
        handleDelete
    } = useQRActions(refetch);

    const { data: productsData } = useList<QRProductModel>({ resource: "product-models" });
    const products = Array.isArray(productsData?.data) ? productsData.data : [];

    // Developers manage multiple keys via the dropdown; managers own a single
    // hidden key fetched read-only (no `GET /api-keys`, which would 403 for
    // them — see DUAL-TIER-09).
    const { capabilities } = useCapabilities();
    const canManageKeys = capabilities.manage_api_keys;

    const { data: apiKeysData } = useList<QRApiKey>({
        resource: "api-keys",
        queryOptions: { enabled: canManageKeys },
    });
    const apiKeys = Array.isArray(apiKeysData?.data) ? apiKeysData.data : [];

    const { apiKey: defaultKey } = useDefaultApiKey(!canManageKeys);

    const { data: locationsData } = useList<QRLocation>({ resource: "locations", pagination: { mode: 'off' } });
    const locations = Array.isArray(locationsData?.data) ? locationsData.data : [];

    const [generateCount, setGenerateCount] = useState(5);
    const [labelPrefix, setLabelPrefix] = useState("");
    const [selectedApiKey, setSelectedApiKey] = useState("");
    const [selectedLocation, setSelectedLocation] = useState("");

    // Managers have no dropdown — transparently use their single default key.
    useEffect(() => {
        if (!canManageKeys && defaultKey) {
            // Sync the async-loaded default key into selection for manager users;
            // converges once `defaultKey` resolves.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelectedApiKey(String(defaultKey.id));
        }
    }, [canManageKeys, defaultKey]);

    const [showQR, setShowQR] = useState<QRCode | null>(null);
    const [configuring, setConfiguring] = useState<QRCode | null>(null);
    const [configProduct, setConfigProduct] = useState("");
    const [configBatch, setConfigBatch] = useState("");
    const [configWorkOrder, setConfigWorkOrder] = useState("");

    const qrCodes = Array.isArray(data?.data) ? data.data : [];

    const { data: batchesData } = useList<QRBatch>({
        resource: "batches",
        queryOptions: { enabled: !!configProduct },
        filters: [{ field: "product_model", operator: "eq", value: configProduct }]
    });
    const batches = Array.isArray(batchesData?.data) ? batchesData.data : [];

    const { data: workOrdersData } = useList<QRWorkOrder>({
        resource: "work-orders",
        queryOptions: { enabled: !!configProduct },
        filters: [{ field: "product_model", operator: "eq", value: configProduct }]
    });
    const workOrders = Array.isArray(workOrdersData?.data) ? workOrdersData.data : [];

    const apiKeyOptions: SelectOption[] = apiKeys.map((k) => ({
        value: String(k.id),
        label: k.label,
    }));

    const locationOptions: SelectOption[] = [
        { value: "", label: t("settings:qrCodes.noneOption") },
        ...locations.map((l) => ({
            value: String(l.id),
            label: `${l.name} [${l.type}]`,
        })),
    ];

    const productOptions: SelectOption[] = [
        { value: "", label: t("settings:qrCodes.notAssigned") },
        ...products.map((p) => {
            let typeLabel = "";
            if (p.profile === 'ASSEMBLED' || (p.components && p.components.length > 0)) typeLabel = t("settings:qrCodes.typeKit");
            else if (p.profile === 'BATCH_TRACKED' || p.profile === 'PERISHABLE') typeLabel = t("settings:qrCodes.typeBatch");
            return {
                value: String(p.id),
                label: `${p.name} (${p.sku})${typeLabel}`,
            };
        }),
    ];

    const batchOptions: SelectOption[] = [
        { value: "", label: t("settings:qrCodes.noneOption") },
        ...batches.map((b) => ({
            value: String(b.id),
            label: `${t("settings:qrCodes.batchItemPrefix")} ${b.batch_identifier || b.identifier || t("settings:qrCodes.untitled")}`,
        })),
    ];

    const workOrderOptions: SelectOption[] = [
        { value: "", label: t("settings:qrCodes.genericProduct") },
        ...workOrders.map((wo) => ({
            value: String(wo.id),
            label: `${t("settings:qrCodes.batchPrefix")} ${wo.name}`,
        })),
    ];

    const onConfigureSubmit = () => {
        handleConfigure(configuring, configProduct, configBatch, configWorkOrder, () => {
            setConfiguring(null);
            setConfigProduct("");
            setConfigBatch("");
            setConfigWorkOrder("");
        });
    };

    return (
        <div>
            <PageHeader
                title={t("settings:qrCodes.title")}
                subtitle={t("settings:qrCodes.subtitle")}
                count={qrCodes.length}
            />

            {/* Generate Section */}
            <Card className="mb-4">
                <h2 className="text-base font-semibold text-zinc-50 mb-4">{t("settings:qrCodes.generateTitle")}</h2>
                <div className="flex items-end gap-4 flex-wrap">
                    {canManageKeys && (
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">{t("settings:qrCodes.apiKeyLabel")} *</label>
                            <Select
                                custom
                                className="w-48"
                                value={selectedApiKey}
                                onChange={val => setSelectedApiKey(String(val))}
                                placeholder={t("settings:qrCodes.selectApiKeyOption")}
                                options={apiKeyOptions}
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">{t("settings:qrCodes.contextLocation")}</label>
                        <Select
                            custom
                            className="w-48"
                            value={selectedLocation}
                            onChange={val => setSelectedLocation(String(val))}
                            placeholder={t("settings:qrCodes.noneOption")}
                            options={locationOptions}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">{t("settings:qrCodes.count")}</label>
                        <input
                            type="number"
                            min={1}
                            max={100}
                            value={generateCount}
                            onChange={e => setGenerateCount(parseInt(e.target.value) || 1)}
                            className="w-24 bg-zinc-950 border border-white/[0.06] rounded-lg px-3 py-2 text-zinc-50 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                        />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">{t("settings:qrCodes.labelPrefix")}</label>
                        <input
                            type="text"
                            value={labelPrefix}
                            onChange={e => setLabelPrefix(e.target.value)}
                            placeholder={t("settings:qrCodes.labelPrefixPlaceholder")}
                            className="w-full bg-zinc-950 border border-white/[0.06] rounded-lg px-3 py-2 text-zinc-50 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                        />
                    </div>
                    <Button
                        variant="primary"
                        onClick={() => handleGenerateBatch(selectedApiKey, generateCount, labelPrefix, selectedLocation)}
                        disabled={generating || !selectedApiKey}
                        loading={generating}
                    >
                        {t("settings:qrCodes.generateButton", { count: generateCount })}
                    </Button>
                </div>
                {canManageKeys && !selectedApiKey && apiKeys.length > 0 && (
                    <p className="text-amber-400 text-xs mt-2">{t("settings:qrCodes.selectApiKeyWarning")}</p>
                )}
                {canManageKeys && apiKeys.length === 0 && (
                    <p className="text-red-400 text-xs mt-2">{t("settings:qrCodes.noApiKeys")}</p>
                )}
            </Card>

            {/* QR List */}
            {isError ? (
                <ErrorState
                    title={t("settings:qrCodes.errorTitle")}
                    message={t("settings:qrCodes.errorMessage")}
                    onRetry={refetch}
                />
            ) : isLoading ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("settings:qrCodes.codeHeader")}</TableHead>
                            <TableHead>{t("settings:qrCodes.labelHeader")}</TableHead>
                            <TableHead>{t("settings:qrCodes.targetHeader")}</TableHead>
                            <TableHead>{t("common:status")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={5} />
                    </TableBody>
                </Table>
            ) : qrCodes.length === 0 ? (
                <EmptyState
                    icon={QrCode}
                    title={t("settings:qrCodes.emptyTitle")}
                    description={t("settings:qrCodes.emptyDesc")}
                />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("settings:qrCodes.codeHeader")}</TableHead>
                            <TableHead>{t("settings:qrCodes.labelHeader")}</TableHead>
                            <TableHead>{t("settings:qrCodes.targetHeader")}</TableHead>
                            <TableHead>{t("common:status")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {qrCodes.map((qr) => (
                            <TableRow key={qr.id}>
                                <TableCell className="font-mono font-medium text-zinc-200">
                                    {qr.code}
                                </TableCell>
                                <TableCell className="text-zinc-400">
                                    {qr.label || <span className="text-zinc-600">—</span>}
                                </TableCell>
                                <TableCell className="text-zinc-400">
                                    {qr.target_display}
                                </TableCell>
                                <TableCell>
                                    <Badge variant={statusVariant(qr.status)} dot>
                                        {statusLabel(qr.status, t)}
                                    </Badge>
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
                                                label: t("settings:qrCodes.showQr"),
                                                icon: Eye,
                                                onClick: () => setShowQR(qr),
                                            },
                                            ...(qr.status !== 'LOCKED' ? [{
                                                label: t("settings:qrCodes.configure"),
                                                icon: Settings,
                                                onClick: () => {
                                                    setConfiguring(qr);
                                                    setConfigProduct(qr.product_model || "");
                                                    setConfigBatch(qr.batch || "");
                                                    setConfigWorkOrder(qr.work_order || "");
                                                },
                                            }] : []),
                                            ...(qr.status === 'CONFIGURED' ? [{
                                                label: t("settings:qrCodes.lock"),
                                                icon: Lock,
                                                onClick: () => handleLock(qr),
                                            }] : []),
                                            ...(qr.status === 'LOCKED' ? [{
                                                label: t("settings:qrCodes.unlock"),
                                                icon: Unlock,
                                                onClick: () => handleUnlock(qr),
                                            }] : []),
                                            ...(qr.status !== 'LOCKED' ? [
                                                { type: "divider" as const },
                                                {
                                                    label: t("common:delete"),
                                                    icon: Trash2,
                                                    danger: true,
                                                    onClick: () => handleDelete(qr, () => confirm({
                                                        title: t("settings:qrCodes.deleteTitle"),
                                                        message: t("settings:qrCodes.deleteConfirm"),
                                                        variant: "danger",
                                                        confirmLabel: t("settings:qrCodes.deleteAction"),
                                                    })),
                                                },
                                            ] : []),
                                        ]}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            {/* Show QR Modal */}
            {showQR && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowQR(null)}>
                    <Card padding="none" className="p-8 max-w-sm w-full flex flex-col items-center flex-none" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-semibold text-zinc-50 mb-2">{t("settings:qrCodes.showTitle", { code: showQR.code })}</h3>
                        <p className="text-zinc-400 text-sm mb-6 text-center">{showQR.target_display}</p>
                        <div className="bg-white p-4 rounded-xl mb-4">
                            <QRCodeSVG value={showQR.qr_url} size={200} />
                        </div>
                        <div className="text-xs text-zinc-500 font-mono mb-4 break-all text-center">{showQR.qr_url}</div>
                        <Button variant="secondary" onClick={() => setShowQR(null)}>
                            {t("common:close")}
                        </Button>
                    </Card>
                </div>
            )}

            {/* Configure Modal */}
            {configuring && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setConfiguring(null)}>
                    <Card className="max-w-md w-full flex-none" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-semibold text-zinc-50 mb-6">{t("settings:qrCodes.configureTitle", { code: configuring.code })}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">
                                    {t("settings:qrCodes.linkProduct")}
                                    <span className="text-indigo-400 ml-1 normal-case">{t("settings:qrCodes.linkProductHint")}</span>
                                </label>
                                <Select
                                    custom
                                    value={configProduct}
                                    onChange={val => setConfigProduct(String(val))}
                                    placeholder={t("settings:qrCodes.notAssigned")}
                                    options={productOptions}
                                />
                            </div>

                            {batches.length > 0 && (
                                <div className="p-3 border border-indigo-500/20 rounded-lg bg-indigo-500/5">
                                    <label className="block text-xs font-medium text-indigo-300 uppercase tracking-wider mb-1">
                                        {t("settings:qrCodes.linkBatch")}
                                    </label>
                                    <p className="text-[10px] text-zinc-500 mb-2">
                                        {t("settings:qrCodes.linkBatchHint")}
                                    </p>
                                    <Select
                                        custom
                                        value={configBatch}
                                        onChange={val => setConfigBatch(String(val))}
                                        placeholder={t("settings:qrCodes.noneOption")}
                                        options={batchOptions}
                                    />
                                </div>
                            )}

                            {workOrders.length > 0 && (
                                <div className="p-3 border border-indigo-500/20 rounded-lg bg-indigo-500/5">
                                    <label className="block text-xs font-medium text-indigo-300 uppercase tracking-wider mb-1">
                                        {t("settings:qrCodes.linkWorkOrder")}
                                    </label>
                                    <p className="text-[10px] text-zinc-500 mb-2">
                                        {t("settings:qrCodes.linkWorkOrderHint")}
                                    </p>
                                    <Select
                                        custom
                                        value={configWorkOrder}
                                        onChange={val => setConfigWorkOrder(String(val))}
                                        placeholder={t("settings:qrCodes.genericProduct")}
                                        options={workOrderOptions}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <Button variant="ghost" onClick={() => setConfiguring(null)}>
                                {t("common:cancel")}
                            </Button>
                            <Button variant="primary" onClick={onConfigureSubmit}>
                                {t("common:save")}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            <ConfirmDialog {...dialogProps} />
        </div>
    );
};
