import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";

export interface BulkDeleteModalProps {
    open: boolean;
    onClose: () => void;
    items: Array<{ id: string; label: string }>;
    cascadeLabel?: string;
    cascadeDefault?: boolean;
    /** Optional extra warning rendered below the "cannot be undone" line.
     * Used by terminal flows (e.g. Movements) to underscore that the rows
     * being deleted are themselves the audit history. */
    extraWarning?: string;
    onConfirm: (preserveCascade: boolean) => Promise<void>;
}

const MAX_PREVIEW = 5;

export const BulkDeleteModal = ({
    open,
    onClose,
    items,
    cascadeLabel,
    cascadeDefault,
    extraWarning,
    onConfirm,
}: BulkDeleteModalProps) => {
    const { t } = useTranslation("common");
    const [preserveCascade, setPreserveCascade] = useState<boolean>(
        cascadeDefault === true,
    );
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setPreserveCascade(cascadeDefault === true);
            setSubmitting(false);
            setError(null);
        }
    }, [open, cascadeDefault]);

    const count = items.length;
    const visible = items.slice(0, MAX_PREVIEW);
    const overflow = Math.max(0, count - MAX_PREVIEW);
    const showToggle = cascadeLabel !== undefined;

    const handleConfirm = async () => {
        if (submitting) return;
        setSubmitting(true);
        setError(null);
        try {
            await onConfirm(preserveCascade);
        } catch (e: any) {
            setError(e?.message ?? t("bulkDeleteFailed"));
            setSubmitting(false);
        }
    };

    const handleClose = () => {
        if (submitting) return;
        onClose();
    };

    return (
        <Modal
            isOpen={open}
            onClose={handleClose}
            title={t("bulkDeleteTitle", { count })}
            size="md"
            closeOnBackdrop={!submitting}
            footer={
                <>
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={submitting}
                        className="px-5 py-2 rounded-lg font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        data-testid="bulk-delete-cancel"
                    >
                        {t("cancel")}
                    </button>
                    <Button
                        type="button"
                        variant="danger"
                        loading={submitting}
                        onClick={handleConfirm}
                        data-testid="bulk-delete-confirm"
                    >
                        {t("delete")}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="flex items-start gap-3">
                    <div
                        className="shrink-0 w-10 h-10 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center"
                        aria-hidden="true"
                    >
                        <AlertTriangle size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-300">{t("bulkDeleteBody")}</p>
                        <ul
                            className="mt-2 text-sm text-zinc-200 list-disc pl-5 space-y-0.5"
                            data-testid="bulk-delete-items"
                        >
                            {visible.map((item) => (
                                <li key={item.id} className="truncate">
                                    {item.label}
                                </li>
                            ))}
                        </ul>
                        {overflow > 0 && (
                            <p
                                className="mt-1 text-xs text-zinc-500"
                                data-testid="bulk-delete-overflow"
                            >
                                {t("bulkDeleteAndMore", { count: overflow })}
                            </p>
                        )}
                        <p className="mt-3 text-xs text-red-400">
                            {t("cannotBeUndone")}
                        </p>
                        {extraWarning && (
                            <p
                                className="mt-2 text-xs font-medium text-red-300"
                                data-testid="bulk-delete-extra-warning"
                            >
                                {extraWarning}
                            </p>
                        )}
                    </div>
                </div>

                {showToggle && (
                    <label
                        className="flex items-center gap-2 text-sm text-zinc-300 select-none cursor-pointer"
                        data-testid="bulk-delete-cascade-label"
                    >
                        <Checkbox
                            aria-label={cascadeLabel ?? ""}
                            checked={preserveCascade}
                            onChange={(next) => setPreserveCascade(next)}
                            disabled={submitting}
                        />
                        <span>{cascadeLabel}</span>
                    </label>
                )}

                {error && (
                    <div
                        role="alert"
                        className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
                        data-testid="bulk-delete-error"
                    >
                        {error}
                    </div>
                )}
            </div>
        </Modal>
    );
};
