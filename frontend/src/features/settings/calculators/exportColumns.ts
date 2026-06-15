import type { ExportColumn } from "../../../utils/exportToExcel";

export interface CalculatorExportRow {
    name: string;
    engine_type: string;
    engine_config?: Record<string, unknown> | null;
}

export const CALCULATOR_EXPORT_COLUMNS: ExportColumn<CalculatorExportRow>[] = [
    { key: "name", header: "Name" },
    { key: "engine_type", header: "Engine type" },
    {
        key: (r) => Object.keys(r.engine_config ?? {}).join(", ") || null,
        header: "Config keys",
    },
];

export const CALCULATOR_EXPORT_FILENAME = "calculator-templates";
