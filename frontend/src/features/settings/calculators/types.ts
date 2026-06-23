/**
 * Local types for the calculator-templates (tracking presets) settings area.
 *
 * These mirror the `calculator-templates` / `product-models` API payloads as
 * consumed by the list, create, and edit screens. They are intentionally
 * narrow — only the fields actually read in this feature are declared.
 */

/** Engine config payload — a free-form JSON object keyed by engine field. */
export type EngineConfig = Record<string, unknown>;

/* ─── Per-engine config field shapes ───
 * Each engine type persists a distinct subset of keys. Fields are optional
 * because the form builds the object incrementally and strips empty values.
 */

export interface CounterEngineConfig {
    step?: number;
    input_label?: string;
    allow_negative?: boolean;
}

export interface ConverterEngineConfig {
    ratio_source?: string;
    precision?: number;
    input_label?: string;
    stock_unit?: string;
}

export interface BucketEngineConfig {
    allocation_strategy?: string;
    primary_key?: string;
}

export interface TrackerEngineConfig {
    status_transitions?: Record<string, string[]>;
}

export interface DimensionEngineConfig {
    dimensions?: string[];
    unit?: string;
    computed_unit?: string;
    formula?: string;
}

export interface TimeBasedEngineConfig {
    time_unit?: string;
    expiry_tracking?: boolean;
    auto_decrement?: boolean;
}

/** A row in the calculator-templates list / the edit form record. */
export interface CalculatorTemplate {
    id: string;
    name: string;
    engine_type: string;
    engine_config: EngineConfig | null;
    created_at?: string;
}

/** A product-model row as surfaced in "products using this preset" lists. */
export interface PresetProduct {
    id: string;
    name: string;
    sku?: string;
}
