import { PROFILE_METADATA } from '../../../types/api';
import type { InventoryProfile, ProfileMetadata } from '../../../types/api';

export interface UiConfig {
    input_type: string;
    input_label?: string;
    step?: number;
    allow_negative?: boolean;
    engine_config?: any;
    fields?: Array<{ key: string; label: string; type: string }>;
    status_transitions?: Record<string, string[]>;
}

export interface Product {
    id: string;
    sku: string;
    name: string;
    profile?: InventoryProfile;
    quantity: number;
    unit?: string | null;
    attributes?: any;
    calc_config?: {
        engine: string;
        ui_config: UiConfig;
    } | any;
    /** @deprecated Use profile + PROFILE_METADATA instead. */
    engine_type?: string;
    /** @deprecated Use profile + PROFILE_METADATA instead. */
    tracking_mode?: string;
    components?: any[];
}

export interface Location {
    id: string;
    name: string;
    type: string;
    parent_id?: string | null;
}

export interface ProductBatch {
    id: string;
    batch_identifier: string;
    quantity: number;
    data: any;
    work_order?: string;
    product_model: string;
    location: string;
}

export interface PhysicalItem {
    id: string;
    identifier: string;
    status: string;
}

export interface WidgetData {
    product_name: string;
    profile?: InventoryProfile;
    engine: string;
    current_stock_display: string;
    ui_config: UiConfig;
}

/** Derive widget input type from profile, with fallback to engine_type for legacy data. */
export function getWidgetInputType(product: Product): string {
    if (product.profile) {
        return PROFILE_METADATA[product.profile].widgetInputType;
    }
    // Legacy fallback
    return product.calc_config?.ui_config?.input_type || product.engine_type || 'number';
}
