import { useEffect } from "react";
import type { NotificationProvider } from "@refinedev/core";
import { useToast, type ToastVariant } from "../components/ui/Toast";

/**
 * Bridge Refine's `notificationProvider` — a plain object created OUTSIDE React —
 * to the in-app Toast context.
 *
 * Without a registered notificationProvider, every `useNotification().open()`
 * call was a silent no-op (FE-01): the 403 / 5xx / validation toasts from
 * `AxiosErrorHandler`, and the success/error feedback from `QuickAdjust`,
 * `BatchManager`, the bulk stock editors, etc., never appeared, so a failed
 * inline action just stopped spinning with no message.
 *
 * `<Refine>` takes the object; `<NotificationBridge>` (mounted inside
 * `<ToastProvider>`) registers the actual toast dispatcher. Calls that arrive
 * before the bridge mounts are dropped — in practice there are none, since the
 * first notification is user-triggered.
 */
type ToastHandler = (message: string, variant: ToastVariant) => void;

let handler: ToastHandler | null = null;

// eslint-disable-next-line react-refresh/only-export-components -- the provider object is intentionally co-located with the bridge component that wires it to the Toast context; splitting them adds a module for a dev-only HMR optimization.
export const notificationProvider: NotificationProvider = {
    open: ({ message, description, type }) => {
        const text = description ? `${message}: ${description}` : message;
        const variant: ToastVariant =
            type === "success" ? "success" : type === "progress" ? "info" : "error";
        handler?.(text, variant);
    },
    close: () => {
        // Toasts auto-dismiss on a timer; there is nothing to cancel by key.
    },
};

/** Mount inside <ToastProvider> to wire the notificationProvider to real toasts. */
export function NotificationBridge() {
    const { toast } = useToast();
    useEffect(() => {
        handler = (message, variant) => toast({ message, variant });
        return () => {
            handler = null;
        };
    }, [toast]);
    return null;
}
