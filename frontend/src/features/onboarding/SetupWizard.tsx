import { useNavigate } from "react-router-dom";
import {
    Sparkles, Package, CheckCircle2, Boxes, Fingerprint, Layers,
    ArrowRight, ArrowLeft,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOnboarding } from "./useOnboarding";
import { Card, CardContent, CardFooter } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";

const STEPS = [
    { num: 1 as const, labelKey: "wizard.steps.welcome" },
    { num: 2 as const, labelKey: "wizard.steps.product" },
    { num: 3 as const, labelKey: "wizard.steps.done" },
];

const TRACKING_MODES = [
    { value: "BULK", labelKey: "wizard.trackingModes.bulk", descKey: "wizard.trackingModes.bulkDesc", icon: Boxes },
    { value: "INDIVIDUAL", labelKey: "wizard.trackingModes.individual", descKey: "wizard.trackingModes.individualDesc", icon: Fingerprint },
    { value: "BATCH", labelKey: "wizard.trackingModes.batch", descKey: "wizard.trackingModes.batchDesc", icon: Layers },
];

// The wizard offers friendly tracking-mode choices, but the API expects an
// inventory profile. Map each tracking mode to its simplest matching profile.
const TRACKING_MODE_TO_PROFILE: Record<string, string> = {
    BULK: "SIMPLE_COUNT",
    INDIVIDUAL: "SERIALIZED",
    BATCH: "BATCH_TRACKED",
};

