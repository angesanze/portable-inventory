import { useState } from "react";
import { Plus, Minus, Hash } from "lucide-react";
import { useNotification, useList } from "@refinedev/core";
import { axiosInstance } from "../../providers/axios-client";
import { PROFILE_METADATA } from "../../types/api";

/** Product fields the strategy adjust view reads. `stock_value` is either a
 * scalar count (bulk) or a list of stock buckets (tracked profiles). */
interface StrategyProduct {
    id: string;
    profile?: string;
    tracking_mode?: string;
    stock_value?: number | unknown[];
}

/** DRF error body surfaced via axios: either a field map or a bare message list. */
interface ApiErrorBody {
    detail?: string;
    [field: string]: unknown;
}

/** First human-readable message from an axios-shaped error, if any. */
function readApiError(err: unknown): string | undefined {
    const data = (err as { response?: { data?: ApiErrorBody | string[] } } | undefined)?.response
        ?.data;
    if (!data) return undefined;
    if (Array.isArray(data)) return typeof data[0] === "string" ? data[0] : undefined;
    if (typeof data.detail === "string") return data.detail;
    return undefined;
}

export const QuickAdjust = ({ product, onUpdate }: { product: StrategyProduct, onUpdate: () => void }) => {
    const [delta, setDelta] = useState<number>(1);
    const [identifier, setIdentifier] = useState("");
    const [loading, setLoading] = useState(false);
    const { open } = useNotification();

    // Fetch a default location. Prefer a WAREHOUSE, but fall back to any non-virtual
    // location so companies without a WAREHOUSE-typed location can still adjust stock,
    // matching the backend (type__in=['WAREHOUSE','PHYSICAL','STORE']).
    const { data: locationData } = useList({
        resource: "locations",
        pagination: { pageSize: 50 }
    });
    const locations = (locationData?.data ?? []) as Array<{ id: string; type: string }>;
    const defaultLocationId = (
        locations.find((l) => l.type === "WAREHOUSE") ??
        locations.find((l) => l.type !== "VIRTUAL" && l.type !== "LOSS")
    )?.id;

    const meta = product.profile ? PROFILE_METADATA[product.profile as keyof typeof PROFILE_METADATA] : undefined;
    const isSerial = meta?.supportsSerials ?? product.tracking_mode === 'INDIVIDUAL';

    const handleAdjust = async (operation: 'add' | 'subtract') => {
        if (!defaultLocationId) {
            open?.({ message: "Error", description: "No default warehouse found.", type: "error" });
            return;
        }

        if (isSerial && operation === 'add' && !identifier) {
            open?.({ message: "Error", description: "Serial Number / Identifier is required.", type: "error" });
            return;
        }

        setLoading(true);
        try {
            await axiosInstance.post(`/api/v1/widget/move/`, {
                product_id: product.id,
                quantity: isSerial ? (operation === 'add' ? 1 : -1) : (operation === 'add' ? delta : -delta),
                item_identifier: isSerial ? identifier : undefined,
                location_id: defaultLocationId,
                // Manual quick adjustment is a rettifica, not a vendor receipt.
                counterparty: "ADJUSTMENT"
            });

            open?.({
                message: "Success",
                description: `Successfully ${operation === 'add' ? 'registered' : 'removed'} item`,
                type: "success"
            });
            setIdentifier(""); // Reset
            onUpdate?.();
        } catch (err: unknown) {
            open?.({
                message: "Error",
                description: readApiError(err) || "Adjustment failed",
                type: "error"
            });
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-white">
                        {isSerial ? "Register Item" : "Quick Adjustment"}
                    </h3>
                    <p className="text-zinc-400 text-sm">
                        {isSerial ? "Register a new serialized item." : "Increment or decrement stock directly."}
                    </p>
                </div>
                <div className="text-3xl font-mono font-bold text-white">
                    {typeof product.stock_value === 'object' ? 0 : (product.stock_value || 0)}
                </div>
            </div>

            <div className="flex gap-4 items-end">
                {isSerial ? (
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Serial Number / ID</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                                placeholder="SN-12345"
                                className="w-full bg-zinc-950 border border-white/[0.06] rounded-lg pl-10 pr-4 py-3 text-white focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none font-mono"
                            />
                            <Hash className="absolute left-3 top-3.5 text-zinc-500 w-4 h-4" />
                        </div>
                    </div>
                ) : (
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Adjustment Qty</label>
                        <input
                            type="number"
                            min="1"
                            value={delta}
                            onChange={(e) => setDelta(parseFloat(e.target.value))}
                            className="w-full bg-zinc-950 border border-white/[0.06] rounded-lg px-4 py-3 text-white focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none text-lg font-mono"
                        />
                    </div>
                )}

                {!isSerial && (
                    <button
                        disabled={loading}
                        onClick={() => handleAdjust('subtract')}
                        className="h-[52px] px-6 bg-red-900/30 hover:bg-red-900/50 border border-red-500/30 text-red-200 rounded-lg flex items-center justify-center transition-colors duration-150"
                    >
                        <Minus size={24} />
                    </button>
                )}

                <button
                    disabled={loading}
                    onClick={() => handleAdjust('add')}
                    className="h-[52px] px-6 bg-green-900/30 hover:bg-green-900/50 border border-green-500/30 text-green-200 rounded-lg flex items-center justify-center transition-colors duration-150"
                >
                    <Plus size={24} />
                    {isSerial && <span className="ml-2 font-bold text-sm">Register</span>}
                </button>
            </div>
        </div>
    );
};
