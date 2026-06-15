export type Bucket =
  | "HEALTHY"
  | "REORDER"
  | "CRITICAL"
  | "OUT"
  | "OVERSTOCK";

export interface Card {
  id: string;
  sku: string;
  name: string;
  qty: number;
  reorder_threshold: number | null;
  max_threshold: number | null;
  bucket: Bucket;
  urgency: number;
  velocity_7d: number;
  days_to_runout: number | null;
  sparkline: number[];
}

export interface Column {
  count: number;
  products: Card[];
}

export type Columns = Record<Bucket, Column>;

export interface BoardTotals {
  products: number;
  needs_attention: number;
}

export interface BoardResponse {
  columns: Columns;
  totals: BoardTotals;
  generated_at: string;
}
