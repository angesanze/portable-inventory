import React from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowLeft, Package, MapPin, Hash, Layers, ArrowUpCircle, ArrowDownCircle, ArrowRightLeft, Play, CheckCircle2, Scan, Tag } from "lucide-react";
import { PROFILE_METADATA } from "../../../types/api";
import type { QRScanResult } from "./QRScanner";

export type OperationType =
    | "add"
    | "subtract"
    | "transfer"
    | "allocate"
    | "deallocate"
    | "transfer_batch"
    | "start_work_order"
    | "complete_work_order"
    | "check_in"
    | "check_out";

interface ScanResultProps {
    scanResult: QRScanResult;
    onSelectOperation: (operation: OperationType) => void;
    onBack: () => void;
}

interface OperationButton {
    operation: OperationType;
    label: string;
    sublabel: string;
    icon: React.ReactNode;
    variant: "primary" | "secondary" | "danger";
}

function getOperationsForProfile(profile?: string, engineType?: string, t?: TFunction): OperationButton[] {
    // Resolve translated label; falls back to the key when no translator is supplied
    // (e.g. standalone unit-test calls that only inspect `.operation`).
    const tr = (key: string): string => (t ? t(key) : key);

    // Profile-first dispatch
    const key = profile || engineType?.toUpperCase() || "";

    if (key === "BATCH_TRACKED" || key === "BUCKET" || key === "bucket") {
        return [
            { operation: "allocate", label: tr("result.ops.allocate"), sublabel: tr("result.ops.allocateDesc"), icon: <ArrowUpCircle className="w-6 h-6" />, variant: "primary" },
            { operation: "deallocate", label: tr("result.ops.deallocate"), sublabel: tr("result.ops.deallocateDesc"), icon: <ArrowDownCircle className="w-6 h-6" />, variant: "secondary" },
            { operation: "transfer_batch", label: tr("result.ops.transferBatch"), sublabel: tr("result.ops.transferBatchDesc"), icon: <ArrowRightLeft className="w-6 h-6" />, variant: "secondary" },
        ];
    }

    if (key === "PERISHABLE" || key === "TIME_BASED" || key === "time_based") {
        return [
            { operation: "add", label: tr("result.ops.addExpiry"), sublabel: tr("result.ops.addExpiryDesc"), icon: <ArrowUpCircle className="w-6 h-6" />, variant: "primary" },
            { operation: "subtract", label: tr("result.ops.subtract"), sublabel: tr("result.ops.subtractDesc"), icon: <ArrowDownCircle className="w-6 h-6" />, variant: "secondary" },
            { operation: "transfer", label: tr("result.ops.transfer"), sublabel: tr("result.ops.transferDesc"), icon: <ArrowRightLeft className="w-6 h-6" />, variant: "secondary" },
        ];
    }

    if (key === "ASSEMBLED" || key === "ASSEMBLY" || key === "batch_manager" || key === "BATCH_MANAGER") {
        return [
            { operation: "start_work_order", label: tr("result.ops.startWorkOrder"), sublabel: tr("result.ops.startWorkOrderDesc"), icon: <Play className="w-6 h-6" />, variant: "primary" },
            { operation: "complete_work_order", label: tr("result.ops.completeWorkOrder"), sublabel: tr("result.ops.completeWorkOrderDesc"), icon: <CheckCircle2 className="w-6 h-6" />, variant: "primary" },
        ];
    }

    if (key === "SERIALIZED" || key === "TRACKER" || key === "tracker" || key === "INDIVIDUAL") {
        return [
            { operation: "check_in", label: tr("result.ops.checkIn"), sublabel: tr("result.ops.checkInDesc"), icon: <ArrowUpCircle className="w-6 h-6" />, variant: "primary" },
            { operation: "check_out", label: tr("result.ops.checkOut"), sublabel: tr("result.ops.checkOutDesc"), icon: <ArrowDownCircle className="w-6 h-6" />, variant: "secondary" },
            { operation: "transfer", label: tr("result.ops.transferItem"), sublabel: tr("result.ops.transferItemDesc"), icon: <ArrowRightLeft className="w-6 h-6" />, variant: "secondary" },
        ];
    }

    if (key === "DIMENSIONAL" || key === "DIMENSION" || key === "dimension") {
        return [
            { operation: "add", label: tr("result.ops.addMeasured"), sublabel: tr("result.ops.addMeasuredDesc"), icon: <ArrowUpCircle className="w-6 h-6" />, variant: "primary" },
            { operation: "subtract", label: tr("result.ops.subtractMeasured"), sublabel: tr("result.ops.subtractMeasuredDesc"), icon: <ArrowDownCircle className="w-6 h-6" />, variant: "secondary" },
            { operation: "transfer", label: tr("result.ops.transfer"), sublabel: tr("result.ops.transferDesc"), icon: <ArrowRightLeft className="w-6 h-6" />, variant: "secondary" },
        ];
    }

    // SIMPLE_COUNT / UNIT_CONVERSION / counter / converter / default
    return [
        { operation: "add", label: tr("result.ops.add"), sublabel: tr("result.ops.addDesc"), icon: <ArrowUpCircle className="w-6 h-6" />, variant: "primary" },
        { operation: "subtract", label: tr("result.ops.subtractCount"), sublabel: tr("result.ops.subtractCountDesc"), icon: <ArrowDownCircle className="w-6 h-6" />, variant: "secondary" },
        { operation: "transfer", label: tr("result.ops.transfer"), sublabel: tr("result.ops.transferDesc"), icon: <ArrowRightLeft className="w-6 h-6" />, variant: "secondary" },
    ];
}

