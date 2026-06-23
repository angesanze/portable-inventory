import { useEffect, useState } from "react";
import { API_URL } from "../../../config";

/**
 * Resolve the widget API key.
 *
 * Two sources, in priority order:
 * 1. `?api_key=` — legacy direct key (embeds, manual links).
 * 2. `?token=`  — short-lived signed token emitted by QR redirects.
 *    The raw key must not live in URLs (browser history, logs, Referer),
 *    so /go/<code>/ sends a token and we exchange it here once. The
 *    resolved key is cached in sessionStorage so reloads within the
 *    session don't hit the (expiring) exchange endpoint again.
 */
export function useWidgetApiKey(): { apiKey: string | null; resolvingKey: boolean; keyError: string } {
    const params = new URL(window.location.href).searchParams;
    const directKey = params.get("api_key");
    const token = params.get("token");

    const cached = token ? sessionStorage.getItem(`pi-widget-key:${token}`) : null;
    // SEC-04: a same-origin redirect (e.g. after locking a QR) stashes the
    // credential here instead of re-putting it in the URL (history/Referer/logs).
    const storedDirect = (!directKey && !token) ? sessionStorage.getItem("pi-widget-key:direct") : null;
    const [apiKey, setApiKey] = useState<string | null>(directKey || cached || storedDirect);
    const [resolvingKey, setResolvingKey] = useState(!directKey && !cached && !!token);
    const [keyError, setKeyError] = useState("");

    useEffect(() => {
        if (apiKey || !token) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${API_URL}/api/v1/widget/exchange_token/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json.detail || "Token exchange failed");
                if (!cancelled) {
                    sessionStorage.setItem(`pi-widget-key:${token}`, json.api_key);
                    setApiKey(json.api_key);
                }
            } catch (e: unknown) {
                if (!cancelled) setKeyError(e instanceof Error ? e.message : "Token exchange failed");
            } finally {
                if (!cancelled) setResolvingKey(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token, apiKey]);

    return { apiKey, resolvingKey, keyError };
}
