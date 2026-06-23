import { useState, useEffect } from "react";
import { Save, RefreshCw, Trash2 } from "lucide-react";
import YAML from "yaml";
import { PreviewWidget } from "./components/PreviewWidget";
import { PRESET_EXAMPLES } from "./constants/presetExamples";
import { useCalculatorTemplates } from "./useCalculatorTemplates";
import { getCategoryLabel } from "./utils";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Card, CardHeader, CardContent } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import type { BadgeVariant } from "../../../components/ui/Badge";
import { ConfirmDialog, useConfirmDialog } from "../../../components/ui/ConfirmDialog";
import type { CalculatorConfig, CalculatorTemplate } from "../types";

const CATEGORY_VARIANT: Record<string, BadgeVariant> = {
    TIME: "amber",
    LENGTH: "cyan",
    VOLUME: "info",
    WEIGHT: "emerald",
    EXPIRY: "rose",
    SERIAL: "rose",
    BATCH: "indigo",
    COUNTER: "neutral",
    CONVERTER: "primary",
};

export const ConfigPlayground = () => {
    const [yaml, setYaml] = useState(PRESET_EXAMPLES[0].yaml);
    const [parsed, setParsed] = useState<CalculatorConfig | null>(null);
    const [error, setError] = useState("");
    const { confirm, dialogProps } = useConfirmDialog();

    const {
        templates,
        saving,
        loadTemplates,
        saveTemplate,
        deleteTemplate
    } = useCalculatorTemplates();

    useEffect(() => {
        try {
            const obj = YAML.parse(yaml);
            setParsed(obj);
            setError("");
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [yaml]);

    useEffect(() => {
        loadTemplates();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSave = async () => {
        if (!parsed || error) return;
        await saveTemplate(parsed);
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (
            await confirm({
                title: "Delete Template",
                message: "Delete this calculator template?",
                variant: "danger",
                confirmLabel: "Delete",
            })
        ) {
            await deleteTemplate(id);
        }
    };

    const loadTemplate = (tmpl: CalculatorTemplate) => {
        const obj: CalculatorConfig = {
            name: tmpl.name,
            profile: tmpl.profile,
            engine: {
                type: tmpl.engine_type,
                config: tmpl.engine_config
            }
        };
        if (!obj.profile) delete obj.profile;
        setYaml(YAML.stringify(obj));
    };

    return (
        <div>
            <PageHeader
                title="Calculator Playground"
                subtitle="Design and test custom inventory calculators."
            />

            <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-200px)]">
                {/* Editor Column */}
                <div className="lg:w-1/2 flex flex-col gap-4">

                    {/* Presets */}
                    <Card padding="sm">
                        <CardContent className="!p-4">
                            <label className="block text-xs font-semibold uppercase text-zinc-500 mb-2">
                                Preset Configurations
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {PRESET_EXAMPLES.map((ex, i) => (
                                    <Button
                                        key={i}
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setYaml(ex.yaml)}
                                    >
                                        {ex.name}
                                    </Button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Code Editor */}
                    <Card padding="none" className="flex-1 flex flex-col relative">
                        <div className="absolute top-2 right-2 z-10">
                            <Badge variant={error ? "error" : "success"}>
                                {error ? "INVALID YAML" : "VALID YAML"}
                            </Badge>
                        </div>
                        <textarea
                            className="flex-1 w-full bg-transparent text-emerald-400 font-mono p-4 outline-none resize-none text-sm placeholder-zinc-700"
                            value={yaml}
                            onChange={e => setYaml(e.target.value)}
                            spellCheck={false}
                            placeholder="# YAML Configuration..."
                        />
                    </Card>
                    {error && (
                        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm font-mono p-3 rounded-lg">
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
                        <Button
                            variant="primary"
                            icon={Save}
                            onClick={handleSave}
                            disabled={!!error || saving}
                            loading={saving}
                            className="flex-1"
                        >
                            Save Template
                        </Button>
                    </div>

                    {/* Saved Templates */}
                    <Card padding="none" className="flex-1 overflow-hidden flex flex-col min-h-[200px]">
                        <CardHeader className="flex justify-between items-center">
                            <h3 className="font-semibold text-zinc-400 uppercase text-xs">
                                Saved Templates
                            </h3>
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={RefreshCw}
                                onClick={loadTemplates}
                            >
                                Refresh
                            </Button>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-y-auto space-y-2 !py-3">
                            {templates.map(t => {
                                const cat = getCategoryLabel(t);
                                const variant = CATEGORY_VARIANT[cat as string] ?? ("slate" as BadgeVariant);

                                return (
                                    <div
                                        key={t.id}
                                        onClick={() => loadTemplate(t)}
                                        className="cursor-pointer group flex justify-between items-center p-3 rounded-lg bg-zinc-950/60 border border-white/[0.04] hover:border-white/[0.1] hover:bg-zinc-900 transition-colors"
                                    >
                                        <span className="font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors">
                                            {t.name}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <Badge variant={variant}>
                                                {cat}
                                            </Badge>
                                            <button
                                                onClick={(e) => handleDelete(t.id, e)}
                                                className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                                title="Delete Template"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {templates.length === 0 && (
                                <div className="text-center py-8 text-zinc-600 italic text-sm">
                                    No templates saved.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Preview Column */}
                <Card padding="none" className="lg:w-1/2 relative flex items-center justify-center p-8 bg-zinc-100 dark:bg-zinc-100">
                    <div className="absolute top-4 right-4">
                        <Badge variant="neutral">LIVE PREVIEW</Badge>
                    </div>
                    {parsed ? (
                        <div className="animate-fadeIn">
                            <PreviewWidget config={parsed} />
                        </div>
                    ) : (
                        <div className="text-zinc-500 font-mono text-sm border border-zinc-300 p-4 rounded-lg border-dashed">
                            // Invalid Configuration
                        </div>
                    )}
                </Card>
            </div>

            <ConfirmDialog {...dialogProps} />
        </div>
    );
};
