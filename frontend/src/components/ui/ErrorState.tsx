import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "./Button";

/* ─── ErrorState ─── Full-page error for list/show pages ──────── */

interface ErrorStateProps {
    title?: string;
    message?: string;
    onRetry?: () => void;
    className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
    title = "Something went wrong",
    message = "An unexpected error occurred. Please try again.",
    onRetry,
    className = "",
}) => (
    <div className={`flex flex-col items-center justify-center py-16 px-6 ${className}`}>
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/10 mb-4">
            <AlertCircle size={24} className="text-red-400" />
        </div>
        <h3 className="text-sm font-medium text-zinc-300 mb-1">{title}</h3>
        <p className="text-sm text-zinc-500 text-center max-w-sm">{message}</p>
        {onRetry && (
            <div className="mt-4">
                <Button variant="secondary" icon={RefreshCw} onClick={onRetry}>
                    Try Again
                </Button>
            </div>
        )}
    </div>
);

/* ─── FormErrorBanner ─── Inline error for form pages ─────────── */

/**
 * A refine/axios mutation error body (`response.data`): either a DRF field-error
 * map, a bare message list, or a string; field keys hold message lists.
 */
type ErrorResponseData =
    | string
    | unknown[]
    | { detail?: unknown; engine_config?: unknown[]; [field: string]: unknown };

interface FormErrorBannerProps {
    title?: string;
    /** Refine/axios error (`HttpError`), a plain Error, or any thrown value. */
    error?: unknown;
    fallbackMessage?: string;
    className?: string;
}

/** Read `response.data` off an axios-shaped error without assuming its shape. */
function getResponseData(error: unknown): ErrorResponseData | undefined {
    const response = (error as { response?: { data?: ErrorResponseData } } | undefined)?.response;
    return response?.data;
}

/**
 * Extracts a human-readable message from a refine/axios mutation error.
 */
function extractErrorMessage(error: unknown, fallback: string): React.ReactNode {
    const data = getResponseData(error);
    const message = (error as { message?: string } | undefined)?.message;
    if (!data) return message || fallback;

    if (typeof data === "string") return data;

    // Common patterns: data.detail, data[0], data.engine_config[0]
    if (Array.isArray(data)) return data[0] ? String(data[0]) : fallback;
    if (typeof data.detail === "string") return data.detail;
    if (data.engine_config?.[0]) return String(data.engine_config[0]);

    // Field-level errors: join first error from each field
    const fieldErrors = Object.entries(data)
        .filter(([, v]) => Array.isArray(v) && v.length > 0)
        .map(([key, v]) => (
            <div key={key} className="text-xs mt-1">
                <span className="font-medium capitalize">{key.replace(/_/g, " ")}</span>: {String((v as unknown[])[0])}
            </div>
        ));

    if (fieldErrors.length > 0) return <>{fallback}{fieldErrors}</>;

    return fallback;
}

export const FormErrorBanner: React.FC<FormErrorBannerProps> = ({
    title = "Error",
    error,
    fallbackMessage = "An unexpected error occurred.",
    className = "",
}) => (
    <div
        className={`bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg text-sm ${className}`}
        role="alert"
    >
        <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
                <div className="font-medium">{title}</div>
                <div className="mt-0.5 text-red-400/80">
                    {extractErrorMessage(error, fallbackMessage)}
                </div>
            </div>
        </div>
    </div>
);
