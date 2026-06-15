import type { ExportColumn } from "../../../utils/exportToExcel";

export interface LocationExportRow {
    name: string;
    type: string;
    parent_name?: string | null;
    parent_id?: string | null;
}

export const LOCATION_EXPORT_COLUMNS: ExportColumn<LocationExportRow>[] = [
    { key: "name", header: "Name" },
    { key: "type", header: "Type" },
    { key: (r) => r.parent_name ?? null, header: "Parent" },
];

export const LOCATION_EXPORT_FILENAME = "locations";
