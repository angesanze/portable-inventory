import { useState, useEffect, useRef, useCallback } from "react";
import { Loader, CheckCircle, AlertTriangle, XCircle, FlaskConical } from "lucide-react";
import { axiosInstance } from "../../../providers/axios-client";
import { API_URL } from "../../../config";

interface FormulaPreviewProps {
    engineType: string;
    engineConfig: Record<string, any>;
}

interface ValidationResult {
    valid: boolean;
    errors: string[];
    preview?: {
        sample_input: Record<string, any>;
        sample_output: string;
    };
}

export const FormulaPreview = ({ engineType, engineConfig }: FormulaPreviewProps) => {
    const [result, setResult] = useState<ValidationResult | null>(null);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();
    const abortRef = useRef<AbortController>();

    const validate = useCallback(async (type: string, config: Record<string, any>) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        try {
            const apiBase = API_URL.endsWith("/") ? API_URL.slice(0, -1) : API_URL;
            const { data } = await axiosInstance.post<ValidationResult>(
                `${apiBase}/api/v1/calculators/validate/`,
                { engine_type: type, engine_config: config },
                { signal: controller.signal },
            );
            setResult(data);
        } catch (err: any) {
            if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
            setResult({
                valid: false,
                errors: [err?.response?.data?.errors?.[0] || "Validation request failed"],
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        clearTimeout(debounceRef.current);

        // Skip validation if config is empty
        const hasContent = Object.keys(engineConfig).length > 0;
        if (!hasContent) {
            setResult(null);
            return;
        }

        debounceRef.current = setTimeout(() => {
            validate(engineType, engineConfig);
        }, 600);

        return () => clearTimeout(debounceRef.current);
    }, [engineType, engineConfig, validate]);

    // Cleanup abort on unmount
    useEffect(() => () => abortRef.current?.abort(), []);

    if (!result && !loading) return null;

    return (
        <div className="mt-4 rounded-lg border border-white/[0.06] bg-zinc-950/60 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-zinc-900/50">
                <FlaskConical size={14} className="text-zinc-400" />
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    Config Preview
                </span>
                {loading && <Loader size={12} className="animate-spin text-zinc-500 ml-auto" />}
            </div>

            <div className="p-4 space-y-3">
                {/* Status badge */}
                {result && !loading && (
                    <div className="flex items-center gap-2">
                        {result.valid ? (
                            <>
                                <CheckCircle size={16} className="text-emerald-400" />
                                <span className="text-sm text-emerald-400 font-medium">Valid configuration</span>
                            </>
                        ) : (
                            <>
                                <XCircle size={16} className="text-red-400" />
                                <span className="text-sm text-red-400 font-medium">Invalid configuration</span>
                            </>
                        )}
                    </div>
                )}

                {/* Errors */}
                {result?.errors && result.errors.length > 0 && (
                    <div className="space-y-1.5">
                        {result.errors.map((err, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                                <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                                <span className="text-amber-300">{err}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Preview */}
                {result?.preview && (
                    <div className="space-y-2 pt-2 border-t border-white/5">
                        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                            Sample Test
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <p className="text-xs text-zinc-500 mb-1">Input</p>
                                <pre className="text-xs text-zinc-300 bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(result.preview.sample_input, null, 2)}
                                </pre>
                            </div>
                            <div>
                                <p className="text-xs text-zinc-500 mb-1">Output</p>
                                <div className="text-sm text-white font-mono bg-zinc-950 rounded p-2">
                                    {result.preview.sample_output}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
