import { FormPage } from "../../../components/ui/FormPage";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import { useMovementCreate } from "./useMovementCreate";
import { ProductSection } from "./ProductSection";
import { MovementDetailsSection } from "./MovementDetailsSection";
import { BatchSection } from "./BatchSection";
import { IdentifierSection } from "./IdentifierSection";
import { TrackerStatusSection } from "./TrackerStatusSection";
import { DirectionIndicator } from "./DirectionIndicator";

/**
 * Polymorphic movement-creation form. All state/derived data/effects/submit logic
 * lives in `useMovementCreate`; this component is a thin composition that gates
 * the per-profile sections exactly as the original monolith did.
 */
export const MovementCreate = () => {
    const vm = useMovementCreate();
    const {
        t,
        productId,
        direction,
        isBatch,
        isIndividual,
        isTracker,
        identifier,
        locationId,
        handleSubmit,
        onCancel,
        submitLabel,
        submitDisabled,
        isLoading,
        mutationResult,
    } = vm;

    return (
        <FormPage
            title={t("movements.recordMovement")}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            onCancel={onCancel}
            submitLabel={submitLabel}
            submitDisabled={submitDisabled}
        >
            {mutationResult?.isError && (
                <FormErrorBanner
                    title={t("movements.errorCreating")}
                    error={mutationResult.error}
                />
            )}

            {/* Section 1: Product */}
            <ProductSection vm={vm} />

            {/* Section 2: Movement Details */}
            {productId && !isTracker && <MovementDetailsSection vm={vm} />}

            {/* Section 3: Batch details (BATCH products) */}
            {productId && direction && !isTracker && isBatch && <BatchSection vm={vm} />}

            {/* Section 4: Individual item (INDIVIDUAL/serialized products) */}
            {productId && direction && !isTracker && isIndividual && <IdentifierSection vm={vm} />}

            {/* Section 4b: Tracker status change (engine-driven products) */}
            {productId && isTracker && <IdentifierSection vm={vm} />}

            {/* Section 4c: Status-change controls (engine-driven products) */}
            {productId && isTracker && identifier && <TrackerStatusSection vm={vm} />}

            {/* Direction visual indicator */}
            {!isTracker && direction && locationId && <DirectionIndicator vm={vm} />}
        </FormPage>
    );
};
