import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/Toast";
import { axiosInstance } from "../../../providers/axios-client";
import { API_URL } from "../../../config";

const FIELDS = [
    "reorder_threshold",
    "critical_threshold",
    "max_threshold",
    "reorder_qty",
] as const;

type Field = (typeof FIELDS)[number];

export interface ProductModelRow {
    id: string;
    sku: string;
    name: string;
    reorder_threshold: number | string | null;
    critical_threshold: number | string | null;
    max_threshold: number | string | null;
    reorder_qty: number | string | null;
}

type EditsMap = Record<string, Partial<Record<Field, string>>>;

const toFormValue = (v: number | string | null | undefined) =>
    v == null || v === "" ? "" : String(v);

const toNullableNumber = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const fieldOriginal = (row: ProductModelRow, field: Field) =>
    toFormValue(row[field]);

const rowDisplayValue = (
    row: ProductModelRow,
    field: Field,
    edits: EditsMap,
) => {
    const rowEdits = edits[row.id];
    if (rowEdits && field in rowEdits) return rowEdits[field] ?? "";
    return fieldOriginal(row, field);
};

const rowError = (
    row: ProductModelRow,
    edits: EditsMap,
    t: (k: string) => string,
): string | null => {
    const r = toNullableNumber(rowDisplayValue(row, "reorder_threshold", edits));
    const c = toNullableNumber(
        rowDisplayValue(row, "critical_threshold", edits),
    );
    const m = toNullableNumber(rowDisplayValue(row, "max_threshold", edits));
    if (c != null && r != null && c > r) return t("bulk.rowInvalid");
    if (r != null && m != null && r > m) return t("bulk.rowInvalid");
    return null;
};

const rowDirty = (row: ProductModelRow, edits: EditsMap): boolean => {
    const rowEdits = edits[row.id];
    if (!rowEdits) return false;
    return FIELDS.some((f) => {
        if (!(f in rowEdits)) return false;
        return (rowEdits[f] ?? "") !== fieldOriginal(row, f);
    });
};

const buildPayload = (rows: ProductModelRow[], edits: EditsMap) =>
    rows
        .filter((r) => rowDirty(r, edits))
        .map((r) => {
            const item: Record<string, unknown> = { id: r.id };
            const rowEdits = edits[r.id] ?? {};
            for (const f of FIELDS) {
                if (f in rowEdits && rowEdits[f] !== fieldOriginal(r, f)) {
                    item[f] = toNullableNumber(rowEdits[f] ?? "");
                }
            }
            return item;
        });

interface BulkThresholdsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved?: () => void;
}

