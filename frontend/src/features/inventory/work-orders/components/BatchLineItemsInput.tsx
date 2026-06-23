import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Select, type SelectOption } from "../../../../components/ui/Select";
import { Input } from "../../../../components/ui/Input";
import { Button } from "../../../../components/ui/Button";
import { Trash2, Plus } from "lucide-react";
import { SerialPicker } from "./SerialPicker";
import type { WorkOrderLineItem, WorkOrderProductModel } from "../listTypes";

interface BatchLineItemsInputProps {
    items: WorkOrderLineItem[];
    setItems: Dispatch<SetStateAction<WorkOrderLineItem[]>>;
    modelOptions: SelectOption[];
    productModelsRaw: WorkOrderProductModel[];
}

export const BatchLineItemsInput = ({ items, setItems, modelOptions, productModelsRaw }: BatchLineItemsInputProps) => {
    const { t } = useTranslation(["inventory", "common"]);
    const addItem = () => {
        setItems([...items, { product_model_id: "", quantity: 1, temp_serials: [], key: Date.now() }]);
    };

    const updateItem = (index: number, field: keyof WorkOrderLineItem, value: WorkOrderLineItem[keyof WorkOrderLineItem]) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };

    const addSerialToItem = (index: number, serialId: string) => {
        const newItems = [...items];
        const currentSerials = newItems[index].temp_serials || [];
        newItems[index].temp_serials = [...currentSerials, serialId];
        setItems(newItems);
    };

    const removeSerialFromItem = (index: number, serialUniqueIndex: number) => {
        const newItems = [...items];
        newItems[index].temp_serials = newItems[index].temp_serials.filter((_, i) => i !== serialUniqueIndex);
        setItems(newItems);
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-3">
            {items.map((item, idx) => {
                const model = productModelsRaw.find((p) => p.id === item.product_model_id);
                const isIndividual = model?.profile === "SERIALIZED" || model?.tracking_mode === "INDIVIDUAL";
                const isLocked = item.locked;
                const currentSerials = item.temp_serials || [];

                return (
                    <div
                        key={item.key || idx}
                        className={[
                            "space-y-3 bg-zinc-900/50 p-4 rounded-lg border",
                            isLocked ? "border-indigo-500/20" : "border-white/[0.06]",
                        ].join(" ")}
                    >
                        <div className="flex gap-3 items-start">
                            <div className="flex-1">
                                {isLocked && (
                                    <div className="text-[10px] uppercase font-bold text-indigo-400 mb-1 ml-1">
                                        {t("workOrders.templateItemLocked")}
                                    </div>
                                )}
                                <Select
                                    value={item.product_model_id}
                                    onChange={(val) => updateItem(idx, "product_model_id", String(val))}
                                    placeholder={t("workOrders.selectProductPlaceholder")}
                                    options={modelOptions}
                                    disabled={isLocked}
                                />
                            </div>
                            <div className="w-24">
                                {isLocked && (
                                    <div className="text-[10px] uppercase font-bold text-zinc-500 mb-1 ml-1">
                                        {t("workOrders.targetQty")}
                                    </div>
                                )}
                                <Input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value))}
                                    placeholder={t("workOrders.qtyPlaceholder")}
                                />
                            </div>
                            {!isLocked && (
                                <Button
                                    type="button"
                                    variant="danger"
                                    size="sm"
                                    icon={Trash2}
                                    onClick={() => removeItem(idx)}
                                    aria-label={t("workOrders.removeItem")}
                                />
                            )}
                        </div>

                        {isIndividual && (
                            <div className="pl-1 animate-fadeIn">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                                        {t("workOrders.assignedSerials")}
                                        <span
                                            className={[
                                                "px-2 py-0.5 rounded-full text-[10px]",
                                                currentSerials.length === item.quantity
                                                    ? "bg-emerald-500/20 text-emerald-400"
                                                    : "bg-zinc-800 text-zinc-300",
                                            ].join(" ")}
                                        >
                                            {currentSerials.length} / {item.quantity}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2 mb-3">
                                    {currentSerials.map((sId: string, sIdx: number) => (
                                        <div
                                            key={`${sId}-${sIdx}`}
                                            className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-lg text-sm"
                                        >
                                            <span className="font-mono">{t("workOrders.itemNumber", { number: sIdx + 1 })}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeSerialFromItem(idx, sIdx)}
                                                className="hover:text-white transition-colors"
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    ))}
                                    {currentSerials.length === 0 && (
                                        <div className="text-sm text-zinc-500 italic px-2 py-1">
                                            {t("workOrders.noSerialsAssigned")}
                                        </div>
                                    )}
                                </div>

                                {currentSerials.length < item.quantity && (
                                    <div className="w-full md:w-1/2">
                                        <SerialPicker
                                            modelId={item.product_model_id}
                                            excludeIds={currentSerials}
                                            onChange={(val: string) => addSerialToItem(idx, val)}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={Plus}
                onClick={addItem}
            >
                {t("workOrders.addLineItem")}
            </Button>
        </div>
    );
};
