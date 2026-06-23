import { useList, useGetIdentity } from "@refinedev/core";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../../hooks/useCapabilities";
import { QRCodeSVG } from 'qrcode.react';
import { Code, Play, Copy, Layers } from "lucide-react";
import { Select } from "../../../components/ui/Select";
import { PageHeader } from "../../../components/ui/PageHeader";
import { DismissableHint } from "../../../components/ui/DismissableHint";
import { Card, CardHeader, CardContent } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { API_URL } from "../../../config";
import { PROFILE_METADATA } from "../../../types/api";
import type { InventoryProfile } from "../../../types/api";
import type { WidgetProductSummary, WidgetListResponse } from "../types";

/** An API-key row from `GET /api-keys` (refine list resource), used to populate
 *  the key picker and build the embed/QR URLs. */
interface ApiKeyRow {
    key: string;
    label: string;
    company?: { name?: string };
    company_name?: string;
}

export const WidgetGenerator = () => {
    const { t } = useTranslation(["settings", "common"]);
    const { data: identity } = useGetIdentity<{ name: string; email: string; company?: { name: string } }>();
    // This screen is developer-only via routing/resource gating; gate the key
    // listing on the capability too as defense-in-depth so a manager who ever
    // reaches it never triggers the `GET /api-keys` 403 (DUAL-TIER-09).
    const { capabilities } = useCapabilities();
    const { data: keysData, isLoading: keysLoading } = useList<ApiKeyRow>({
        resource: "api-keys",
        queryOptions: { enabled: capabilities.manage_api_keys },
    });

    const keys: ApiKeyRow[] = Array.isArray(keysData?.data) ? keysData.data : [];

    const [selectedKey, setSelectedKey] = useState<string>("");
    const [activeTab, setActiveTab] = useState<"embed" | "api">("embed");
    const [jsonPreview, setJsonPreview] = useState<string | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);

    useEffect(() => {
        if (keys.length > 0 && !selectedKey) {
            setSelectedKey(keys[0].key);
        }
    }, [keys, selectedKey]);

    const apiUrl = `${API_URL}/api/v1`;
    const widgetUrl = `${window.location.origin}/widget?api_key=${selectedKey}`;
    const endpointUrl = `${apiUrl}/widget/?api_key=${selectedKey}`;

    const iframeCode = `<iframe\n  src="${widgetUrl}"\n  width="100%"\n  height="700"\n  frameborder="0"\n  style="border-radius: 12px;"\n></iframe>`;

    const curlCommand = `curl -X GET "${endpointUrl}" \\\n  -H "Accept: application/json"`;

    const fetchCode = `fetch("${endpointUrl}")\n  .then(res => res.json())\n  .then(data => console.log(data));`;

    const copyToClipboard = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 1500);
    };

    const fetchLivePreview = async () => {
        if (!selectedKey) return;
        setLoadingPreview(true);
        try {
            const res = await fetch(endpointUrl);
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                const data = await res.json();
                if (!res.ok) {
                    setJsonPreview(JSON.stringify({ error: `HTTP ${res.status}`, body: data }, null, 2));
                } else {
                    setJsonPreview(JSON.stringify(data, null, 2));
                }
            } else {
                const text = await res.text();
                setJsonPreview(`// Non-JSON response (Status: ${res.status})\n\n${text.substring(0, 2000)}`);
            }
        } catch (err) {
            const details = err instanceof Error ? err.message : undefined;
            setJsonPreview(JSON.stringify({ error: "Fetch failed", details }, null, 2));
        } finally {
            setLoadingPreview(false);
        }
    };

    const subtitle = identity?.company?.name
        ? t("settings:widgetGenerator.subtitleTenant", { name: identity.company.name })
        : t("settings:widgetGenerator.subtitleAdmin");

    return (
        <div>
            <PageHeader
                title={t("settings:widgetGenerator.title")}
                subtitle={subtitle}
            />

            <DismissableHint id="widget-generator-intro" className="mb-6">
                {t("settings:widgetGenerator.hint")}
            </DismissableHint>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Configuration */}
                <div className="lg:col-span-1 space-y-4">
                    <Card>
                        <CardHeader>
                            <h2 className="text-sm font-medium text-zinc-200">{t("settings:widgetGenerator.configuration")}</h2>
                        </CardHeader>
                        <CardContent>
                            <div>
                                <label className="block text-xs font-medium text-zinc-400 mb-1.5">{t("settings:widgetGenerator.apiKeyLabel")}</label>
                                <Select
                                    custom
                                    value={selectedKey}
                                    onChange={(val) => setSelectedKey(String(val))}
                                    disabled={keysLoading}
                                    placeholder={keysLoading ? t("settings:widgetGenerator.loadingKeys") : t("settings:widgetGenerator.selectKey")}
                                    options={keysLoading ? [] : keys.map((key) => ({
                                        value: key.key,
                                        label: `${key.label} — ${key.company?.name || key.company_name || 'Unknown'}`,
                                        description: `(${key.key.substring(0, 8)}...)`,
                                    }))}
                                />
                                <p className="mt-1.5 text-xs text-zinc-500">
                                    {t("settings:widgetGenerator.keyGrantsAccess")}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <h2 className="text-sm font-medium text-zinc-200">{t("settings:widgetGenerator.deploymentMode")}</h2>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => setActiveTab("embed")}
                                    className={`px-3 py-2.5 rounded-lg text-left text-sm transition-colors border ${
                                        activeTab === "embed"
                                            ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                                            : "bg-transparent border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                                    }`}
                                >
                                    <div className="font-medium">{t("settings:widgetGenerator.warehouseApp")}</div>
                                    <div className="text-xs mt-0.5 opacity-70">{t("settings:widgetGenerator.embedViaIframe")}</div>
                                </button>
                                <button
                                    onClick={() => setActiveTab("api")}
                                    className={`px-3 py-2.5 rounded-lg text-left text-sm transition-colors border ${
                                        activeTab === "api"
                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                            : "bg-transparent border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                                    }`}
                                >
                                    <div className="font-medium">{t("settings:widgetGenerator.apiDeveloper")}</div>
                                    <div className="text-xs mt-0.5 opacity-70">{t("settings:widgetGenerator.directApiAccess")}</div>
                                </button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right: Preview panel */}
                <div className="lg:col-span-2 space-y-4">
                    {activeTab === "embed" && (
                        <>
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center gap-2">
                                        <Code className="w-4 h-4 text-zinc-400" strokeWidth={2} />
                                        <h2 className="text-sm font-medium text-zinc-200">{t("settings:widgetGenerator.embedCode")}</h2>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative group">
                                        <pre className="bg-zinc-950 border border-white/[0.06] rounded-lg p-4 overflow-x-auto text-zinc-300 font-mono text-xs leading-relaxed">
                                            {iframeCode}
                                        </pre>
                                        <button
                                            onClick={() => copyToClipboard(iframeCode, "iframe")}
                                            className="absolute top-2 right-2 flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-2.5 py-1 rounded opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <Copy className="w-3 h-3" />
                                            {copied === "iframe" ? t("settings:widgetGenerator.copied") : t("settings:widgetGenerator.copy")}
                                        </button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <h2 className="text-sm font-medium text-zinc-200">{t("settings:widgetGenerator.livePreview")}</h2>
                                </CardHeader>
                                <CardContent>
                                    {selectedKey ? (
                                        <iframe
                                            src={widgetUrl}
                                            width="100%"
                                            height="600"
                                            className="rounded-lg border border-white/[0.06]"
                                        />
                                    ) : (
                                        <div className="h-48 flex items-center justify-center text-zinc-500 border border-dashed border-white/[0.06] rounded-lg text-sm">
                                            {t("settings:widgetGenerator.selectKeyToPreview")}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </>
                    )}

                    {activeTab === "api" && (
                        <>
                            <Card>
                                <CardHeader>
                                    <h2 className="text-sm font-medium text-zinc-200">{t("settings:widgetGenerator.apiRequest")}</h2>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-5">
                                        <div>
                                            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5 block">{t("settings:widgetGenerator.endpointLabel")}</label>
                                            <div className="flex items-center gap-2">
                                                <code className="flex-1 bg-zinc-950 border border-white/[0.06] px-3 py-2 rounded-lg text-emerald-400 font-mono text-xs truncate">
                                                    GET {endpointUrl}
                                                </code>
                                                <button
                                                    onClick={() => copyToClipboard(endpointUrl, "endpoint")}
                                                    className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors flex-shrink-0"
                                                    title={t("settings:widgetGenerator.copy")}
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5 block">{t("settings:widgetGenerator.curlLabel")}</label>
                                            <div className="relative group">
                                                <pre className="bg-zinc-950 border border-white/[0.06] p-4 rounded-lg text-zinc-300 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                                                    {curlCommand}
                                                </pre>
                                                <button
                                                    onClick={() => copyToClipboard(curlCommand, "curl")}
                                                    className="absolute top-2 right-2 flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-2.5 py-1 rounded opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <Copy className="w-3 h-3" />
                                                    {copied === "curl" ? t("settings:widgetGenerator.copied") : t("settings:widgetGenerator.copy")}
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5 block">{t("settings:widgetGenerator.jsFetchLabel")}</label>
                                            <div className="relative group">
                                                <pre className="bg-zinc-950 border border-white/[0.06] p-4 rounded-lg text-indigo-300 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                                                    {fetchCode}
                                                </pre>
                                                <button
                                                    onClick={() => copyToClipboard(fetchCode, "fetch")}
                                                    className="absolute top-2 right-2 flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-2.5 py-1 rounded opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <Copy className="w-3 h-3" />
                                                    {copied === "fetch" ? t("settings:widgetGenerator.copied") : t("settings:widgetGenerator.copy")}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-sm font-medium text-zinc-200">{t("settings:widgetGenerator.responsePreview")}</h2>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            icon={Play}
                                            loading={loadingPreview}
                                            disabled={!selectedKey}
                                            onClick={fetchLivePreview}
                                        >
                                            {t("settings:widgetGenerator.runRequest")}
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="bg-zinc-950 border border-white/[0.06] rounded-lg p-4 h-72 overflow-y-auto font-mono text-xs">
                                        {jsonPreview ? (
                                            <pre className="text-emerald-400 whitespace-pre-wrap">{jsonPreview}</pre>
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-2">
                                                <Play className="w-6 h-6 opacity-40" />
                                                <p>{t("settings:widgetGenerator.runRequestHint")}</p>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </div>

                {/* QR Codes — full width */}
                {selectedKey && (
                    <div className="col-span-1 lg:col-span-3">
                        <div className="border-t border-white/[0.06] pt-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Layers className="w-4 h-4 text-zinc-400" strokeWidth={2} />
                                <h2 className="text-sm font-medium text-zinc-200">{t("settings:widgetGenerator.productQrCodes")}</h2>
                            </div>
                            <ProductQRList apiKey={selectedKey} widgetBaseUrl={window.location.origin + '/widget'} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const ProductQRList = ({ apiKey, widgetBaseUrl }: { apiKey: string; widgetBaseUrl: string }) => {
    const { t } = useTranslation(["settings", "common"]);
    const [products, setProducts] = useState<WidgetProductSummary[]>([]);
    const [polyProducts, setPolyProducts] = useState<WidgetProductSummary[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchProducts = async () => {
            setLoading(true);
            try {
                const res = await fetch(`${API_URL}/api/v1/widget/?api_key=${apiKey}`);
                const data: WidgetListResponse = await res.json();
                setProducts(data.products || []);
                setPolyProducts(data.poly_products || []);
            } catch (err) {
                console.error("Failed to fetch products for QR", err);
            } finally {
                setLoading(false);
            }
        };
        fetchProducts();
    }, [apiKey]);

    if (loading) {
        return <div className="text-zinc-500 text-sm py-4">{t("settings:widgetGenerator.loadingProducts")}</div>;
    }

    return (
        <div className="space-y-8">
            {polyProducts.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{t("settings:widgetGenerator.polymorphicWidgets")}</h3>
                        <Badge variant="indigo">{polyProducts.length}</Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {polyProducts.map(p => {
                            const url = `${window.location.origin}/p-widget/${p.id}?api_key=${apiKey}`;
                            return (
                                <div key={p.id} className="bg-zinc-900/80 border border-white/[0.06] rounded-xl p-4 flex flex-col items-center text-center hover:border-white/[0.1] transition-colors">
                                    <div className="bg-white p-2 rounded-lg mb-3">
                                        <QRCodeSVG value={url} size={96} />
                                    </div>
                                    <div className="text-xs font-medium text-zinc-200 leading-tight mb-1">{p.name}</div>
                                    <Badge variant="indigo">{PROFILE_METADATA[p.profile as InventoryProfile]?.label ?? p.profile}</Badge>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {products.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{t("settings:widgetGenerator.standardWidgets")}</h3>
                        <Badge variant="neutral">{products.length}</Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {products.map(p => {
                            const url = `${widgetBaseUrl}?api_key=${apiKey}&product_id=${p.id}`;
                            return (
                                <div key={p.id} className="bg-zinc-900/80 border border-white/[0.06] rounded-xl p-4 flex flex-col items-center text-center hover:border-white/[0.1] transition-colors">
                                    <div className="bg-white p-2 rounded-lg mb-3">
                                        <QRCodeSVG value={url} size={96} />
                                    </div>
                                    <div className="text-xs font-medium text-zinc-200 leading-tight mb-1">{p.name}</div>
                                    <div className="text-[10px] font-mono text-zinc-500">{p.sku}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {products.length === 0 && polyProducts.length === 0 && (
                <div className="text-zinc-500 text-sm py-4">{t("settings:widgetGenerator.noProductsForKey")}</div>
            )}
        </div>
    );
};
