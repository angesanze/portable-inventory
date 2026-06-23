import { PROFILE_METADATA } from '../../types/api';
import type { InventoryProfile } from '../../types/api';

/** A single configurable input field. The backend reuses one `fields` key for
 *  several engines, so the shape is permissive: bucket forms send `{key,type}`
 *  while tracker/dimension send `{name,options|unit}`. */
export interface UiConfigField {
    key?: string;
    name?: string;
    label: string;
    type?: string;
    unit?: string;
    options?: string[];
}

export interface UiConfig {
    input_type: string;
    input_label?: string;
    step?: number;
    allow_negative?: boolean;
    engine_config?: Record<string, unknown>;
    fields?: UiConfigField[];
    status_transitions?: Record<string, string[]>;
    // Dimension engine
    formula?: string;
    computed_unit?: string;
    // Time-based engine
    expiry_tracking?: boolean;
    time_unit?: string;
}

export interface Product {
    id: string;
    sku: string;
    name: string;
    profile?: InventoryProfile;
    quantity: number;
    unit?: string | null;
    attributes?: { fields?: UiConfigField[]; [key: string]: unknown };
    calc_config?: {
        engine?: string;
        ui_config?: UiConfig;
        status_transitions?: Record<string, string[]>;
    } | null;
    /** @deprecated Use profile + PROFILE_METADATA instead. */
    engine_type?: string;
    /** @deprecated Use profile + PROFILE_METADATA instead. */
    tracking_mode?: string;
    components?: ProductComponent[];
}

/** A kit/BOM component row carried on a parent product. */
export interface ProductComponent {
    child_id: string;
    child_name?: string;
    child_sku?: string;
    child_tracking_mode?: string;
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
    data: Record<string, unknown>;
    work_order?: string;
    product_model: string;
    location: string;
}

/** Raw batch row as returned by `GET /widget/batches/`. Same shape as
 *  {@link ProductBatch} but the API also exposes `location_id` alongside
 *  `location`, which the widget filters on. */
export interface WidgetBatchRow extends ProductBatch {
    location_id?: string;
}

/** A single batch/serial row inside a grouped batch-manager child. The backend
 *  (`widget_product.py`) emits one row shape for both BULK lots (`id`/
 *  `batch_identifier`/`quantity`) and INDIVIDUAL serials (`id`/`identifier`):
 *  `id` is always present, the rest are per-tracking-mode. (There is no
 *  `batch_id` — the row id is `id`.) */
export interface BatchManagerItem {
    id: string;
    quantity?: number;
    batch_identifier?: string;
    identifier?: string;
}

/** A serial candidate offered for assignment to an INDIVIDUAL-tracked model. */
export interface BatchManagerCandidate {
    id?: string;
    identifier?: string;
}

/** A grouped child entry inside a batch-manager / composition payload, matching
 *  the REAL backend shape from `widget_product.py`: the per-model header is
 *  NESTED under `model` (not flat), with the contents under `items`. */
export interface BatchManagerModel {
    model: { id: string; sku?: string; name?: string; tracking_mode?: string };
    total_quantity?: number;
    /** Always emitted by the backend (defaults to `[]`). */
    items: BatchManagerItem[];
    /** Serial-assignment autocomplete candidates. NOTE: the backend does not
     *  currently emit this — the serial picker falls back to free-text scan when
     *  absent (a backend enhancement is needed to populate it). */
    candidates?: BatchManagerCandidate[];
}

/** Source payload consumed by `BatchComposition` — either the assembled
 *  batch-manager payload or a synthetic `{ grouped_items }` built from a
 *  product's BOM components. */
export interface BatchCompositionDataSource {
    grouped_items?: Record<string, BatchManagerModel>;
}

/** Backend payload for an ASSEMBLED product from `GET /widget/{id}/`, rendered
 *  by the self-contained `BatchManagerPanel`. Mirrors the live {@link WidgetData}
 *  config (all optional here — the batch-manager view only needs `product_name`
 *  plus the grouped contents) and adds the grouped per-model batch/serial
 *  contents. A full `WidgetData` is assignable to it. */
export interface BatchManagerData {
    product_name?: string;
    profile?: InventoryProfile;
    engine?: string;
    current_stock_display?: string;
    ui_config?: UiConfig;
    grouped_items?: Record<string, BatchManagerModel>;
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

/** Engine block of a YAML calculator config / saved template. The Calculator
 *  Playground edits these as free-form YAML, so nested config is permissive. */
export interface CalculatorEngineConfig {
    type?: string;
    config?: {
        fields?: UiConfigField[];
        input_label?: string;
        step?: number;
        stock_unit?: string;
        [key: string]: unknown;
    };
}

/** A calculator config object parsed from the playground YAML editor. */
export interface CalculatorConfig {
    name?: string;
    profile?: InventoryProfile;
    initial_stock?: number;
    engine?: CalculatorEngineConfig;
    [key: string]: unknown;
}

/** A saved calculator template row from `GET /calculator-templates/`. */
export interface CalculatorTemplate {
    id: string;
    name: string;
    profile?: InventoryProfile;
    engine_type?: string;
    engine_config?: CalculatorEngineConfig['config'];
}

/** A single product/batch/item row from `GET /widget/location_inventory/`. */
export interface LocationInventoryItem {
    product_name?: string;
    sku?: string;
    quantity?: number;
    type?: string;
    batch_id?: string;
    identifier?: string;
}

/** A product summary row in the `GET /widget/` listing, used to render QR tiles
 *  and preview pickers. */
export interface WidgetProductSummary {
    id: string;
    name: string;
    sku?: string;
    profile?: InventoryProfile;
}

/** Envelope returned by `GET /widget/` — the standard + polymorphic products,
 *  company name, and optional pre-selected default location. */
export interface WidgetListResponse {
    company?: string;
    products?: WidgetProductSummary[];
    poly_products?: WidgetProductSummary[];
    default_location?: { id: string };
}
