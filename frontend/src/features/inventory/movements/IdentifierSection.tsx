import { FormSection } from "../../../components/ui/FormSection";
import { Input } from "../../../components/ui/Input";
import type { MovementCreateViewModel } from "./useMovementCreate";

/**
 * Item-identification section (serial number input). Rendered for both
 * INDIVIDUAL/serialized products and engine-driven tracker products — the markup
 * is identical, so a single component covers the original sections 4 and 4b.
 */
export const IdentifierSection = ({ vm }: { vm: MovementCreateViewModel }) => {
    const { t, identifier, setIdentifier } = vm;

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
            <FormSection
                title={t("movements.itemIdentification")}
                description={t("movements.itemIdentificationDesc")}
            >
                <Input
                    label={t("movements.serialNumberIdentifier")}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={t("movements.serialPlaceholder")}
                    required
                    helperText={t("movements.serialHelper")}
                />
            </FormSection>
        </div>
    );
};
