
import { useForm, useList } from "@refinedev/core";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { FormPage } from "../../../components/ui/FormPage";
import { FormSection } from "../../../components/ui/FormSection";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import type { TransferProduct, TransferLocation, TransferPayload } from "./movementTypes";

export const TransferCreate = () => {
    const navigate = useNavigate();
    const { t } = useTranslation(["inventory", "common"]);

    const [productId, setProductId] = useState("");
    const [fromLocationId, setFromLocationId] = useState("");
    const [toLocationId, setToLocationId] = useState("");
    const [quantity, setQuantity] = useState("1");
    const [reason, setReason] = useState("");

    // BATCH fields
    const [batchIdentifier, setBatchIdentifier] = useState("");
    const [batchLotNumber, setBatchLotNumber] = useState("");
    const [batchExpiry, setBatchExpiry] = useState("");

    // INDIVIDUAL fields
    const [identifier, setIdentifier] = useState("");

    const { onFinish, mutationResult } = useForm({
        action: "create",
        resource: "movements",
        redirect: false,
        onMutationSuccess: () => {
            navigate("/movements");
        },
    });

    const { data: productsData } = useList<TransferProduct>({
        resource: "product-models",
        pagination: { mode: "off" },
    });

    const { data: locationsData } = useList<TransferLocation>({
        resource: "locations",
        pagination: { mode: "off" },
    });

    const products = productsData?.data || [];
    const locations = locationsData?.data || [];

    const selectedProduct = products.find((p) => p.id === productId);
    const trackingMode = selectedProduct?.tracking_mode;
    const engineType = selectedProduct?.engine_type;

    const isBatch = engineType === "bucket" || trackingMode === "BATCH";
    const isIndividual = engineType === "tracker" || trackingMode === "INDIVIDUAL";

    const productOptions = products.map((p) => ({
        value: p.id,
        label: p.name,
        description: p.sku,
    }));

    const realLocations = locations.filter(
        (l) => l.type === "WAREHOUSE" || l.type === "STORE",
    );

    const fromLocationOptions = realLocations.map((l) => ({
        value: l.id,
        label: l.name,
        description: l.type,
    }));

    // Filter out source location from destination options
    const toLocationOptions = realLocations
        .filter((l) => l.id !== fromLocationId)
        .map((l) => ({
            value: l.id,
            label: l.name,
            description: l.type,
        }));

    const locationMismatch = fromLocationId && toLocationId && fromLocationId === toLocationId;

    const handleSubmit = async () => {
        if (locationMismatch) return;

        const qty = parseFloat(quantity);
        if (isNaN(qty) || qty <= 0) return;

        const payload: TransferPayload = {
            product_id: productId,
            from_id: fromLocationId,
            to_id: toLocationId,
            quantity: qty,
            reason: reason || "Transfer",
        };

        // BATCH: include batch data
        if (isBatch) {
            const batchData: Record<string, string> = {};
            if (batchIdentifier) batchData.batch_identifier = batchIdentifier;
            if (batchLotNumber) batchData.lot_number = batchLotNumber;
            if (batchExpiry) batchData.expiry_date = batchExpiry;
            if (Object.keys(batchData).length > 0) {
                payload.batch_data = batchData;
            }
        }

        // INDIVIDUAL: include identifier
        if (isIndividual && identifier) {
            payload.physical_identifier = identifier;
        }

        await onFinish(payload);
    };

    const isLoading = mutationResult.isLoading;

    const fromName = realLocations.find((l) => l.id === fromLocationId)?.name;
    const toName = realLocations.find((l) => l.id === toLocationId)?.name;

    return (
        <FormPage
            title={t("movements.transferStock")}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            onCancel={() => navigate("/movements")}
            submitLabel={t("movements.transfer")}
        >
            {mutationResult?.isError && (
                <FormErrorBanner
                    title={t("movements.errorCreatingTransfer")}
                    error={mutationResult.error}
                />
            )}

            {/* Section 1: Product */}
            <FormSection
                title={t("movements.product")}
                description={t("movements.productSectionDescTransfer")}
            >
                <Select
                    custom
                    label={t("movements.productModel")}
                    value={productId}
                    onChange={(val) => {
                        setProductId(String(val));
                        setIdentifier("");
                        setBatchIdentifier("");
                    }}
                    options={productOptions}
                    placeholder={t("movements.selectProductPlaceholder")}
                    required
                />
            </FormSection>

            {/* Section 2: Transfer Details */}
            {productId && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <FormSection
                        title={t("movements.transfer")}
                        description={t("movements.transferSectionDesc")}
                    >
                        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                            <Select
                                custom
                                label={t("movements.fromLocation")}
                                value={fromLocationId}
                                onChange={(val) => {
                                    setFromLocationId(String(val));
                                    // Clear destination if it matches new source
                                    if (String(val) === toLocationId) {
                                        setToLocationId("");
                                    }
                                }}
                                options={fromLocationOptions}
                                placeholder={t("movements.sourcePlaceholderShort")}
                                required
                            />

                            <div className="flex items-center justify-center pb-1">
                                <ArrowRight
                                    size={20}
                                    className={
                                        fromLocationId && toLocationId
                                            ? "text-blue-400"
                                            : "text-zinc-600"
                                    }
                                />
                            </div>

                            <Select
                                custom
                                label={t("movements.toLocation")}
                                value={toLocationId}
                                onChange={(val) => setToLocationId(String(val))}
                                options={toLocationOptions}
                                placeholder={t("movements.destinationPlaceholderShort")}
                                required
                            />
                        </div>

                        {locationMismatch && (
                            <p className="text-xs text-red-400">
                                {t("movements.locationMismatch")}
                            </p>
                        )}

                        {/* Visual flow indicator */}
                        {fromLocationId && toLocationId && !locationMismatch && (
                            <div className="flex items-center justify-center gap-3 py-2 text-sm border border-blue-500/20 bg-blue-500/5 rounded-lg">
                                <span className="text-zinc-300 font-medium">{fromName}</span>
                                <ArrowRight size={16} className="text-blue-400" />
                                <span className="text-blue-400 font-medium">{toName}</span>
                            </div>
                        )}

                        {!isIndividual && (
                            <Input
                                label={t("movements.quantity")}
                                type="number"
                                min="1"
                                step="1"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                required
                                helperText={t("movements.quantityHelperTransfer")}
                            />
                        )}

                        <Input
                            label={t("movements.reason")}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={t("movements.reasonPlaceholderTransfer")}
                            helperText={t("movements.reasonHelper")}
                        />
                    </FormSection>
                </div>
            )}

            {/* Section 3: Batch details (BATCH products) */}
            {productId && fromLocationId && toLocationId && isBatch && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <FormSection
                        title={t("movements.batchInfo")}
                        description={t("movements.batchInfoDescTransfer")}
                    >
                        <Input
                            label={t("movements.batchIdentifier")}
                            value={batchIdentifier}
                            onChange={(e) => setBatchIdentifier(e.target.value)}
                            placeholder={t("movements.batchIdentifierPlaceholder")}
                            helperText={t("movements.batchIdentifierHelperTransfer")}
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
            )}

            {/* Section 4: Individual item (INDIVIDUAL/serialized products) */}
            {productId && fromLocationId && toLocationId && isIndividual && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <FormSection
                        title={t("movements.itemIdentification")}
                        description={t("movements.itemIdentificationDescTransfer")}
                    >
                        <Input
                            label={t("movements.serialNumberIdentifier")}
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            placeholder={t("movements.serialPlaceholder")}
                            required
                            helperText={t("movements.serialHelperTransfer")}
                        />
                    </FormSection>
                </div>
            )}
        </FormPage>
    );
};
