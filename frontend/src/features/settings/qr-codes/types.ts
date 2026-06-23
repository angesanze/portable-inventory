/**
 * Local types for the QR-codes settings area.
 *
 * Narrowly mirrors the `qr-codes` payload plus the lookup resources
 * (product-models, api-keys, locations, batches, work-orders) used to build the
 * generate/configure selects. Only fields read in this feature are declared.
 */

export type QRCodeStatus = "VIRGIN" | "CONFIGURED" | "LOCKED" | string;

/** A row in the qr-codes list / target of the show & configure modals. */
export interface QRCode {
    id: string;
    code: string;
    label?: string | null;
    target_display?: string;
    status: QRCodeStatus;
    qr_url: string;
    product_model?: string | null;
    batch?: string | null;
    work_order?: string | null;
}

/** A product-model option for the configure select. */
export interface QRProductModel {
    id: string;
    name: string;
    sku: string;
    profile?: string;
    components?: unknown[];
}

/** An api-key option for the generate select. */
export interface QRApiKey {
    id: string;
    label: string;
}

/** A location option for the generate select. */
export interface QRLocation {
    id: string;
    name: string;
    type: string;
}

/** A batch option for the configure select. */
export interface QRBatch {
    id: string;
    batch_identifier?: string | null;
    identifier?: string | null;
}

/** A work-order option for the configure select. */
export interface QRWorkOrder {
    id: string;
    name: string;
}
