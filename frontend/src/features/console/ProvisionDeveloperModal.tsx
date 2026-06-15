import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Copy, KeyRound, ShieldCheck } from "lucide-react";

import { Modal } from "../../components/ui/Modal";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../components/ui/Toast";
import {
    provisionDeveloper,
    extractLifecycleError,
    type ProvisionDeveloperResult,
} from "./hooks";

interface ProvisionDeveloperModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Called after a successful provision so the grid can refetch. */
    onProvisioned: () => void;
}

/**
 * Two-step modal for provisioning a developer company from the console
 * (SUPERADMIN-07). Step one collects the company name + VAT and an optional
 * seed admin (email/password); step two surfaces the one-time secrets the API
 * returns — the developer's license code and plaintext default API key — which
 * are never readable again. Wraps ``POST /platform/companies/provision-developer/``
 * via {@link provisionDeveloper} and toasts failures with the server message.
 */
export const ProvisionDeveloperModal = ({
    isOpen,
    onClose,
    onProvisioned,
}: ProvisionDeveloperModalProps) => {
    const { t } = useTranslation("nav");
    const { toast } = useToast();

    const [name, setName] = useState("");
    const [vat, setVat] = useState("");
    const [adminEmail, setAdminEmail] = useState("");
    const [adminPassword, setAdminPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<ProvisionDeveloperResult | null>(null);

    const reset = () => {
        setName("");
        setVat("");
        setAdminEmail("");
        setAdminPassword("");
        setIsSubmitting(false);
        setResult(null);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const copy = (value: string) => {
        navigator.clipboard.writeText(value);
        toast({ message: t("consoleProvisionCopied"), variant: "success" });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // Match the serializer's rule: a seed admin needs a password.
        if (adminEmail.trim() && !adminPassword) {
            toast({ message: t("consoleProvisionPasswordRequired"), variant: "error" });
            return;
        }
        setIsSubmitting(true);
        try {
            const created = await provisionDeveloper({
                name: name.trim(),
                vat: vat.trim() || undefined,
                admin_email: adminEmail.trim() || undefined,
                admin_password: adminEmail.trim() ? adminPassword : undefined,
            });
            setResult(created);
            onProvisioned();
            toast({
                message: t("consoleProvisionSuccess", { name: created.name }),
                variant: "success",
            });
        } catch (err) {
            toast({
                message: extractLifecycleError(err, t("consoleProvisionFailed")),
                variant: "error",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={result ? t("consoleProvisionDoneTitle") : t("consoleProvisionTitle")}
            size="md"
        >
            {result ? (
                <div className="space-y-5">
                    <div className="flex items-center gap-2">
                        <Building2 size={18} className="text-indigo-400" />
                        <span className="font-semibold text-zinc-100">{result.name}</span>
                        <Badge variant="indigo">{t("consoleTierDeveloper")}</Badge>
                    </div>
                    <p className="text-sm text-zinc-400">{t("consoleProvisionDoneHint")}</p>

                    <SecretRow
                        label={t("consoleProvisionLicense")}
                        value={result.license_code}
                        onCopy={copy}
                    />
                    {result.api_key && (
                        <SecretRow
                            label={t("consoleProvisionApiKey")}
                            value={result.api_key}
                            onCopy={copy}
                        />
                    )}
                    {result.admin && (
                        <div className="text-sm text-zinc-400">
                            {t("consoleProvisionAdmin")}:{" "}
                            <span className="text-zinc-200">{result.admin.email}</span>
                        </div>
                    )}

                    <div className="flex justify-end pt-2">
                        <Button variant="primary" size="md" onClick={handleClose}>
                            {t("consoleProvisionDoneButton")}
                        </Button>
                    </div>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label={t("consoleProvisionName")}
                        icon={Building2}
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("consoleProvisionNamePlaceholder")}
                    />
                    <Input
                        label={t("consoleColVat")}
                        value={vat}
                        onChange={(e) => setVat(e.target.value)}
                        placeholder={t("consoleProvisionVatPlaceholder")}
                    />
                    <Input
                        label={t("consoleProvisionAdminEmail")}
                        icon={ShieldCheck}
                        type="email"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder={t("consoleProvisionAdminEmailPlaceholder")}
                        helperText={t("consoleProvisionAdminHint")}
                    />
                    {adminEmail.trim() && (
                        <Input
                            label={t("consoleProvisionAdminPassword")}
                            icon={KeyRound}
                            type="password"
                            required
                            value={adminPassword}
                            onChange={(e) => setAdminPassword(e.target.value)}
                        />
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            onClick={handleClose}
                        >
                            {t("consoleProvisionCancel")}
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            loading={isSubmitting}
                            disabled={!name.trim()}
                        >
                            {t("consoleProvisionSubmit")}
                        </Button>
                    </div>
                </form>
            )}
        </Modal>
    );
};

interface SecretRowProps {
    label: string;
    value: string;
    onCopy: (value: string) => void;
}

/** A copy-once secret (license code / API key) with a clipboard button. */
const SecretRow = ({ label, value, onCopy }: SecretRowProps) => (
    <div className="space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {label}
        </span>
        <div className="flex items-center justify-between gap-3 bg-zinc-950 border border-amber-500/30 rounded-lg px-3 py-2">
            <code className="text-amber-400 font-mono text-sm break-all">{value}</code>
            <button
                type="button"
                onClick={() => onCopy(value)}
                className="shrink-0 p-1.5 text-zinc-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Copy"
            >
                <Copy size={16} />
            </button>
        </div>
    </div>
);

export default ProvisionDeveloperModal;
