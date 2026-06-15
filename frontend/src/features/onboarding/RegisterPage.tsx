import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Building2, Mail, Lock, Receipt, Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOnboarding } from "./useOnboarding";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import type { SelectOption } from "../../components/ui/Select";
import { BRAND_NAME } from "../../config";

const INDUSTRY_VALUES = [
    "manufacturing",
    "retail",
    "food_beverage",
    "electronics",
    "logistics",
    "healthcare",
    "other",
] as const;

export const RegisterPage = () => {
    const { t } = useTranslation(["onboarding", "common"]);
    const navigate = useNavigate();
    const { register, isRegistering, registerError } = useOnboarding();
    const { toast } = useToast();

    const industryOptions: SelectOption[] = INDUSTRY_VALUES.map((value) => ({
        value,
        label: t(`register.industries.${value}`),
    }));

    const [companyName, setCompanyName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [vat, setVat] = useState("");
    const [industryType, setIndustryType] = useState("other");
    const [licenseCode, setLicenseCode] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const result = await register({
            company_name: companyName,
            admin_email: email,
            admin_password: password,
            industry_type: industryType,
            vat,
        });
        if (result) {
            // Reveal the generated license code before continuing — the user
            // needs it to log in, and it is not shown anywhere else.
            setLicenseCode(result.company.license_code);
        }
    };

    const copyLicense = () => {
        if (!licenseCode) return;
        navigator.clipboard.writeText(licenseCode);
        toast({ message: t("register.licenseCopied"), variant: "success" });
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-950/20 via-zinc-950 to-zinc-950">
            <Card className="w-full max-w-sm" padding="lg">
                <div className="text-center mb-6">
                    <h1 className="text-xl font-semibold text-zinc-50">
                        {BRAND_NAME}
                    </h1>
                    <p className="mt-1 text-sm text-zinc-400">
                        {t("register.subtitle")}
                    </p>
                </div>

                {licenseCode ? (
                    <div className="space-y-6">
                        <div className="text-center space-y-3">
                            <div className="w-14 h-14 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto">
                                <Check size={28} />
                            </div>
                            <h2 className="text-lg font-semibold text-zinc-50">
                                {t("register.successTitle")}
                            </h2>
                            <p className="text-sm text-zinc-400">
                                {t("register.saveLicenseNote")}
                            </p>
                        </div>

                        <div>
                            <span className="block text-sm font-medium text-zinc-300 mb-1.5">
                                {t("register.licenseCodeLabel")}
                            </span>
                            <div className="p-4 bg-zinc-950 border border-amber-500/30 rounded-lg flex items-center justify-between gap-4">
                                <code className="text-amber-400 font-mono text-lg break-all text-left">
                                    {licenseCode}
                                </code>
                                <button
                                    type="button"
                                    onClick={copyLicense}
                                    className="p-2 text-zinc-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                                    title={t("register.copyLicense")}
                                    aria-label={t("register.copyLicense")}
                                >
                                    <Copy size={20} />
                                </button>
                            </div>
                        </div>

                        <Button
                            type="button"
                            onClick={() => navigate("/setup")}
                            className="w-full"
                            size="lg"
                        >
                            {t("register.continueToSetup")}
                        </Button>
                    </div>
                ) : (
                    <>
                {registerError && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                        {registerError}
                    </div>
                )}

                <form className="space-y-4" onSubmit={handleSubmit}>
                    <Input
                        label={t("register.companyName")}
                        type="text"
                        icon={Building2}
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder={t("register.companyPlaceholder")}
                        required
                        minLength={2}
                    />

                    <Input
                        label={t("register.adminEmail")}
                        type="email"
                        icon={Mail}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t("register.adminEmailPlaceholder")}
                        required
                    />

                    <Input
                        label={t("register.password")}
                        type="password"
                        icon={Lock}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t("register.passwordPlaceholder")}
                        required
                        minLength={8}
                    />

                    <Input
                        label={t("register.vat")}
                        type="text"
                        icon={Receipt}
                        value={vat}
                        onChange={(e) => setVat(e.target.value)}
                        placeholder={t("register.vatPlaceholder")}
                        required
                    />

                    <Select
                        label={t("register.industry")}
                        options={industryOptions}
                        value={industryType}
                        onChange={(val) => setIndustryType(String(val))}
                    />

                    <Button
                        type="submit"
                        loading={isRegistering}
                        className="w-full"
                        size="lg"
                    >
                        {t("register.createAccount")}
                    </Button>
                </form>

                <p className="mt-6 text-center text-sm text-zinc-400">
                    {t("register.hasAccount")}{" "}
                    <Link
                        to="/login"
                        className="text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                        {t("register.signIn")}
                    </Link>
                </p>
                    </>
                )}
            </Card>
        </div>
    );
};
