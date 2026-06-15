import React, { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, Download, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";

import { PageHeader } from "../../../components/ui/PageHeader";
import { Card, CardContent } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Checkbox } from "../../../components/ui/Checkbox";
import { axiosInstance } from "../../../providers/axios-client";
import { API_URL } from "../../../config";

type RowAction = "CREATE" | "UPDATE" | "ERROR";

interface RowResult {
    row: number;
    sku: string;
    name?: string;
    action: RowAction;
    errors: string[];
}

interface ImportReport {
    dry_run: boolean;
    total: number;
    counts: { create: number; update: number; error: number };
    results: RowResult[];
}

const TEMPLATE_COLUMNS = [
    "sku", "name", "profile", "barcode", "engine_config", "initial_stock",
    "location", "supplier", "unit_cost", "batch_identifier", "expiry_date", "serials",
];

type Step = "upload" | "preview" | "result";

export const ProductImport: React.FC = () => {
    const { t } = useTranslation("import");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [step, setStep] = useState<Step>("upload");
    const [file, setFile] = useState<File | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [report, setReport] = useState<ImportReport | null>(null);
    const [skipErrors, setSkipErrors] = useState(false);

    const reset = () => {
        setStep("upload");
        setFile(null);
        setReport(null);
        setError(null);
        setSkipErrors(false);
        setLoading(false);
    };

    const downloadTemplate = useCallback(() => {
        const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Products");
        XLSX.writeFile(wb, "product-import-template.xlsx");
    }, []);

    const upload = useCallback(
        async (dryRun: boolean) => {
            if (!file) return;
            setLoading(true);
            setError(null);
            try {
                const fd = new FormData();
                fd.append("file", file);
                const res = await axiosInstance.post<ImportReport>(
                    `${API_URL}/api/v1/import/products/${dryRun ? "?dry_run=true" : ""}`,
                    fd,
                );
                setReport(res.data);
                setStep(dryRun ? "preview" : "result");
            } catch (err: any) {
                setError(err?.response?.data?.detail || t("upload.errorParsing"));
            } finally {
                setLoading(false);
            }
        },
        [file, t],
    );

    const onSelectFile = (f: File | null) => {
        setFile(f);
        setError(null);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onSelectFile(f);
    };

    const hasErrors = (report?.counts.error ?? 0) > 0;
    const blocked = step === "preview" && hasErrors && !skipErrors;

    const actionBadge = (action: RowAction) => {
        const styles: Record<RowAction, string> = {
            CREATE: "bg-emerald-500/15 text-emerald-300",
            UPDATE: "bg-blue-500/15 text-blue-300",
            ERROR: "bg-red-500/15 text-red-300",
        };
        return (
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${styles[action]}`}>
                {t(`action.${action}`)}
            </span>
        );
    };

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />

            {/* Step indicator */}
            <div className="flex gap-2 text-sm text-zinc-400" data-testid="import-steps">
                <span className={step === "upload" ? "text-indigo-400 font-medium" : ""}>
                    1. {t("step.upload")}
                </span>
                <span>›</span>
                <span className={step === "preview" ? "text-indigo-400 font-medium" : ""}>
                    2. {t("step.preview")}
                </span>
                <span>›</span>
                <span className={step === "result" ? "text-indigo-400 font-medium" : ""}>
                    3. {t("step.result")}
                </span>
            </div>

            {error && (
                <div className="rounded-md bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 text-sm">
                    {error}
                </div>
            )}

            {/* Step 1: Upload */}
            {step === "upload" && (
                <Card>
                    <CardContent>
                        <div
                            onDragOver={(e) => {
                                e.preventDefault();
                                setDragActive(true);
                            }}
                            onDragLeave={() => setDragActive(false)}
                            onDrop={handleDrop}
                            className={`rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
                                dragActive ? "border-indigo-400 bg-indigo-500/5" : "border-zinc-700"
                            }`}
                            data-testid="dropzone"
                        >
                            <Upload className="mx-auto mb-3 h-8 w-8 text-zinc-500" />
                            <p className="text-zinc-300">{t("upload.dropHere")}</p>
                            <p className="my-2 text-xs text-zinc-500">{t("upload.or")}</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.xlsx"
                                className="hidden"
                                data-testid="file-input"
                                onChange={(e) => onSelectFile(e.target.files?.[0] || null)}
                            />
                            <Button
                                variant="secondary"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {t("upload.browse")}
                            </Button>
                            {file && (
                                <p className="mt-4 flex items-center justify-center gap-2 text-sm text-zinc-300">
                                    <FileSpreadsheet className="h-4 w-4" />
                                    {t("upload.selected")} <span className="font-mono">{file.name}</span>
                                </p>
                            )}
                            <p className="mt-4 text-xs text-zinc-500">{t("upload.hint")}</p>
                        </div>

                        <div className="mt-4 flex items-center justify-between">
                            <Button variant="ghost" icon={Download} onClick={downloadTemplate}>
                                {t("upload.downloadTemplate")}
                            </Button>
                            <Button
                                variant="primary"
                                disabled={!file}
                                loading={loading}
                                onClick={() => upload(true)}
                            >
                                {loading ? t("upload.analyzing") : t("upload.analyze")}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 2: Preview */}
            {step === "preview" && report && (
                <Card>
                    <CardContent>
                        <h2 className="mb-3 text-lg font-medium text-zinc-100">
                            {t("preview.title")}
                        </h2>
                        <div className="mb-4 flex gap-4 text-sm">
                            <span className="text-emerald-300">
                                {t("preview.create")}: {report.counts.create}
                            </span>
                            <span className="text-blue-300">
                                {t("preview.update")}: {report.counts.update}
                            </span>
                            <span className="text-red-300">
                                {t("preview.error")}: {report.counts.error}
                            </span>
                        </div>

                        {report.results.length === 0 ? (
                            <p className="text-zinc-500">{t("preview.empty")}</p>
                        ) : (
                            <div className="max-h-96 overflow-auto rounded border border-zinc-800">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-zinc-900 text-left text-zinc-400">
                                        <tr>
                                            <th className="px-3 py-2">{t("preview.row")}</th>
                                            <th className="px-3 py-2">{t("preview.sku")}</th>
                                            <th className="px-3 py-2">{t("preview.name")}</th>
                                            <th className="px-3 py-2">{t("preview.action")}</th>
                                            <th className="px-3 py-2">{t("preview.messages")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.results.map((r) => (
                                            <tr key={r.row} className="border-t border-zinc-800">
                                                <td className="px-3 py-2 text-zinc-500">{r.row}</td>
                                                <td className="px-3 py-2 font-mono">{r.sku}</td>
                                                <td className="px-3 py-2">{r.name}</td>
                                                <td className="px-3 py-2">{actionBadge(r.action)}</td>
                                                <td className="px-3 py-2 text-red-300">
                                                    {r.errors.join("; ")}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {hasErrors && (
                            <div className="mt-4">
                                <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                                    <Checkbox
                                        aria-label={t("preview.skipErrors")}
                                        checked={skipErrors}
                                        onChange={(next) => setSkipErrors(next === true)}
                                        data-testid="skip-errors"
                                    />
                                    {t("preview.skipErrors")}
                                </label>
                                {blocked && (
                                    <p className="mt-2 text-sm text-amber-400">
                                        {t("preview.blockedByErrors")}
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="mt-6 flex justify-between">
                            <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep("upload")}>
                                {t("preview.back")}
                            </Button>
                            <Button
                                variant="primary"
                                disabled={blocked || loading}
                                loading={loading}
                                onClick={() => upload(false)}
                            >
                                {loading ? t("preview.importing") : t("preview.confirm")}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 3: Result */}
            {step === "result" && report && (
                <Card>
                    <CardContent>
                        <div className="flex items-center gap-2 text-lg font-medium text-zinc-100">
                            {report.counts.error > 0 ? (
                                <XCircle className="h-5 w-5 text-amber-400" />
                            ) : (
                                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                            )}
                            {t("result.title")}
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-4">
                            <div className="rounded bg-emerald-500/10 p-4 text-center">
                                <div className="text-2xl font-semibold text-emerald-300">
                                    {report.counts.create}
                                </div>
                                <div className="text-xs text-zinc-400">{t("result.created")}</div>
                            </div>
                            <div className="rounded bg-blue-500/10 p-4 text-center">
                                <div className="text-2xl font-semibold text-blue-300">
                                    {report.counts.update}
                                </div>
                                <div className="text-xs text-zinc-400">{t("result.updated")}</div>
                            </div>
                            <div className="rounded bg-red-500/10 p-4 text-center">
                                <div className="text-2xl font-semibold text-red-300">
                                    {report.counts.error}
                                </div>
                                <div className="text-xs text-zinc-400">{t("result.errors")}</div>
                            </div>
                        </div>

                        {report.counts.error > 0 && (
                            <div className="mt-4">
                                <h3 className="mb-2 text-sm text-zinc-400">
                                    {t("result.rowsWithErrors")}
                                </h3>
                                <div className="max-h-64 overflow-auto rounded border border-zinc-800">
                                    <table className="w-full text-sm">
                                        <tbody>
                                            {report.results
                                                .filter((r) => r.action === "ERROR")
                                                .map((r) => (
                                                    <tr key={r.row} className="border-t border-zinc-800">
                                                        <td className="px-3 py-2 text-zinc-500">{r.row}</td>
                                                        <td className="px-3 py-2 font-mono">{r.sku}</td>
                                                        <td className="px-3 py-2 text-red-300">
                                                            {r.errors.join("; ")}
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <Button variant="secondary" onClick={reset}>
                                {t("result.importAnother")}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default ProductImport;
