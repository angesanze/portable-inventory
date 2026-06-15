import { useCreate, useUpdate, useDelete } from "@refinedev/core";
import { useState } from "react";
import { useToast } from "../../../components/ui/Toast";

export const useQRActions = (refetch: () => void) => {
    const { mutateAsync: createQR } = useCreate();
    const { mutateAsync: updateQR } = useUpdate();
    const { mutateAsync: deleteQR } = useDelete();
    const { toast } = useToast();

    const [generating, setGenerating] = useState(false);

    const handleGenerateBatch = async (
        selectedApiKey: string,
        generateCount: number,
        labelPrefix: string,
        selectedLocation: string
    ) => {
        if (!selectedApiKey) {
            toast({ message: "Please select an API Key first", variant: "error" });
            return;
        }
        setGenerating(true);
        try {
            await createQR({
                resource: "qr-codes/generate_batch",
                values: {
                    count: generateCount,
                    label_prefix: labelPrefix,
                    api_key: selectedApiKey,
                    location_id: selectedLocation || undefined
                }
            });
            refetch();
        } catch (err) {
            console.error("Failed to generate QR codes", err);
        } finally {
            setGenerating(false);
        }
    };

    const handleLock = async (qr: any) => {
        try {
            await updateQR({
                resource: "qr-codes",
                id: `${qr.id}/lock`,
                values: {}
            });
            refetch();
        } catch (err) {
            console.error("Failed to lock", err);
        }
    };

    const handleUnlock = async (qr: any) => {
        try {
            await updateQR({
                resource: "qr-codes",
                id: `${qr.id}/unlock`,
                values: {}
            });
            refetch();
        } catch (err) {
            console.error("Failed to unlock", err);
        }
    };

    const handleConfigure = async (configuring: any, configProduct: string, configBatch: string, configWorkOrder: string, callback: () => void) => {
        if (!configuring) return;
        try {
            await updateQR({
                resource: "qr-codes",
                id: configuring.id,
                values: {
                    product_model: configProduct || null,
                    batch: configBatch || null,
                    work_order: configWorkOrder || null
                }
            });
            refetch();
            callback();
        } catch (err) {
            console.error("Failed to configure", err);
        }
    };

    const handleDelete = async (qr: any, confirm: () => Promise<boolean>) => {
        if (!(await confirm())) return;
        await deleteQR({ resource: "qr-codes", id: qr.id });
        setTimeout(() => refetch(), 300);
    };

    return {
        generating,
        handleGenerateBatch,
        handleLock,
        handleUnlock,
        handleConfigure,
        handleDelete
    };
};
