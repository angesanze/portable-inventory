import * as XLSX from "xlsx";

export type ExportCellValue = string | number | boolean | null | undefined;

export interface ExportColumn<T> {
    key: keyof T | ((row: T) => ExportCellValue);
    header: string;
    format?: (value: ExportCellValue) => ExportCellValue;
}

function getValue<T>(column: ExportColumn<T>, row: T): ExportCellValue {
    if (typeof column.key === "function") {
        return column.key(row);
    }
    const raw = (row as Record<string, unknown>)[column.key as string];
    if (raw === undefined || raw === null) return null;
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
        return raw;
    }
    return String(raw);
}

export function exportToExcel<T>(
    rows: T[],
    columns: ExportColumn<T>[],
    filename: string,
): void {
    const headers = columns.map((c) => c.header);
    const data = rows.map((row) =>
        columns.map((col) => {
            const value = getValue(col, row);
            return col.format ? col.format(value) : value;
        }),
    );
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, filename);
}
