/**
 * Core API Type Definitions for Varasto
 */

// ── Inventory Profile (primary discriminant) ──────────────────────────

export type InventoryProfile =
    | 'SIMPLE_COUNT'
    | 'UNIT_CONVERSION'
    | 'DIMENSIONAL'
    | 'BATCH_TRACKED'
    | 'PERISHABLE'
    | 'SERIALIZED'
    | 'ASSEMBLED';

export interface ProfileMetadata {
    label: string;
    description: string;
    trackingMode: 'BULK' | 'INDIVIDUAL' | 'BATCH';
    engineType: 'counter' | 'converter' | 'bucket' | 'tracker' | 'dimension' | 'time_based';
    widgetInputType: 'number' | 'bucket_form' | 'tracker' | 'dimension' | 'time_based' | 'batch_manager';
    supportsBatches: boolean;
    supportsSerials: boolean;
    supportsFormula: boolean;
}

export const PROFILE_METADATA: Record<InventoryProfile, ProfileMetadata> = {
    SIMPLE_COUNT: {
        label: 'Simple Count',
        description: 'Basic quantity tracking (bolts, screws, generic items)',
        trackingMode: 'BULK',
        engineType: 'counter',
        widgetInputType: 'number',
        supportsBatches: false,
        supportsSerials: false,
        supportsFormula: false,
    },
    UNIT_CONVERSION: {
        label: 'Unit Conversion',
        description: 'Stock with automatic unit conversion (liters ↔ bottles)',
        trackingMode: 'BULK',
        engineType: 'converter',
        widgetInputType: 'number',
        supportsBatches: false,
        supportsSerials: false,
        supportsFormula: false,
    },
    DIMENSIONAL: {
        label: 'Dimensional',
        description: 'Computed stock from dimensions (fabric m², timber m³)',
        trackingMode: 'BULK',
        engineType: 'dimension',
        widgetInputType: 'dimension',
        supportsBatches: false,
        supportsSerials: false,
        supportsFormula: true,
    },
    BATCH_TRACKED: {
        label: 'Batch / Lot Tracked',
        description: 'Stock tracked by batch with metadata (pharma, chemicals)',
        trackingMode: 'BATCH',
        engineType: 'bucket',
        widgetInputType: 'bucket_form',
        supportsBatches: true,
        supportsSerials: false,
        supportsFormula: false,
    },
    PERISHABLE: {
        label: 'Perishable / Time-Based',
        description: 'Batch tracking with expiry dates (food, medicine)',
        trackingMode: 'BATCH',
        engineType: 'time_based',
        widgetInputType: 'time_based',
        supportsBatches: true,
        supportsSerials: false,
        supportsFormula: false,
    },
    SERIALIZED: {
        label: 'Serialized / Individual',
        description: 'Unique items tracked by serial number (equipment, tools)',
        trackingMode: 'INDIVIDUAL',
        engineType: 'tracker',
        widgetInputType: 'tracker',
        supportsBatches: false,
        supportsSerials: true,
        supportsFormula: false,
    },
    ASSEMBLED: {
        label: 'Assembled / Kit',
        description: 'Multi-component products with BOM (kits, assemblies)',
        trackingMode: 'BULK',
        engineType: 'counter',
        widgetInputType: 'batch_manager',
        supportsBatches: false,
        supportsSerials: false,
        supportsFormula: false,
    },
};

// ── Derived types (read-only, computed from profile on backend) ───────

/** Derived from profile on backend. */
export type TrackingMode = ProfileMetadata['trackingMode'];

/** Engine type — used by CalculatorTemplate and derived from profile on ProductModel. */
export type EngineType = ProfileMetadata['engineType'];

export interface EngineUiConfig {
    input_type: string;
    fields: Array<{
        name: string;
        label: string;
        options?: string[];
    }>;
    status_transitions?: Record<string, string[]>;
}

export type LocationType = 'WAREHOUSE' | 'STORE' | 'LOSS' | 'VIRTUAL';

export interface Company {
    id: string;
    name: string;
    license_code: string;
}

export interface CalculatorTemplate {
    id: string;
    name: string;
    engine_type: EngineType;
    engine_config: Record<string, unknown>;
    company: string;
}

export interface ProductModel {
    id: string;
    sku: string;
    name: string;
    barcode?: string;
    description?: string;
    profile: InventoryProfile;
    /** Read-only, derived from profile on backend. */
    tracking_mode: TrackingMode;
    /** Read-only, derived from profile on backend. */
    engine_type: EngineType;
    engine_config: Record<string, unknown>;
    engine_ui_config?: EngineUiConfig | null;
    company: string;
    initial_balance?: number;
    attributes: Record<string, unknown>;
    default_calculator?: string | null;
    created_at: string;
}

export interface Location {
    id: string;
    name: string;
    type: LocationType;
    company: string;
    parent?: string;
}

export interface WorkOrder {
    id: string;
    order_number: string;
    status: 'OPEN' | 'CLOSED' | 'ARCHIVED';
    company: string;
}

export interface ProductBatch {
    id: string;
    product_model: string | ProductModel;
    location: string | Location;
    work_order?: string | WorkOrder;
    batch_identifier: string;
    quantity: number;
    data: Record<string, unknown>;
}

export interface PhysicalProduct {
    id: string;
    product_model: string | ProductModel;
    identifier: string;
    location: string | Location;
    work_order?: string | WorkOrder;
    status: 'ACTIVE' | 'RECALL' | 'EXPIRED';
}

export interface Movement {
    id: string;
    product_model: string | ProductModel;
    from_location: string | Location;
    to_location: string | Location;
    quantity: number;
    occurred_at: string;
    reason: string;
    user: string;
}

export interface DynamicQRCode {
    id: string;
    status: 'VIRGIN' | 'CONFIGURED' | 'LOCKED';
    target_type?: string;
    target_id?: string;
    api_key?: string;
    url: string;
}
