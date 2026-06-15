import { useLogin, useIsAuthenticated } from "@refinedev/core";
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { FormErrorBanner } from "../../components/ui/ErrorState";
import { Mail, Lock, KeyRound } from "lucide-react";
import { BRAND_NAME } from "../../config";

export const Login = () => {
    const { t } = useTranslation(["onboarding", "common"]);
    const { mutate: login, isPending: isLoading, error } = useLogin();
    const { data: authData } = useIsAuthenticated();
    const navigate = useNavigate();

    useEffect(() => {
        if (authData?.authenticated) {
            navigate("/");
        }
    }, [authData, navigate]);

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [licenseCode, setLicenseCode] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        login({ username, password, license_code: licenseCode });
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-950/20 via-zinc-950 to-zinc-950">
            <Card className="w-full max-w-sm" padding="lg">
                <div className="text-center mb-6">
                    <div className="flex items-center justify-center gap-2.5 mb-3">
                        <img
                            src="/shed-logo.png"
                            alt={BRAND_NAME}
                            className="w-11 h-11 rounded-xl flex-none object-contain"
                        />
                        <h1 className="text-xl font-bold text-zinc-50 tracking-wide">
                            {BRAND_NAME}
                        </h1>
                    </div>
                    <p className="text-sm text-zinc-400">
                        {t("login.subtitle")}
                    </p>
                </div>

                {error && (
                    <FormErrorBanner error={error} title={t("login.errorTitle")} />
                )}

                <form className="space-y-4" onSubmit={handleSubmit}>
                    <Input
                        label={t("login.email")}
                        type="text"
                        icon={Mail}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder={t("login.emailPlaceholder")}
                        required
                    />

                    <Input
                        label={t("login.password")}
                        type="password"
                        icon={Lock}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t("login.passwordPlaceholder")}
                        required
                    />

                    <Input
                        label={t("login.licenseCode")}
                        type="text"
                        icon={KeyRound}
                        value={licenseCode}
                        onChange={(e) => setLicenseCode(e.target.value)}
                        placeholder={t("login.licenseCodePlaceholder")}
                        required
                    />

                    <Button
                        type="submit"
                        loading={isLoading}
                        className="w-full"
                        size="lg"
                    >
                        {t("login.signIn")}
                    </Button>
                </form>

                <p className="mt-6 text-center text-sm text-zinc-400">
                    {t("login.noAccount")}{" "}
                    <Link
                        to="/register"
                        className="text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                        {t("login.register")}
                    </Link>
                </p>
            </Card>
        </div>
    );
};
