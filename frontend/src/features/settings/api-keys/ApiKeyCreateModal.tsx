import { useState } from "react";
import { useCreate, useList } from "@refinedev/core";
import { useTranslation } from "react-i18next";
import { X, Check, Copy, Globe, MapPin, Tag, Shield, Zap, Calendar, Eye } from "lucide-react";
import { Select } from "../../../components/ui/Select";
import { Badge } from "../../../components/ui/Badge";
import { Modal } from "../../../components/ui/Modal";
import { useToast } from "../../../components/ui/Toast";

interface ApiKeyCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const DEFAULT_PERMISSIONS = {
    read: true,
    write: true,
    delete: false,
    manage_qr: true,
    scan: true,
};

const PERMISSION_LABEL_KEYS: Record<string, string> = {
    read: "read",
    write: "write",
    delete: "delete",
    manage_qr: "manageQr",
    scan: "scan",
};

export const ApiKeyCreateModal = ({ isOpen, onClose, onSuccess }: ApiKeyCreateModalProps) => {
    const { t } = useTranslation(["settings", "common"]);
    const { toast } = useToast();
    const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
        Object.entries(PERMISSION_LABEL_KEYS).map(([k, key]) => [k, t(`settings:apiKeys.permissionLabels.${key}`)])
    );
    const RATE_LIMIT_OPTIONS = [
        { value: "free", label: t("settings:apiKeys.rateLimitOptions.free") },
        { value: "standard", label: t("settings:apiKeys.rateLimitOptions.standard") },
        { value: "premium", label: t("settings:apiKeys.rateLimitOptions.premium") },
    ];
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [generatedKey, setGeneratedKey] = useState("");

    // Form State
    const [label, setLabel] = useState("");
    const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
    const [domainInput, setDomainInput] = useState("");
    const [defaultLocation, setDefaultLocation] = useState("");
    const [permissions, setPermissions] = useState({ ...DEFAULT_PERMISSIONS });
    const [rateLimitTier, setRateLimitTier] = useState("free");
    const [expiresAt, setExpiresAt] = useState("");

    const { mutateAsync: createKey, isLoading } = useCreate();

    const { data: locations } = useList({
        resource: "locations",
        pagination: { mode: "off" },
        queryOptions: { enabled: isOpen }
    });

    const locationOptions = (locations?.data || []).map((l: any) => ({
        label: l.name,
        value: l.id
    }));

    if (!isOpen) return null;

    const togglePermission = (key: string) => {
        setPermissions(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));
    };

    const addDomain = () => {
        const trimmed = domainInput.trim().toLowerCase();
        if (trimmed && !allowedDomains.includes(trimmed)) {
            setAllowedDomains(prev => [...prev, trimmed]);
        }
        setDomainInput("");
    };

    const removeDomain = (domain: string) => {
        setAllowedDomains(prev => prev.filter(d => d !== domain));
    };

    const handleDomainKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addDomain();
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const { data } = await createKey({
                resource: "api-keys",
                values: {
                    label,
                    allowed_domains: allowedDomains.join(", "),
                    default_location: defaultLocation || null,
                    permissions,
                    rate_limit_tier: rateLimitTier,
                    expires_at: expiresAt || null,
                }
            });

            if (data?.data?.key) {
                setGeneratedKey(data.data.key);
                setStep('success');
                onSuccess();
            }
        } catch (error) {
            console.error(error);
            toast({ message: t("settings:apiKeys.createFailed"), variant: "error" });
        }
    };

    const handleClose = () => {
        setStep('form');
        setLabel("");
        setAllowedDomains([]);
        setDomainInput("");
        setGeneratedKey("");
        setDefaultLocation("");
        setPermissions({ ...DEFAULT_PERMISSIONS });
        setRateLimitTier("free");
        setExpiresAt("");
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={step === 'form' ? t("settings:apiKeys.modalTitle") : t("settings:apiKeys.modalSuccessTitle")}
            size="lg"
        >
            <div className="max-h-[70vh] overflow-y-auto">
                {step === 'form' ? (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Label */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                                <Tag size={16} className="text-indigo-400" />
                                {t("settings:apiKeys.keyLabel")} <span className="text-red-400">*</span>
                            </label>
                            <input
                                required
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                placeholder={t("settings:apiKeys.keyLabelPlaceholder")}
                                className="w-full bg-zinc-950 border border-white/[0.06] rounded-lg px-4 py-3 text-white focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                            />
                        </div>

                        {/* Permissions */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                                <Shield size={16} className="text-cyan-400" />
                                {t("settings:apiKeys.permissions")}
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(PERMISSION_LABELS).map(([key, displayLabel]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => togglePermission(key)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-150 ${
                                            permissions[key as keyof typeof permissions]
                                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                                                : 'bg-zinc-800 text-zinc-500 border-white/[0.06] hover:bg-zinc-700'
                                        }`}
                                    >
                                        {permissions[key as keyof typeof permissions] ? "✓ " : ""}{displayLabel}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-zinc-500">{t("settings:apiKeys.permissionsHint")}</p>
                        </div>

                        {/* Rate Limit Tier */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                                <Zap size={16} className="text-amber-400" />
                                {t("settings:apiKeys.rateLimitTier")}
                            </label>
                            <Select
                                value={rateLimitTier}
                                onChange={(val) => setRateLimitTier(String(val))}
                                options={RATE_LIMIT_OPTIONS}
                            />
                        </div>

                        {/* Expiration Date */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                                <Calendar size={16} className="text-rose-400" />
                                {t("settings:apiKeys.expirationDate")}
                            </label>
                            <input
                                type="datetime-local"
                                value={expiresAt}
                                onChange={(e) => setExpiresAt(e.target.value)}
                                className="w-full bg-zinc-950 border border-white/[0.06] rounded-lg px-4 py-3 text-white focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none [color-scheme:dark]"
                            />
                            <p className="text-xs text-zinc-500">{t("settings:apiKeys.expirationHint")}</p>
                        </div>

                        {/* Domain Whitelist */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                                <Globe size={16} className="text-emerald-400" />
                                {t("settings:apiKeys.allowedDomains")}
                            </label>
                            <div className="flex gap-2">
                                <input
                                    value={domainInput}
                                    onChange={(e) => setDomainInput(e.target.value)}
                                    onKeyDown={handleDomainKeyDown}
                                    placeholder={t("settings:apiKeys.domainPlaceholder")}
                                    className="flex-1 bg-zinc-950 border border-white/[0.06] rounded-lg px-4 py-3 text-white focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none font-mono text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={addDomain}
                                    className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg border border-white/[0.06] text-sm font-medium transition-colors"
                                >
                                    {t("settings:apiKeys.add")}
                                </button>
                            </div>
                            {allowedDomains.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                    {allowedDomains.map(domain => (
                                        <span key={domain} className="inline-flex items-center gap-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-1 rounded text-xs font-mono">
                                            {domain}
                                            <button type="button" onClick={() => removeDomain(domain)} className="hover:text-red-400 transition-colors" aria-label={t("settings:apiKeys.removeDomain", { domain })}>
                                                <X size={12} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <p className="text-xs text-zinc-500">{t("settings:apiKeys.domainsHint")}</p>
                        </div>

                        {/* Default Location */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                                <MapPin size={16} className="text-amber-400" />
                                {t("settings:apiKeys.defaultLocation")}
                            </label>
                            <Select
                                value={defaultLocation}
                                onChange={(val) => setDefaultLocation(String(val))}
                                placeholder={t("settings:apiKeys.noDefaultLocation")}
                                options={locationOptions}
                            />
                            <p className="text-xs text-zinc-500">{t("settings:apiKeys.defaultLocationHint")}</p>
                        </div>

                        {/* Live Preview */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                                <Eye size={16} className="text-zinc-400" />
                                {t("settings:apiKeys.keyPreview")}
                            </label>
                            <div className="bg-zinc-950 border border-white/[0.06] rounded-lg p-4 space-y-2 text-xs">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-zinc-500">{t("settings:apiKeys.previewPermissions")}</span>
                                    {Object.entries(permissions).filter(([, v]) => v).map(([k]) => (
                                        <Badge key={k} variant="emerald">{PERMISSION_LABELS[k]}</Badge>
                                    ))}
                                    {Object.values(permissions).every(v => !v) && (
                                        <span className="text-red-400 italic">{t("settings:apiKeys.previewNoPermissions")}</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-zinc-500">{t("settings:apiKeys.previewRateLimit")}</span>
                                    <Badge variant="amber">{RATE_LIMIT_OPTIONS.find(o => o.value === rateLimitTier)?.label}</Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-zinc-500">{t("settings:apiKeys.previewExpires")}</span>
                                    <span className="text-zinc-300">{expiresAt ? new Date(expiresAt).toLocaleString() : t("settings:apiKeys.never")}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-zinc-500">{t("settings:apiKeys.previewDomains")}</span>
                                    <span className="text-zinc-300">{allowedDomains.length > 0 ? allowedDomains.join(", ") : t("settings:apiKeys.previewAllDomains")}</span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleClose}
                                className="px-5 py-2 rounded-lg font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                {t("common:cancel")}
                            </button>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-900/20 active:scale-95 transition-all duration-150 disabled:opacity-50"
                            >
                                {isLoading ? t("settings:apiKeys.generating") : t("settings:apiKeys.generateKey")}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="text-center space-y-6 py-2">
                        <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Check size={32} />
                        </div>

                        <div className="space-y-2">
                            <p className="text-zinc-300">{t("settings:apiKeys.successMessage")}</p>
                            <div className="p-4 bg-zinc-950 border border-amber-500/30 rounded-lg flex items-center justify-between gap-4 group">
                                <code className="text-amber-400 font-mono text-lg break-all text-left">
                                    {generatedKey}
                                </code>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(generatedKey);
                                        toast({ message: t("settings:apiKeys.copiedClipboard"), variant: "success" });
                                    }}
                                    className="p-2 text-zinc-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                                    title={t("settings:apiKeys.copyToClipboard")}
                                    aria-label={t("settings:apiKeys.copyToClipboard")}
                                >
                                    <Copy size={20} />
                                </button>
                            </div>
                            <p className="text-xs text-red-400 mt-2 font-bold uppercase">
                                {t("settings:apiKeys.warningNotShown")}
                            </p>
                        </div>

                        <button
                            onClick={handleClose}
                            className="w-full py-3 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-bold transition-colors duration-150"
                        >
                            {t("settings:apiKeys.savedKey")}
                        </button>
                    </div>
                )}
            </div>
        </Modal>
    );
};