const variantStyles: Record<string, string> = {
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg",
    secondary: "bg-white border-2 border-slate-200 hover:border-indigo-300 text-slate-700 shadow-sm",
    danger: "bg-white border-2 border-red-200 hover:border-red-400 text-red-600 shadow-sm",
};

function profileLabel(profile?: string, engineType?: string): string {
    if (profile && profile in PROFILE_METADATA) {
        return PROFILE_METADATA[profile as keyof typeof PROFILE_METADATA].label;
    }
    // Legacy fallback
    const type = engineType?.toUpperCase() || "";
    const labels: Record<string, string> = {
        BUCKET: "Batch Tracked",
        BATCH_MANAGER: "Assembled",
        CONVERTER: "Unit Conversion",
        TRACKER: "Serialized",
        DIMENSION: "Dimensional",
        TIME_BASED: "Perishable",
    };
    return labels[type] || "Simple Count";
}

export const ScanResult: React.FC<ScanResultProps> = ({ scanResult, onSelectOperation, onBack }) => {
    const { t } = useTranslation("widget");
    const operations = getOperationsForProfile(scanResult.profile, scanResult.engineType, t);
    const engine = profileLabel(scanResult.profile, scanResult.engineType);

    return (
        <div className="flex flex-col h-full" data-testid="scan-result">
            {/* Header */}
            <div
                className="text-white p-4"
                style={{
                    background: "linear-gradient(to right, var(--pi-primary, #4f46e5), color-mix(in srgb, var(--pi-primary, #4f46e5), #7c3aed 50%))",
                }}
            >
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-lg hover:bg-white/20 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                        aria-label={t("result.aria.backToScanner")}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="text-xs uppercase tracking-widest opacity-75">{t("result.scanned")}</div>
                        <h2 className="text-lg font-bold">{t("result.selectOperation")}</h2>
                    </div>
                </div>
            </div>

            {/* Product Info Card */}
            <div className="p-4 flex-1 overflow-y-auto">
                <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm">
                    <div className="flex items-start gap-3 mb-3">
                        <div className="p-2 bg-indigo-50 rounded-lg">
                            <Package className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-slate-900 text-lg truncate" data-testid="product-name">
                                {scanResult.productName || t("result.unknownProduct")}
                            </h3>
                            {scanResult.productSku && (
                                <span className="text-sm font-mono text-slate-500">{scanResult.productSku}</span>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-3">
                        {scanResult.quantity !== undefined && (
                            <div className="flex items-center gap-2 text-sm">
                                <Hash className="w-4 h-4 text-slate-400" />
                                <span className="text-slate-500">{t("result.stock")}</span>
                                <span className="font-bold text-indigo-600">{scanResult.quantity}</span>
                            </div>
                        )}
                        {scanResult.locationName && (
                            <div className="flex items-center gap-2 text-sm">
                                <MapPin className="w-4 h-4 text-slate-400" />
                                <span className="text-slate-500 truncate">{scanResult.locationName}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2 text-sm">
                            <Layers className="w-4 h-4 text-slate-400" />
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase bg-indigo-50 text-indigo-700">
                                {engine}
                            </span>
                        </div>
                        {scanResult.identifier && (
                            <div className="flex items-center gap-2 text-sm">
                                <Tag className="w-4 h-4 text-slate-400" />
                                <span className="font-mono text-slate-600 truncate">{scanResult.identifier}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Operation Buttons */}
                <div className="space-y-3" data-testid="operation-buttons">
                    {operations.map((op) => (
                        <button
                            key={op.operation}
                            onClick={() => onSelectOperation(op.operation)}
                            className={`w-full p-4 rounded-xl font-bold flex items-center gap-4 transition-colors duration-150 min-h-[56px] ${variantStyles[op.variant]}`}
                            aria-label={op.label}
                            data-testid={`operation-${op.operation}`}
                        >
                            {op.icon}
                            <div className="text-left">
                                <div className="text-sm uppercase tracking-wider">{op.label}</div>
                                <div className="text-xs opacity-60 font-normal">{op.sublabel}</div>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Quick scan another */}
                <button
                    onClick={onBack}
                    className="w-full mt-6 p-3 text-sm text-slate-500 hover:text-indigo-600 font-medium flex items-center justify-center gap-2 transition-colors min-h-[44px]"
                    aria-label={t("result.aria.scanAnother")}
                >
                    <Scan className="w-4 h-4" />
                    {t("result.scanAnotherCode")}
                </button>
            </div>
        </div>
    );
};

export { getOperationsForProfile, getOperationsForProfile as getOperationsForEngine };
