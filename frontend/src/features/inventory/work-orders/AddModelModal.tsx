import type { TFunction } from "i18next";
import { Button } from "../../../components/ui/Button";
import { Select, type SelectOption } from "../../../components/ui/Select";
import type { ModelSelectOption } from "./useWorkOrderShow";

interface AddModelModalProps {
    t: TFunction;
    isOpen: boolean;
    onClose: () => void;
    modelOptions: ModelSelectOption[];
    physicalProductOptions: SelectOption[];
    selectedModelId: string;
    onSelectModel: (value: string) => void;
    selectedPhysicalProductId: string;
    onSelectPhysicalProduct: (value: string) => void;
    addQuantity: number;
    onChangeQuantity: (value: number) => void;
    isIndividual: boolean;
    isUpdating: boolean;
    onSubmit: () => void;
}

export const AddModelModal = ({
    t,
    isOpen,
    onClose,
    modelOptions,
    physicalProductOptions,
    selectedModelId,
    onSelectModel,
    selectedPhysicalProductId,
    onSelectPhysicalProduct,
    addQuantity,
    onChangeQuantity,
    isIndividual,
    isUpdating,
    onSubmit,
}: AddModelModalProps) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-zinc-900 border border-white/[0.06] p-8 rounded-xl max-w-lg w-full shadow-2xl space-y-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div>
                    <h3 className="text-2xl font-bold text-white">
                        {t("workOrders.addModelTitle")}
                    </h3>
                    <p className="text-zinc-400 text-sm mt-1">
                        {t("workOrders.addModelDesc")}
                    </p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-2">
                            {t("workOrders.productModel")}
                        </label>
                        <Select
                            value={selectedModelId}
                            onChange={(val) => onSelectModel(String(val))}
                            placeholder={t("workOrders.selectModel")}
                            options={modelOptions}
                        />
                    </div>
                    {isIndividual ? (
                        <div>
                            <label className="block text-sm font-medium text-indigo-400 mb-2">
                                {t("workOrders.selectSerialNumber")}
                            </label>
                            <Select
                                value={selectedPhysicalProductId}
                                onChange={(val) =>
                                    onSelectPhysicalProduct(String(val))
                                }
                                placeholder={t("workOrders.pickSerial")}
                                options={physicalProductOptions}
                            />
                            <p className="text-xs text-zinc-500 mt-2 italic">
                                {t("workOrders.serializedQtyNote")}
                            </p>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-2">
                                {t("workOrders.initialQuantity")}
                            </label>
                            <input
                                type="number"
                                value={addQuantity}
                                onChange={(e) =>
                                    onChangeQuantity(parseInt(e.target.value))
                                }
                                className="w-full bg-zinc-950 border border-white/[0.06] rounded-lg px-4 py-3 text-white focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                            />
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <Button variant="ghost" onClick={onClose}>
                        {t("common:cancel")}
                    </Button>
                    <Button
                        variant="primary"
                        onClick={onSubmit}
                        disabled={
                            !selectedModelId ||
                            (isIndividual && !selectedPhysicalProductId) ||
                            isUpdating
                        }
                    >
                        {t("workOrders.addToBatch")}
                    </Button>
                </div>
            </div>
        </div>
    );
};
