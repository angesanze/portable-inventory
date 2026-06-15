import { Package, Calendar, Trash2, Plus, X, Loader } from "lucide-react";
import { useState } from "react";
import { useNotification, useList } from "@refinedev/core";
import { axiosInstance } from "../../providers/axios-client";
import { Select } from "../ui/Select";

export const BatchManager = ({ product, onUpdate, variant = 'BATCH' }: { product: any, onUpdate?: () => void, variant?: 'BATCH' | 'ITEM' }) => {
    // Current stock (buckets or trackers) is a list of objects
    const batches = Array.isArray(product.stock_value) ? product.stock_value : [];
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { open } = useNotification();

    // Form State
    const [newBatchId, setNewBatchId] = useState("");
    const [newBatchQty, setNewBatchQty] = useState(1);


    // Fetch default location (Warehouse)
    const { data: locationData } = useList({
        resource: "locations",
        pagination: { mode: "off" }
    });

    // Default to first WAREHOUSE or first location
    const defaultLocation = locationData?.data?.find((l: any) => l.type === 'WAREHOUSE')?.id || locationData?.data?.[0]?.id;
    const [targetLocation, setTargetLocation] = useState(defaultLocation);

    const handleCreateBatch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBatchId || !targetLocation) return;

        // Validation for Serialized Items
        if (variant === 'ITEM' && newBatchQty !== 1) {
            open?.({
                message: "Error",
                description: "Serialized items must have a quantity of 1.",
                type: "error"
            });
            return;
        }

        setIsLoading(true);
        try {
            const payload: any = {
                product_id: product.id,
                quantity: newBatchQty,
                location_id: targetLocation,
            };

            if (variant === 'ITEM') {
                payload.item_identifier = newBatchId;
                // Ensure Qty is 1
                payload.quantity = 1;
            } else {
                payload.batch_data = {
                    batch_identifier: newBatchId,
                    data: {
                        created_via: "batch_manager"
                    }
                };
            }

            await axiosInstance.post(`/api/v1/widget/move/`, payload);

            open?.({
                message: "Success",
                description: `${variant === 'ITEM' ? 'Item' : 'Batch'} ${newBatchId} created successfully.`,
                type: "success"
            });
            setIsCreateOpen(false);
            setNewBatchId("");
            setNewBatchQty(1);
            onUpdate?.();
        } catch (err: any) {
            open?.({
                message: "Error",
                description: err.response?.data?.detail || "Failed to create",
                type: "error"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const labels = {
        title: variant === 'ITEM' ? "Active Assets" : "Active Batches",
        btnString: variant === 'ITEM' ? "New Asset" : "New Batch",
        idLabel: variant === 'ITEM' ? "Asset Tag / Serial No." : "Batch Identifier / Lot No.",
        modalTitle: variant === 'ITEM' ? "Register New Asset" : "Receive New Batch"
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Package className="text-indigo-400" /> {labels.title}
                </h3>
                <button
                    onClick={() => setIsCreateOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-colors shadow-lg shadow-indigo-900/20 active:scale-95"
                >
                    <Plus size={16} /> {labels.btnString}
                </button>
            </div>

            {/* Create Modal */}
            {isCreateOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-zinc-900 border border-white/[0.06] rounded-xl w-full max-w-md p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-white">{labels.modalTitle}</h3>
                            <button onClick={() => setIsCreateOpen(false)} className="text-zinc-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateBatch} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">{labels.idLabel}</label>
                                <input
                                    autoFocus
                                    required
                                    value={newBatchId}
                                    onChange={(e) => setNewBatchId(e.target.value)}
                                    placeholder={variant === 'ITEM' ? "e.g. SN-001" : "e.g. LOT-2024-X"}
                                    className="w-full bg-zinc-950 border border-white/[0.06] rounded-lg px-4 py-3 text-white focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none font-mono"
                                />
                            </div>

                            {variant !== 'ITEM' && (
                                <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Initial Quantity</label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        value={newBatchQty}
                                        onChange={(e) => setNewBatchQty(parseFloat(e.target.value))}
                                        className="w-full bg-zinc-950 border border-white/[0.06] rounded-lg px-4 py-3 text-white focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none font-mono"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Location</label>
                                <Select // Use Select Component
                                    value={targetLocation}
                                    onChange={(val) => setTargetLocation(String(val))}
                                    options={locationData?.data?.map((l: any) => ({ label: l.name, value: l.id })) || []}
                                    placeholder="Select Location..."
                                />
                            </div>
                            <div className="pt-4 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateOpen(false)}
                                    className="px-4 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-900/20 transition-all duration-150 flex items-center gap-2"
                                >
                                    {isLoading && <Loader size={16} className="animate-spin" />}
                                    Create {variant === 'ITEM' ? 'Asset' : 'Batch'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="grid gap-4">
                {batches.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-white/[0.06] rounded-xl bg-zinc-900/50">
                        <p className="text-zinc-500">No active {variant === 'ITEM' ? 'items' : 'batches'} found.</p>
                    </div>
                ) : (
                    batches.map((batch: any, idx: number) => (
                        <div key={idx} className="bg-zinc-900 border border-white/[0.06] rounded-xl p-4 flex items-center justify-between hover:border-white/20 transition-colors duration-150 group">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 font-mono text-xs border border-white/5">
                                    {idx + 1}
                                </div>
                                <div>
                                    <div className="text-white font-bold text-lg">
                                        {variant === 'ITEM'
                                            ? (batch.identifier || batch.id)
                                            : (['AGGREGATED', 'General', 'Standard'].includes(batch.batch_identifier || batch.id)
                                                ? (batch.work_order ? `Batch for ${batch.work_order}` : "Standard Stock")
                                                : (batch.batch_identifier || batch.id))
                                        }
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-zinc-400 mt-1">
                                        {/* ... existing fields ... */}
                                        {batch.expiration_date && (
                                            <span className="flex items-center gap-1 text-orange-300">
                                                <Calendar size={12} /> Exp: {batch.expiration_date}
                                            </span>
                                        )}
                                        {/* Render other keys dynamically */}
                                        {Object.keys(batch).filter(k => !['id', 'quantity', 'qty', 'expiration_date', 'work_order', 'work_order_id', 'location', 'identifier', 'batch_identifier', 'status'].includes(k)).map(k => (
                                            <span key={k} className="opacity-70">{k}: {batch[k]}</span>
                                        ))}
                                        <span className="opacity-70 text-zinc-500">@{typeof batch.location === 'string' ? batch.location : batch.location?.name}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-6">
                                <div className="text-right">
                                    <div className="text-white font-mono font-bold text-xl">{batch.quantity || batch.qty || 0}</div>
                                    <div className="text-xs text-zinc-500 uppercase tracking-wider">Units</div>
                                </div>
                                <button className="w-8 h-8 rounded-full bg-red-900/0 hover:bg-red-900/20 text-zinc-500 hover:text-red-400 flex items-center justify-center transition-all duration-150 opacity-0 group-hover:opacity-100" aria-label="Delete batch">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
