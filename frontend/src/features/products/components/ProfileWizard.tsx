import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Hash, Layers, Fingerprint } from "lucide-react";
import { PROFILE_METADATA, type InventoryProfile } from "../../../types/api";
import { Select } from "../../../components/ui/Select";
import type { SelectOption } from "../../../components/ui/Select";
import type { BadgeVariant } from "../../../components/ui/Badge";
import { Badge } from "../../../components/ui/Badge";

// ── Types ──────────────────────────────────────────────────────────────

type TrackingCategory = "quantity" | "batch" | "individual";

interface CategoryOption {
    id: TrackingCategory;
    icon: React.FC<{ className?: string }>;
    /** `products:profileWizard.*` key for the card title. */
    titleKey: string;
    /** `products:profileWizard.*` key for the card description. */
    descKey: string;
}

interface SubOption {
    profile: InventoryProfile;
    /** `products:profileWizard.*` key for the option label. */
    titleKey: string;
}

interface ProfileWizardProps {
    value: InventoryProfile | null;
    onChange: (profile: InventoryProfile) => void;
}

// ── Constants ──────────────────────────────────────────────────────────

const CATEGORIES: CategoryOption[] = [
    { id: "quantity", icon: Hash, titleKey: "profileWizard.byQuantity", descKey: "profileWizard.byQuantityDesc" },
    { id: "batch", icon: Layers, titleKey: "profileWizard.byBatch", descKey: "profileWizard.byBatchDesc" },
    { id: "individual", icon: Fingerprint, titleKey: "profileWizard.individually", descKey: "profileWizard.individuallyDesc" },
];

const SUB_OPTIONS: Record<"quantity" | "batch", SubOption[]> = {
    quantity: [
        { profile: "SIMPLE_COUNT", titleKey: "profileWizard.justCount" },
        { profile: "UNIT_CONVERSION", titleKey: "profileWizard.unitConversion" },
        { profile: "DIMENSIONAL", titleKey: "profileWizard.measureDimensions" },
        { profile: "ASSEMBLED", titleKey: "profileWizard.assembled" },
    ],
    batch: [
        { profile: "BATCH_TRACKED", titleKey: "profileWizard.standardBatches" },
        { profile: "PERISHABLE", titleKey: "profileWizard.perishable" },
    ],
};

const STORAGE_KEY = "profileWizardPreference";

/** Maps a profile tracking mode to its `products:trackingModes.*` key. */
const TRACKING_MODE_KEYS: Record<string, string> = {
    BULK: "bulk",
    BATCH: "batch",
    INDIVIDUAL: "individual",
};

/** Maps a widget input type to its `products:widgetInputs.*` key. */
const WIDGET_INPUT_KEYS: Record<string, string> = {
    number: "number",
    bucket_form: "bucketForm",
    tracker: "tracker",
    dimension: "dimension",
    time_based: "timeBased",
    batch_manager: "batchManager",
};

const PROFILE_OPTIONS: SelectOption[] = Object.entries(PROFILE_METADATA).map(
    ([value, meta]) => ({
        value,
        label: meta.label,
        description: meta.description,
    }),
);

export function profileBadgeVariant(profile: InventoryProfile): BadgeVariant {
    switch (profile) {
        case "SERIALIZED": return "amber";
        case "BATCH_TRACKED":
        case "PERISHABLE": return "cyan";
        case "DIMENSIONAL": return "indigo";
        case "ASSEMBLED": return "primary";
        case "UNIT_CONVERSION": return "emerald";
        case "SIMPLE_COUNT":
        default: return "neutral";
    }
}

// ── Reverse lookup: profile → category ─────────────────────────────────

function categoryForProfile(profile: InventoryProfile): TrackingCategory {
    if (profile === "SERIALIZED") return "individual";
    if (profile === "BATCH_TRACKED" || profile === "PERISHABLE") return "batch";
    return "quantity";
}

// ── Component ──────────────────────────────────────────────────────────