export const SetupWizard = () => {
    const { t } = useTranslation(["onboarding", "common"]);
    const navigate = useNavigate();
    const {
        wizard, setWizard, nextStep, prevStep, clearWizard,
        wizardLoading, wizardError, setWizardError,
        createProduct,
    } = useOnboarding();

    const trackingModeOptions = TRACKING_MODES.map((m) => ({
        value: m.value,
        label: t(m.labelKey),
        description: t(m.descKey),
        icon: m.icon,
    }));

    /* ── Handlers ──────────────────────────────────────────── */

    const handleProductSubmit = async () => {
        if (!wizard.productSku || !wizard.productName) return;
        setWizardError(null);
        try {
            const profile = TRACKING_MODE_TO_PROFILE[wizard.trackingMode] ?? "SIMPLE_COUNT";
            await createProduct(wizard.productSku, wizard.productName, profile);
            nextStep();
        } catch {
            // error already set in hook
        }
    };

    const handleFinish = () => {
        clearWizard();
        navigate("/");
    };

    /* ── Step 1: Welcome ───────────────────────────────────── */

    const renderWelcome = () => (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 text-center space-y-6">
            <div className="w-14 h-14 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mx-auto">
                <Sparkles size={28} />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-white">{t("wizard.welcomeTitle")}</h2>
                <p className="text-zinc-400 mt-2 max-w-md mx-auto">
                    {t("wizard.welcomeDesc")}
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-sm mx-auto">
                <div className="flex items-start gap-2 text-sm text-zinc-400">
                    <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                    <span>{t("wizard.warehouseCreated")}</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-zinc-400">
                    <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                    <span>{t("wizard.profilesAvailable")}</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-zinc-400">
                    <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                    <span>{t("wizard.apiKeyGenerated")}</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-zinc-400">
                    <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                    <span>{t("wizard.dashboardReady")}</span>
                </div>
            </div>

            <CardFooter className="border-t-0 flex flex-col items-center gap-3 pt-4">
                <Button size="lg" icon={ArrowRight} onClick={nextStep}>
                    {t("wizard.startCta")}
                </Button>
                <button
                    onClick={handleFinish}
                    className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                    {t("wizard.skipSetup")}
                </button>
            </CardFooter>
        </div>
    );

    /* ── Step 2: Create Product Model ──────────────────────── */

    const renderCreateProduct = () => (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-6">
            <div className="text-center">
                <div className="w-14 h-14 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Package size={28} />
                </div>
                <h2 className="text-2xl font-bold text-white">{t("wizard.createTitle")}</h2>
                <p className="text-zinc-400 mt-1">{t("wizard.createDesc")}</p>
            </div>

            {wizardError && (
                <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm">{wizardError}</div>
            )}

            <div className="space-y-4">
                <Input
                    label={t("wizard.sku")}
                    required
                    value={wizard.productSku}
                    onChange={(e) => setWizard({ productSku: e.target.value })}
                    placeholder={t("wizard.skuPlaceholder")}
                    className="font-mono"
                />

                <Input
                    label={t("wizard.productName")}
                    required
                    value={wizard.productName}
                    onChange={(e) => setWizard({ productName: e.target.value })}
                    placeholder={t("wizard.productNamePlaceholder")}
                />

                <Select
                    custom
                    label={t("wizard.trackingMode")}
                    value={wizard.trackingMode}
                    onChange={(val) => setWizard({ trackingMode: String(val) })}
                    options={trackingModeOptions}
                />
            </div>

            <div className="flex justify-between pt-2">
                <Button variant="ghost" icon={ArrowLeft} onClick={prevStep}>
                    {t("common:back")}
                </Button>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => { nextStep(); }}
                        className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        {t("common:skip")}
                    </button>
                    <Button
                        icon={ArrowRight}
                        loading={wizardLoading}
                        disabled={!wizard.productSku || !wizard.productName}
                        onClick={handleProductSubmit}
                    >
                        {t("wizard.createContinue")}
                    </Button>
                </div>
            </div>
        </div>
    );

    /* ── Step 3: Done ──────────────────────────────────────── */

    const renderDone = () => (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 text-center space-y-6">
            <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={28} />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-white">{t("wizard.doneTitle")}</h2>
                <p className="text-zinc-400 mt-2">
                    {t("wizard.doneDesc")}
                </p>
            </div>

            <div className="flex flex-col items-center gap-3 pt-4">
                <Button size="lg" onClick={handleFinish}>
                    {t("wizard.goToDashboard")}
                </Button>
                <button
                    onClick={() => { clearWizard(); navigate("/product-models/create"); }}
                    className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                    {t("wizard.createMore")}
                </button>
            </div>
        </div>
    );

    /* ── Step indicator ─────────────────────────────────────── */

    const renderStepIndicator = () => (
        <div className="flex items-center justify-center gap-3 mb-8">
            {STEPS.map((s, i) => {
                const isCurrent = wizard.step === s.num;
                const isDone = wizard.step > s.num;
                return (
                    <div key={s.num} className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <div className={[
                                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-150",
                                isCurrent
                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40"
                                    : isDone
                                        ? "bg-indigo-500/20 text-indigo-400"
                                        : "bg-zinc-800 text-zinc-500",
                            ].join(" ")}>
                                {isDone ? <CheckCircle2 size={14} /> : s.num}
                            </div>
                            <span className={[
                                "text-sm font-medium hidden sm:inline",
                                isCurrent ? "text-white" : isDone ? "text-indigo-400" : "text-zinc-500",
                            ].join(" ")}>
                                {t(s.labelKey)}
                            </span>
                        </div>
                        {i < STEPS.length - 1 && (
                            <div className={`w-10 h-0.5 transition-colors duration-150 ${isDone ? "bg-indigo-500" : "bg-zinc-800"}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );

    /* ── Layout ─────────────────────────────────────────────── */

    return (
        <div className="min-h-screen bg-zinc-950 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-950/20 via-zinc-950 to-zinc-950 flex items-center justify-center px-6 py-12">
            <div className="w-full max-w-lg">
                {renderStepIndicator()}
                <Card padding="lg">
                    <CardContent>
                        {wizard.step === 1 && renderWelcome()}
                        {wizard.step === 2 && renderCreateProduct()}
                        {wizard.step === 3 && renderDone()}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
