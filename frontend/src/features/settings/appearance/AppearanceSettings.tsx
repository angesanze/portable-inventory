import React from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";

import { PageHeader } from "../../../components/ui/PageHeader";
import { Card, CardContent } from "../../../components/ui/Card";
import { useThemePalette } from "../../../theme/useTheme";

/**
 * Settings → Appearance. Lets the user pick a named accent palette. The choice
 * applies app-wide immediately (Tailwind `indigo-*` utilities read the
 * `--accent-*` CSS vars set by {@link useThemePalette}) and is persisted to
 * localStorage. Neutrals and semantic status colors are intentionally untouched.
 */
export const AppearanceSettings: React.FC = () => {
    const { t } = useTranslation(["settings", "common"]);
    const { palettes, paletteId, setPalette } = useThemePalette();

    return (
        <div className="space-y-6">
            <PageHeader
                title={t("settings:appearance.title")}
                subtitle={t("settings:appearance.subtitle")}
            />

            <Card>
                <CardContent className="space-y-5">
                    <p className="text-sm text-zinc-400">{t("settings:appearance.description")}</p>

                    <div
                        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                        role="radiogroup"
                        aria-label={t("settings:appearance.title")}
                    >
                        {palettes.map((palette) => {
                            const selected = palette.id === paletteId;
                            return (
                                <button
                                    key={palette.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() => setPalette(palette.id)}
                                    data-testid={`palette-${palette.id}`}
                                    className={`group rounded-xl border p-4 text-left transition-all ${
                                        selected
                                            ? "border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500/40"
                                            : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                                    }`}
                                >
                                    <div className="mb-3 flex items-center justify-between">
                                        <span className="text-sm font-medium text-zinc-100">
                                            {t(`settings:appearance.palettes.${palette.id}`)}
                                        </span>
                                        {selected && (
                                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-white">
                                                <Check className="h-3 w-3" strokeWidth={3} />
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-1.5">
                                        {palette.swatches.map((hex, i) => (
                                            <span
                                                key={i}
                                                className="h-8 flex-1 rounded-md ring-1 ring-inset ring-white/5"
                                                style={{ backgroundColor: hex }}
                                            />
                                        ))}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
