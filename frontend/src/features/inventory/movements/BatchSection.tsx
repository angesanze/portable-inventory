import { FormSection } from "../../../components/ui/FormSection";
import { Input } from "../../../components/ui/Input";
import { InfoTip } from "../../../components/ui/InfoTip";
import type { MovementCreateViewModel } from "./useMovementCreate";

/** Section 3: batch / lot details (BATCH-tracked & perishable products). */
export const BatchSection = ({ vm }: { vm: MovementCreateViewModel }) => {
    const {
        t,
        batchIdentifier,
        setBatchIdentifier,
        batchLotNumber,
        setBatchLotNumber,
        batchExpiry,
        setBatchExpiry,
    } = vm;

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
            <FormSection
                title={t("movements.batchInfo")}
                description={t("movements.batchInfoDesc")}
            >
                <Input
                    label={t("movements.batchIdentifier")}
                    labelExtra={
                        <InfoTip content={t("movements.batchIdentifierHelp")} />
                    }
                    value={batchIdentifier}
                    onChange={(e) => setBatchIdentifier(e.target.value)}
                    placeholder={t("movements.batchIdentifierPlaceholder")}
                    helperText={t("movements.batchHelperText")}
                />
                <Input
                    label={t("movements.lotNumber")}
                    value={batchLotNumber}
                    onChange={(e) => setBatchLotNumber(e.target.value)}
                    placeholder={t("movements.lotNumberPlaceholder")}
                />
                <Input
                    label={t("movements.expiryDate")}
                    type="date"
                    value={batchExpiry}
                    onChange={(e) => setBatchExpiry(e.target.value)}
                />
            </FormSection>
        </div>
    );
};
