import { useEffect } from "react";
import { AxiosError } from "axios";
import { useLogout } from "@refinedev/core";
import { axiosInstance } from "./axios-client";
import { useToast } from "../components/ui/Toast";

/** Best-effort human message from a DRF error body:
 *  `{detail}` / `{error}` / a bare string / an array / a field→errors map. */
function describeError(data: unknown, status?: number): string {
    if (typeof data === "string" && data.trim()) return data.trim();
    if (Array.isArray(data)) return data.map(String).join(", ");
    if (data && typeof data === "object") {
        const d = data as Record<string, unknown>;
        if (typeof d.detail === "string") return d.detail;
        if (typeof d.error === "string") return d.error;
        const parts = Object.entries(d)
            .filter(([k]) => k !== "code" && k !== "request_id")
            .map(([k, v]) => (Array.isArray(v) ? `${k}: ${v.join(", ")}` : `${k}: ${v}`));
        if (parts.length) return parts.join("; ");
    }
    if (status && status >= 500) return "An unexpected server error occurred. Please try again.";
    return "The request could not be completed.";
}

/**
 * Single global error surface for the dashboard. Every failed request through
 * the shared axiosInstance raises a toast carrying the backend's reason, so the
 * user always learns WHY an action failed — insufficient stock (409), validation
 * (400), not found (404), throttled (429), server (5xx) or a network drop.
 *
 * Uses the Toast context DIRECTLY (not Refine's useNotification) so it can't be
 * silently disabled by a mis-wired notificationProvider, and it is the ONE place
 * that toasts API errors — individual components no longer duplicate it.
 */
export const AxiosErrorHandler = () => {
    const { toast } = useToast();
    const { mutate: logout } = useLogout();

    useEffect(() => {
        const interceptor = axiosInstance.interceptors.response.use(
            (response) => response,
            (error: AxiosError) => {
                const status = error.response?.status;

                // 401 → the token-refresh interceptor already ran; reaching here
                // means the session is truly gone. Log out (no toast: navigation
                // to the login screen is the signal).
                if (status === 401) {
                    logout();
                    return Promise.reject(error);
                }

                const description = status
                    ? describeError(error.response?.data, status)
                    : "Could not reach the server. Check your connection and try again.";
                toast({ message: description, variant: "error" });

                return Promise.reject(error);
            },
        );
        return () => {
            axiosInstance.interceptors.response.eject(interceptor);
        };
    }, [toast, logout]);

    return null;
};
