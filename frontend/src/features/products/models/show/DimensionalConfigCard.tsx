import { useTranslation } from "react-i18next";
import { Ruler } from "lucide-react";
import { Card } from "../../../../components/ui/Card";
import { KeyValueGrid } from "../../../../components/ui/KeyValueGrid";

/** Coerce an unknown config value to a display string (empty when absent). */
function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

/** Coerce an unknown config value to a string[] of dimension labels. */
function asStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((v) => (typeof v === "string" ? v : String(v)));
}

/**
 * DIMENSIONAL profile card: configured dimensions/unit/formula plus the
 * current computed measure derived from the stock total.
 */
export function DimensionalConfigCard({
    engineConfig,
    stockTotal,
}: {
    engineConfig: Record<string, unknown> | undefined;
    stockTotal: number | undefined;
}) {
    const { t } = useTranslation("products");
    const dimensions = asStringList(engineConfig?.dimensions);
    const unit = asString(engineConfig?.unit);
    const computedUnit = asString(engineConfig?.computed_unit) || unit;
    const formula = asString(engineConfig?.formula);

    const formattedTotal = (() => {
        if (stockTotal === undefined || stockTotal === null) return null;
        const val = Number(stockTotal);
        if (!Number.isFinite(val) || val === 0) return null;
        const text = val === Math.trunc(val) ? `${val}` : val.toFixed(2);
        return `${text} ${computedUnit}`.trim();
    })();

    return (
        <Card
            header={
                <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                    <Ruler size={16} className="text-indigo-400" />
                    {t("dimensionalConfig")}
                </h3>
            }
        >
            <KeyValueGrid
                items={[
                    {
                        label: t("dimensionsLabel"),
                        value: dimensions.length > 0
                            ? dimensions.join(" × ")
                            : undefined,
                    },
                    {
                        label: t("baseUnit"),
                        value: unit || undefined,
                    },
                    {
                        label: t("computedUnit"),
                        value: computedUnit || undefined,
                    },
                    {
                        label: t("formula"),
                        value: formula
                            ? <code className="font-mono text-indigo-300">{formula}</code>
                            : undefined,
                        span: 3,
                    },
                ]}
            />
            <div className="mt-4 p-3 bg-white/5 rounded-lg">
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    {t("currentMeasure")}
                </div>
                {formattedTotal ? (
                    <span className="text-2xl font-bold text-zinc-50 font-mono">
                        {formattedTotal}
                    </span>
                ) : (
                    <span className="text-sm text-zinc-500 italic">
                        {t("noMeasurementYet")}
                    </span>
                )}
            </div>
        </Card>
    );
}