export const BulkThresholdsModal = ({
    isOpen,
    onClose,
    onSaved,
}: BulkThresholdsModalProps) => {
    const { t } = useTranslation(["restock", "common"]);
    const { toast } = useToast();
    const [edits, setEdits] = useState<EditsMap>({});
    const [search, setSearch] = useState("");
    const [saving, setSaving] = useState(false);

    const [rows, setRows] = useState<ProductModelRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // The modal must list every product. The server caps page_size at 200,
    // so a single fixed-size request silently hid products beyond that cap —
    // page through until exhausted instead.
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        (async () => {
            setIsLoading(true);
            try {
                const all: ProductModelRow[] = [];
                let page = 1;
                for (;;) {
                    const res = await axiosInstance.get(
                        `${API_URL}/api/v1/product-models/?page=${page}&page_size=200`,
                    );
                    const data = res.data;
                    const items = Array.isArray(data) ? data : (data?.results ?? []);
                    all.push(...items);
                    if (Array.isArray(data) || !data?.next) break;
                    page += 1;
                }
                if (!cancelled) setRows(all);
            } catch {
                if (!cancelled) setRows([]);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            setEdits({});
            setSearch("");
        }
    }, [isOpen]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(
            (r) =>
                r.sku.toLowerCase().includes(q) ||
                r.name.toLowerCase().includes(q),
        );
    }, [rows, search]);

    const setField = (id: string, field: Field, value: string) =>
        setEdits((prev) => ({
            ...prev,
            [id]: { ...(prev[id] ?? {}), [field]: value },
        }));

    const anyError = useMemo(
        () => rows.some((r) => rowError(r, edits, t) != null),
        [rows, edits, t],
    );
    const payload = useMemo(
        () => buildPayload(rows, edits),
        [rows, edits],
    );
    const hasChanges = payload.length > 0;

    const handleSave = async () => {
        if (!hasChanges || anyError || saving) return;
        setSaving(true);
        try {
            const res = await axiosInstance.post(
                `${API_URL}/api/v1/restock/thresholds/bulk/`,
                payload,
            );
            const updatedCount = Array.isArray(res.data?.updated)
                ? res.data.updated.length
                : payload.length;
            toast({
                message: t("bulk.saved", { count: updatedCount }),
                variant: "success",
            });
            onSaved?.();
            onClose();
        } catch {
            toast({
                message: t("bulk.saveFailed"),
                variant: "error",
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t("bulk.title")}
            size="lg"
            footer={
                <>
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        disabled={saving}
                        data-testid="bulk-thresholds-cancel"
                    >
                        {t("bulk.cancel")}
                    </Button>
                    <Button
                        onClick={handleSave}
                        loading={saving}
                        disabled={!hasChanges || anyError || isLoading}
                        data-testid="bulk-thresholds-save"
                    >
                        {t("bulk.save")}
                    </Button>
                </>
            }
        >
            <div className="space-y-3" data-testid="bulk-thresholds-modal">
                <div className="relative">
                    <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                    />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t("bulk.search")}
                        className="w-full h-9 pl-9 pr-3 bg-zinc-950 border border-white/[0.06] rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        data-testid="bulk-thresholds-search"
                    />
                </div>

                <div className="max-h-[60vh] overflow-y-auto border border-white/[0.06] rounded-lg">
                    {isLoading ? (
                        <div className="p-6 text-center text-sm text-zinc-500">
                            …
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="p-6 text-center text-sm text-zinc-500">
                            {t("bulk.noProducts")}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div
                            className="p-6 text-center text-sm text-zinc-500"
                            data-testid="bulk-thresholds-nomatch"
                        >
                            {t("bulk.noMatch")}
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-zinc-900 text-[11px] uppercase text-zinc-500">
                                <tr>
                                    <th className="px-3 py-2 text-left font-medium">
                                        {t("bulk.colSku")}
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                        {t("bulk.colName")}
                                    </th>
                                    <th className="px-2 py-2 text-right font-medium w-[88px]">
                                        {t("bulk.colReorder")}
                                    </th>
                                    <th className="px-2 py-2 text-right font-medium w-[88px]">
                                        {t("bulk.colCritical")}
                                    </th>
                                    <th className="px-2 py-2 text-right font-medium w-[88px]">
                                        {t("bulk.colMax")}
                                    </th>
                                    <th className="px-2 py-2 text-right font-medium w-[88px]">
                                        {t("bulk.colReorderQty")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((row) => {
                                    const err = rowError(row, edits, t);
                                    return (
                                        <tr
                                            key={row.id}
                                            className={`border-t border-white/[0.04] ${err ? "bg-red-500/5" : ""}`}
                                            data-testid={`bulk-row-${row.id}`}
                                            data-invalid={err ? "true" : undefined}
                                        >
                                            <td className="px-3 py-2 font-mono text-[11px] text-zinc-400 truncate max-w-[120px]">
                                                {row.sku}
                                            </td>
                                            <td className="px-3 py-2 text-zinc-200 truncate max-w-[200px]">
                                                {row.name}
                                            </td>
                                            {FIELDS.map((f) => (
                                                <td
                                                    key={f}
                                                    className="px-1.5 py-1"
                                                >
                                                    <input
                                                        type="number"
                                                        inputMode="decimal"
                                                        step="any"
                                                        min="0"
                                                        value={rowDisplayValue(
                                                            row,
                                                            f,
                                                            edits,
                                                        )}
                                                        onChange={(e) =>
                                                            setField(
                                                                row.id,
                                                                f,
                                                                e.target.value,
                                                            )
                                                        }
                                                        className={`w-full h-8 px-2 bg-zinc-950 border rounded text-right text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 ${err ? "border-red-500/40" : "border-white/[0.06]"}`}
                                                        data-testid={`bulk-${f}-${row.id}`}
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {anyError && (
                    <p
                        className="text-xs text-red-400"
                        data-testid="bulk-thresholds-error"
                    >
                        {t("bulk.rowInvalid")}
                    </p>
                )}
                {!anyError && !hasChanges && !isLoading && rows.length > 0 && (
                    <p
                        className="text-xs text-zinc-500"
                        data-testid="bulk-thresholds-nochanges"
                    >
                        {t("bulk.noChanges")}
                    </p>
                )}
            </div>
        </Modal>
    );
};