export const ProfileWizard: React.FC<ProfileWizardProps> = ({ value, onChange }) => {
    const { t } = useTranslation("products");

    const [mode, setMode] = useState<"wizard" | "dropdown">(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored === "dropdown" ? "dropdown" : "wizard";
        } catch {
            return "wizard";
        }
    });

    const [category, setCategory] = useState<TrackingCategory | null>(() =>
        value ? categoryForProfile(value) : null,
    );

    // Sync category when value changes externally
    useEffect(() => {
        if (value) setCategory(categoryForProfile(value));
    }, [value]);

    const switchMode = (next: "wizard" | "dropdown") => {
        setMode(next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch { /* noop */ }
    };

    // ── Dropdown mode ──────────────────────────────────────────────────

    if (mode === "dropdown") {
        return (
            <div>
                <Select
                    custom
                    label={t("profileColumn")}
                    value={value ?? ""}
                    onChange={(val) => onChange(String(val) as InventoryProfile)}
                    options={PROFILE_OPTIONS}
                    placeholder={t("profileWizard.selectProfilePlaceholder")}
                    required
                    helperText={t("profileWizard.dropdownHelp")}
                />
                <button
                    type="button"
                    className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    onClick={() => switchMode("wizard")}
                >
                    {t("profileWizard.useGuidedSelection")} &rarr;
                </button>
                {value && <ProfileInfoCard profile={value} />}
            </div>
        );
    }

    // ── Wizard mode ────────────────────────────────────────────────────

    const handleCategorySelect = (cat: TrackingCategory) => {
        setCategory(cat);
        if (cat === "individual") {
            onChange("SERIALIZED");
        }
    };

    const handleSubSelect = (profile: InventoryProfile) => {
        onChange(profile);
    };

    const needsStep2 = category === "quantity" || category === "batch";
    const subOptions = category && needsStep2 ? SUB_OPTIONS[category] : [];

    return (
        <div className="flex flex-col gap-4">
            {/* Step 1 */}
            <p className="text-sm font-medium text-zinc-300">
                {t("profileWizard.howToTrack")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const selected = category === cat.id;
                    return (
                        <button
                            key={cat.id}
                            type="button"
                            onClick={() => handleCategorySelect(cat.id)}
                            className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
                                selected
                                    ? "border-indigo-500 bg-zinc-900"
                                    : "border-white/[0.06] bg-zinc-900/80 hover:border-white/[0.12]"
                            }`}
                        >
                            <Icon
                                className={`size-5 ${
                                    selected ? "text-indigo-400" : "text-zinc-400"
                                }`}
                            />
                            <span className="text-sm font-medium text-zinc-200">
                                {t(cat.titleKey)}
                            </span>
                            <span className="text-xs text-zinc-500 leading-relaxed">
                                {t(cat.descKey)}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Step 2 — conditional sub-options */}
            {needsStep2 && subOptions.length > 0 && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 flex flex-col gap-3">
                    <p className="text-sm font-medium text-zinc-300">
                        {category === "quantity"
                            ? t("profileWizard.quantityKind")
                            : t("profileWizard.batchKind")}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {subOptions.map((opt) => {
                            const selected = value === opt.profile;
                            return (
                                <button
                                    key={opt.profile}
                                    type="button"
                                    onClick={() => handleSubSelect(opt.profile)}
                                    className={`rounded-lg border p-3 text-left transition-colors ${
                                        selected
                                            ? "border-indigo-500 bg-zinc-900"
                                            : "border-white/[0.06] bg-zinc-900/80 hover:border-white/[0.12]"
                                    }`}
                                >
                                    <span className="text-sm text-zinc-200">
                                        {t(opt.titleKey)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Escape hatch */}
            <button
                type="button"
                className="self-start text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
                onClick={() => switchMode("dropdown")}
            >
                {t("profileWizard.iKnowMyProfile")} &rarr;
            </button>

            {/* Profile confirmation card */}
            {value && <ProfileInfoCard profile={value} />}
        </div>
    );
};

// ── Profile Info Card ──────────────────────────────────────────────────

export const ProfileInfoCard: React.FC<{ profile: InventoryProfile }> = ({ profile }) => {
    const { t } = useTranslation("products");
    const meta = PROFILE_METADATA[profile];
    if (!meta) return null;

    const trackingKey = TRACKING_MODE_KEYS[meta.trackingMode];
    const trackingValue = trackingKey ? t(`trackingModes.${trackingKey}`) : meta.trackingMode;
    const widgetKey = WIDGET_INPUT_KEYS[meta.widgetInputType];
    const widgetValue = widgetKey ? t(`widgetInputs.${widgetKey}`) : meta.widgetInputType;

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 mt-3 rounded-lg border border-white/[0.06] bg-zinc-900/60 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <Badge variant={profileBadgeVariant(profile)}>{meta.label}</Badge>
            </div>
            <p className="text-sm text-zinc-400">{meta.description}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                <span>
                    {t("profileWizard.trackingLabel")}: <span className="text-zinc-400">{trackingValue}</span>
                </span>
                <span>
                    {t("profileWizard.widgetInputLabel")}: <span className="text-zinc-400">{widgetValue}</span>
                </span>
            </div>
        </div>
    );
};
