import { PackagePlus, PackageMinus } from "lucide-react";
import { FormSection } from "../../../components/ui/FormSection";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { InfoTip } from "../../../components/ui/InfoTip";
import type { MovementCreateViewModel } from "./useMovementCreate";

/** Section 2: direction + quantity + location + supplier + reason (non-tracker). */
export const MovementDetailsSection = ({ vm }: { vm: MovementCreateViewModel }) => {
    const {
        t,
        navigate,
        direction,
        setDirection,
        isPreselected,
        directionAccent,
        DIRECTION_OPTIONS,
        isIndividual,
        isInbound,
        isOutbound,
        quantity,
        setQuantity,
        currentStock,
        locationId,
        setLocationId,
        locationOptions,
        realLocations,
        supplierId,
        setSupplierId,
        supplierOptions,
        suppliersData,
        suppliers,
        reason,
        setReason,
        saveAndNavigate,
        returnTo,
    } = vm;

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
            <FormSection
                title={t("movements.movementDetails")}
                description={t("movements.movementDetailsDesc")}
            >
                {isPreselected ? (
                    <div className="flex items-center gap-3">
                        <span
                            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                                direction === "inbound"
                                    ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                                    : "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20"
                            }`}
                        >
                            {direction === "inbound" ? (
                                <PackagePlus size={14} />
                            ) : (
                                <PackageMinus size={14} />
                            )}
                            {direction === "inbound" ? t("movements.receivingStock") : t("movements.shippingOut")}
                        </span>
                        <button
                            type="button"
                            onClick={() => navigate("/movements/create")}
                            className="text-sm text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
                        >
                            {t("movements.change")}
                        </button>
                    </div>
                ) : (
                    <div className={directionAccent ? `rounded-lg border-l-4 ${directionAccent} pl-4` : ""}>
                        <Select
                            custom
                            label={t("movements.direction")}
                            labelExtra={
                                <InfoTip content={t("movements.directionHelp")} />
                            }
                            value={direction}
                            onChange={(val) => setDirection(String(val))}
                            options={DIRECTION_OPTIONS}
                            placeholder={t("movements.selectDirection")}
                            required
                            helperText={t("movements.directionHelperText")}
                        />
                    </div>
                )}

                {direction && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 flex flex-col gap-4">
                        {!isIndividual && (
                            <div>
                                <Input
                                    label={t("movements.quantity")}
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    required
                                    helperText={t("movements.quantityHelper")}
                                />
                                {currentStock != null && locationId && (
                                    <p className="mt-1 text-xs text-zinc-500">
                                        {t("movements.currentStockLabel")} <span className="text-zinc-300 font-medium">{currentStock} {t("movements.units")}</span>
                                        {isOutbound && parseFloat(quantity) > currentStock && (
                                            <span className="text-amber-400 ml-2">{t("movements.exceedsStock")}</span>
                                        )}
                                    </p>
                                )}
                            </div>
                        )}

                        <div>
                            <Select
                                custom
                                label={isInbound ? t("movements.destinationLocation") : t("movements.sourceLocation")}
                                value={locationId}
                                onChange={(val) => setLocationId(String(val))}
                                options={locationOptions}
                                placeholder={isInbound ? t("movements.destinationPlaceholder") : t("movements.sourcePlaceholder")}
                                required
                                helperText={
                                    isInbound
                                        ? t("movements.destinationHelper")
                                        : t("movements.sourceHelper")
                                }
                            />
                            {realLocations.length === 1 && (
                                <p className="mt-1 text-xs text-zinc-500">
                                    {t("movements.singleLocationPrefix")}
                                    <button
                                        type="button"
                                        onClick={() => saveAndNavigate(`/locations/create?returnTo=${returnTo}`)}
                                        className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                                    >
                                        {t("movements.settingsLocations")}
                                    </button>
                                </p>
                            )}
                        </div>

                        {isInbound && (
                            <div>
                                <Select
                                    custom
                                    label={t("movements.supplierOptional")}
                                    value={supplierId}
                                    onChange={(val) => setSupplierId(String(val))}
                                    options={supplierOptions}
                                    placeholder={t("movements.selectSupplierPlaceholder")}
                                    helperText={t("movements.supplierHelper")}
                                />
                                {suppliersData && suppliers.length === 0 && (
                                    <p className="mt-1 text-xs text-zinc-500">
                                        {t("movements.noSuppliersPrefix")}
                                        <button
                                            type="button"
                                            onClick={() => saveAndNavigate(`/suppliers/create?returnTo=${returnTo}`)}
                                            className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                                        >
                                            {t("movements.noSuppliersLink")}
                                        </button>
                                    </p>
                                )}
                            </div>
                        )}

                        <Input
                            label={t("movements.reason")}
                            labelExtra={
                                <InfoTip content={t("movements.reasonHelp")} />
                            }
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={isInbound ? t("movements.reasonPlaceholderInbound") : t("movements.reasonPlaceholderOutbound")}
                            helperText={t("movements.reasonHelper")}
                        />
                    </div>
                )}
            </FormSection>
        </div>
    );
};
