import { useState } from "react";
import { useForm, useList } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Loader } from "lucide-react";
import { Select, type SelectOption } from "../../../components/ui/Select";
import type { StockLocationOption, PhysicalProductEditRecord } from "./types";

const statusOptions: SelectOption[] = [
    { value: "ACTIVE", label: "ACTIVE - Available" },
    { value: "INACTIVE", label: "INACTIVE - In Storage" },
    { value: "SOLD", label: "SOLD - No longer in inventory" },
    { value: "DAMAGED", label: "DAMAGED - Needs Repair" },
];

export const PhysicalProductEdit = () => {
    const navigate = useNavigate();
    const { id } = useParams();

    const { onFinish, queryResult, mutationResult, formLoading } = useForm<PhysicalProductEditRecord>({
        action: "edit",
        resource: "physical-products",
        id: id,
        redirect: "list"
    });

    const { data: locations } = useList<StockLocationOption>({
        resource: "locations",
        pagination: { mode: "off" }
    });

    const locationOptions = (locations?.data || []).map((l) => ({
        label: l.name,
        value: l.id
    }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const rawData = Object.fromEntries(formData.entries());

        // Clean data: filter empty values, handle location_id specially
        const data: Record<string, FormDataEntryValue | null> = {};
        for (const [key, value] of Object.entries(rawData)) {
            if (key === 'location_id') {
                data[key] = value === '' ? null : value;
            } else if (value !== '') {
                data[key] = value;
            }
        }

        await onFinish(data);
    };

    const record = queryResult?.data?.data;
    const isLoading = mutationResult.isLoading || formLoading;

    // Controlled Status + Location (seeded from the loaded record, overridable by
    // the user). The hidden input emitted by <Select name=…> keeps the FormData
    // submit working.
    const [statusOverride, setStatusOverride] = useState<string | null>(null);
    const status = statusOverride ?? record?.status ?? "";
    const [locationOverride, setLocationOverride] = useState<string | null>(null);
    const locationId = locationOverride ?? (record?.location != null ? String(record.location) : "");

    if (formLoading) {
        return (
            <div className="flex items-center justify-center h-screen text-zinc-500 gap-3">
                <Loader className="animate-spin" /> Loading item details...
            </div>
        );
    }

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Edit Physical Item</h1>
                    <div className="text-sm text-zinc-500 font-mono mt-1">{record?.identifier}</div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="bg-zinc-900 border border-white/[0.06] rounded-xl p-8 shadow-lg space-y-6">
                <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                        Identifier (S/N) <span className="text-red-400">*</span>
                    </label>
                    <input
                        name="identifier"
                        defaultValue={record?.identifier}
                        required
                        type="text"
                        className="w-full bg-zinc-950 border border-white/[0.06] rounded-lg px-4 py-3 text-white focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none font-mono"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                        Product Model
                    </label>
                    <div className="px-4 py-3 bg-zinc-800 border border-white/5 rounded-lg text-zinc-400 font-medium">
                        {record?.product_model_name || "Unknown Model"}
                    </div>
                    <p className="mt-1 text-xs text-zinc-600 italic">Product model cannot be changed after creation.</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                        Location
                    </label>
                    <Select
                        name="location_id"
                        value={locationId}
                        onChange={(val) => setLocationOverride(String(val))}
                        placeholder="Select Location..."
                        options={locationOptions}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                        Status
                    </label>
                    <Select
                        name="status"
                        value={status}
                        onChange={(val) => setStatusOverride(String(val))}
                        options={statusOptions}
                    />
                </div>

                <div className="pt-6 border-t border-white/5 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="px-6 py-2 rounded-lg font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="flex items-center gap-2 px-8 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold shadow-lg shadow-indigo-900/20 transition-all duration-150 active:scale-95"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Save size={18} />
                        )}
                        Save Changes
                    </button>
                </div>
            </form>
        </div>
    );
};
