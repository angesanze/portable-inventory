import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, ShieldCheck, ExternalLink } from "lucide-react";

import { PageHeader } from "../../../components/ui/PageHeader";
import { Card, CardContent } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/Toast";
import { useCapabilities } from "../../../hooks/useCapabilities";
import { axiosInstance } from "../../../providers/axios-client";
import { API_URL } from "../../../config";

/**
 * Settings → Esporta dati azienda (PLATFORM-API-10, Fase 4).
 *
 * Pulls the effective company's full GDPR export as a streamed ZIP and triggers
 * a browser download. The auth + X-Acting-Company headers are injected by the
 * shared axios interceptor, so a developer impersonating a child tenant exports
 * that child's data automatically. The endpoint is rate-limited to 1/hour; a
 * 429 surfaces as a friendly toast rather than a generic failure.
 */
export const CompanyDataExport: React.FC = () => {
    const { t } = useTranslation(["settings", "common"]);
    const { toast } = useToast();
    const { account_type } = useCapabilities();
    const [loading, setLoading] = useState(false);

    const isDeveloper = account_type === "developer";

    const handleExport = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get(`${API_URL}/api/v1/platform/export/`, {
                responseType: "blob",
            });
            const blob = new Blob([res.data], { type: "application/zip" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `export-${new Date().toISOString().slice(0, 10)}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast({ message: t("settings:export.success"), variant: "success" });
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            const message =
                status === 429 ? t("settings:export.rateLimited") : t("settings:export.error");
            toast({ message, variant: "error" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader title={t("settings:export.title")} subtitle={t("settings:export.subtitle")} />

            <Card>
                <CardContent className="space-y-4">
                    <div className="flex items-start gap-3">
                        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />
                        <p className="text-sm text-zinc-400">{t("settings:export.description")}</p>
                    </div>
                    <Button icon={Download} loading={loading} onClick={handleExport}>
                        {t("settings:export.button")}
                    </Button>
                </CardContent>
            </Card>

            {isDeveloper && (
                <Card>
                    <CardContent className="space-y-3">
                        <h2 className="text-sm font-medium text-zinc-200">
                            {t("settings:export.docsTitle")}
                        </h2>
                        <p className="text-sm text-zinc-400">{t("settings:export.docsBody")}</p>
                        <a
                            href={`${API_URL}/api/docs/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 hover:text-emerald-300"
                        >
                            <ExternalLink className="h-4 w-4" />
                            {t("settings:export.docsLink")}
                        </a>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};
