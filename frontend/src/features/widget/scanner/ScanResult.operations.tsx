import React from "react";
import type { TFunction } from "i18next";
import { ArrowUpCircle, ArrowDownCircle, ArrowRightLeft, Play, CheckCircle2 } from "lucide-react";

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

export interface OperationButton {
    operation: OperationType;
    label: string;
    sublabel: string;
    icon: React.ReactNode;
    variant: "primary" | "secondary" | "danger";
}

export function getOperationsForProfile(profile?: string, engineType?: string, t?: TFunction): OperationButton[] {
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

export { getOperationsForProfile as getOperationsForEngine };
