import { useState } from "react";
import { useList, useCustomMutation } from "@refinedev/core";
import { useTranslation } from "react-i18next";
import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import { useToast } from "../../../components/ui/Toast";
import { API_URL } from "../../../config";
import type { ReservationProductRow, ReservationLocationRow } from "./types";

interface CreateReservationModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Called after a successful create so the list can refetch. */
    onCreated: () => void;
}

/**
 * Create-reservation modal: product (required), location (optional —
 * empty = company-level reservation), quantity, free-text reference and an
 * optional expiry. Backend errors (e.g. insufficient availability) surface
 * in the form via FormErrorBanner.
 */
export const CreateReservationModal = ({
    isOpen,
    onClose,
    onCreated,
}: CreateReservationModalProps) => {
    const { t } = useTranslation(["inventory", "common"]);
    const { toast } = useToast();

    const [productId, setProductId] = useState("");
    const [locationId, setLocationId] = useState("");
    const [quantity, setQuantity] = useState("1");
    const [reference, setReference] = useState("");
    const [expiresAt, setExpiresAt] = useState("");

    const {
        mutateAsync: createReservation,
        isLoading,
        isError,
        error,
        reset,
    } = useCustomMutation();

    const { data: productsData } = useList<ReservationProductRow>({
        resource: "product-models",
        pagination: { mode: "off" },
        queryOptions: { enabled: isOpen },
    });
    const { data: locationsData } = useList<ReservationLocationRow>({
        resource: "locations",
        pagination: { mode: "off" },
        queryOptions: { enabled: isOpen },
    });

    const products = productsData?.data || [];
    const locations = locationsData?.data || [];

    const productOptions = products.map((p) => ({
        value: p.id,
        label: p.name,
        description: p.sku,
    }));
    // Reservations only make sense against real stock-holding locations.
    const locationOptions = locations
        .filter((l) => l.type === "WAREHOUSE" || l.type === "STORE")
        .map((l) => ({
            value: l.id,
            label: l.name,
            description: l.type,
        }));

    const resetForm = () => {
        setProductId("");
        setLocationId("");
        setQuantity("1");
        setReference("");
        setExpiresAt("");
        reset();
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const qty = parseFloat(quantity);
    const canSubmit = !!productId && !isNaN(qty) && qty > 0 && !isLoading;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        const payload: Record<string, unknown> = {
            product_id: productId,
            quantity: qty,
        };
        if (locationId) payload.location_id = locationId;
        if (reference) payload.reference = reference;
        if (expiresAt) payload.expires_at = new Date(expiresAt).toISOString();

        try {
            await createReservation({
                url: `${API_URL}/api/v1/reservations/`,
                method: "post",
                values: payload,
                successNotification: false,
                errorNotification: false,
            });
            toast({
                message: t("reservations.createSuccess"),
                variant: "success",
            });
            resetForm();
            onCreated();
            onClose();
        } catch {
            // Error stays in the mutation state and renders in the banner below.
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={t("reservations.createTitle")}
            footer={
                <>
                    <Button variant="secondary" onClick={handleClose}>
                        {t("common:cancel")}
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        loading={isLoading}
                        data-testid="reservation-submit"
                    >
                        {t("common:create")}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                {isError && (
                    <FormErrorBanner
                        title={t("reservations.errorCreating")}
                        error={error}
                    />
                )}

                <Select
                    custom
                    label={t("reservations.product")}
                    value={productId}
                    onChange={(val) => setProductId(String(val))}
                    options={productOptions}
                    placeholder={t("reservations.selectProductPlaceholder")}
                    required
                />

                <Select
                    custom
                    label={t("reservations.locationOptional")}
                    value={locationId}
                    onChange={(val) => setLocationId(String(val))}
                    options={locationOptions}
                    placeholder={t("reservations.selectLocationPlaceholder")}
                    helperText={t("reservations.locationHelper")}
                />

                <Input
                    label={t("reservations.quantity")}
                    type="number"
                    min="0"
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    helperText={t("reservations.quantityHelper")}
                />

                <Input
                    label={t("reservations.reference")}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder={t("reservations.referencePlaceholder")}
                />

                <Input
                    label={t("reservations.expiresAtOptional")}
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    helperText={t("reservations.expiresAtHelper")}
                />
            </div>
        </Modal>
    );
};
