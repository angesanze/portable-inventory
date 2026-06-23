import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Layers } from "lucide-react";
import { useDefaultApiKey } from "../../../hooks/useDefaultApiKey";
import { API_URL } from "../../../config";
import { PageHeader } from "../../../components/ui/PageHeader";
import { DismissableHint } from "../../../components/ui/DismissableHint";
import { Card, CardHeader, CardContent } from "../../../components/ui/Card";
import { Select, type SelectOption } from "../../../components/ui/Select";
import type { WidgetProductSummary, WidgetListResponse } from "../types";

interface PreviewProduct {
    id: string;
    name: string;
    sku?: string;
    poly?: boolean;
}

/**
 * Manager-safe widget preview: pick a product and exercise the live widget.
 * Deliberately omits every developer surface present in `WidgetGenerator`
 * (API-key picker, embed/iframe snippet, curl/fetch blocks, "Run Request"
 * GET/POST simulation, QR tiles) — see CLEANUP-04. It only needs the company's
 * single default key (read-only, no `GET /api-keys` 403 for managers) plus the
 * public widget endpoints, gated by `view_widget_preview`.
 */
export const WidgetPreview = () => {
    const { t } = useTranslation(["settings", "common"]);

    // Same hook the QR-codes page uses for the manager's default key — no
    // hardcoded key, no key-management surface (DUAL-TIER-09).
    const { apiKey: defaultKey, isLoading: keyLoading } = useDefaultApiKey();
    const key = defaultKey?.key ?? "";

    const [products, setProducts] = useState<PreviewProduct[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState("");

    // Fetch products via the public widget endpoint, mirroring `ProductQRList`
    // / `useWidgetData` (standard + polymorphic products concatenated).
    useEffect(() => {
        if (!key) return;
        let cancelled = false;
        // Standard fetch-then-setState: flag loading before the async request and
        // clear it (plus populate products) in the settled handlers below.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoadingProducts(true);
        fetch(`${API_URL}/api/v1/widget/`, { headers: { "X-Api-Key": key } })
            .then((res) => res.json() as Promise<WidgetListResponse>)
            .then((data) => {
                if (cancelled) return;
                const std: PreviewProduct[] = (Array.isArray(data.products) ? data.products : []).map(
                    (p: WidgetProductSummary) => ({ id: String(p.id), name: p.name, sku: p.sku, poly: false }),
                );
                const poly: PreviewProduct[] = (Array.isArray(data.poly_products) ? data.poly_products : []).map(
                    (p: WidgetProductSummary) => ({ id: String(p.id), name: p.name, poly: true }),
                );
                setProducts(std.concat(poly));
            })
            .catch(() => {
                if (!cancelled) setProducts([]);
            })
            .finally(() => {
                if (!cancelled) setLoadingProducts(false);
            });
        return () => {
            cancelled = true;
        };
    }, [key]);

    const productOptions: SelectOption[] = products.map((p) => ({
        value: p.id,
        label: p.sku ? `${p.name} (${p.sku})` : p.name,
    }));

    const selected = products.find((p) => p.id === selectedProduct);

    // Live preview iframe — same `/widget?api_key=&product_id=` pattern as the
    // generator; polymorphic products use their `/p-widget/:id` public route.
    const previewUrl =
        key && selected
            ? selected.poly
                ? `${window.location.origin}/p-widget/${selected.id}?api_key=${key}`
                : `${window.location.origin}/widget?api_key=${key}&product_id=${selected.id}`
            : "";

    return (
        <div>
            <PageHeader
                title={t("settings:widgetPreview.title")}
                subtitle={t("settings:widgetPreview.subtitle")}
            />

            <DismissableHint id="widget-preview-intro" className="mb-6">
                {t("settings:widgetPreview.hint")}
            </DismissableHint>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: product selector */}
                <div className="lg:col-span-1 space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4 text-zinc-400" strokeWidth={2} />
                                <h2 className="text-sm font-medium text-zinc-200">
                                    {t("settings:widgetPreview.selectProductLabel")}
                                </h2>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Select
                                custom
                                value={selectedProduct}
                                onChange={(val) => setSelectedProduct(String(val))}
                                disabled={loadingProducts || keyLoading || products.length === 0}
                                placeholder={
                                    loadingProducts || keyLoading
                                        ? t("settings:widgetPreview.loadingProducts")
                                        : products.length === 0
                                          ? t("settings:widgetPreview.noProducts")
                                          : t("settings:widgetPreview.selectProductPlaceholder")
                                }
                                options={productOptions}
                            />
                            <p className="mt-1.5 text-xs text-zinc-500">
                                {t("settings:widgetPreview.selectProductHelp")}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Right: live preview */}
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardHeader>
                            <h2 className="text-sm font-medium text-zinc-200">
                                {t("settings:widgetPreview.livePreview")}
                            </h2>
                        </CardHeader>
                        <CardContent>
                            {previewUrl ? (
                                <iframe
                                    title={t("settings:widgetPreview.livePreview")}
                                    src={previewUrl}
                                    width="100%"
                                    height="600"
                                    className="rounded-lg border border-white/[0.06]"
                                />
                            ) : (
                                <div className="h-48 flex items-center justify-center text-zinc-500 border border-dashed border-white/[0.06] rounded-lg text-sm">
                                    {t("settings:widgetPreview.selectProductToPreview")}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};
