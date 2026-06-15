import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { exportToExcel, type ExportColumn } from "../exportToExcel";

vi.mock("xlsx", async () => {
    const actual = await vi.importActual<typeof import("xlsx")>("xlsx");
    return {
        ...actual,
        writeFile: vi.fn(),
    };
});

interface Row {
    id: number;
    name: string;
    qty: number | null;
    when?: Date;
}

function getSheetAOA(workbook: XLSX.WorkBook): unknown[][] {
    const sheet = workbook.Sheets["Data"];
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
}

describe("exportToExcel", () => {
    const writeFileMock = XLSX.writeFile as unknown as ReturnType<typeof vi.fn>;

    beforeEach(() => {
        writeFileMock.mockClear();
    });

    it("calls XLSX.writeFile with the given filename and a single 'Data' sheet", () => {
        const rows: Row[] = [{ id: 1, name: "A", qty: 5 }];
        const columns: ExportColumn<Row>[] = [
            { key: "id", header: "ID" },
            { key: "name", header: "Name" },
            { key: "qty", header: "Qty" },
        ];

        exportToExcel(rows, columns, "out.xlsx");

        expect(writeFileMock).toHaveBeenCalledTimes(1);
        const [workbook, filename] = writeFileMock.mock.calls[0] as [XLSX.WorkBook, string];
        expect(filename).toBe("out.xlsx");
        expect(workbook.SheetNames).toEqual(["Data"]);
        expect(workbook.Sheets["Data"]).toBeDefined();
    });

    it("writes header row followed by mapped data rows", () => {
        const rows: Row[] = [
            { id: 1, name: "Alpha", qty: 10 },
            { id: 2, name: "Beta", qty: 20 },
        ];
        const columns: ExportColumn<Row>[] = [
            { key: "id", header: "ID" },
            { key: "name", header: "Name" },
            { key: "qty", header: "Qty" },
        ];

        exportToExcel(rows, columns, "out.xlsx");

        const [workbook] = writeFileMock.mock.calls[0] as [XLSX.WorkBook];
        const aoa = getSheetAOA(workbook);
        expect(aoa).toEqual([
            ["ID", "Name", "Qty"],
            [1, "Alpha", 10],
            [2, "Beta", 20],
        ]);
    });

    it("applies column.format to values when provided", () => {
        const rows: Row[] = [{ id: 1, name: "x", qty: 7 }];
        const columns: ExportColumn<Row>[] = [
            { key: "id", header: "ID" },
            {
                key: "qty",
                header: "Qty x2",
                format: (v) => (typeof v === "number" ? v * 2 : v),
            },
        ];

        exportToExcel(rows, columns, "out.xlsx");

        const [workbook] = writeFileMock.mock.calls[0] as [XLSX.WorkBook];
        const aoa = getSheetAOA(workbook);
        expect(aoa).toEqual([
            ["ID", "Qty x2"],
            [1, 14],
        ]);
    });

    it("supports function keys (computed columns)", () => {
        const rows: Row[] = [
            { id: 1, name: "Alpha", qty: 3 },
            { id: 2, name: "Beta", qty: 4 },
        ];
        const columns: ExportColumn<Row>[] = [
            { key: (r) => `${r.id}-${r.name}`, header: "Composite" },
        ];

        exportToExcel(rows, columns, "out.xlsx");

        const [workbook] = writeFileMock.mock.calls[0] as [XLSX.WorkBook];
        const aoa = getSheetAOA(workbook);
        expect(aoa).toEqual([
            ["Composite"],
            ["1-Alpha"],
            ["2-Beta"],
        ]);
    });

    it("emits null for missing/undefined values", () => {
        const rows: Row[] = [
            { id: 1, name: "A", qty: null },
            { id: 2, name: "B", qty: 9 },
        ];
        const columns: ExportColumn<Row>[] = [
            { key: "id", header: "ID" },
            { key: "qty", header: "Qty" },
        ];

        exportToExcel(rows, columns, "out.xlsx");

        const [workbook] = writeFileMock.mock.calls[0] as [XLSX.WorkBook];
        const aoa = getSheetAOA(workbook);
        expect(aoa).toEqual([
            ["ID", "Qty"],
            [1, null],
            [2, 9],
        ]);
    });

    it("coerces non-primitive cell values via String()", () => {
        const when = new Date("2026-05-29T00:00:00Z");
        const rows: Row[] = [{ id: 1, name: "A", qty: 1, when }];
        const columns: ExportColumn<Row>[] = [
            { key: "when", header: "When" },
        ];

        exportToExcel(rows, columns, "out.xlsx");

        const [workbook] = writeFileMock.mock.calls[0] as [XLSX.WorkBook];
        const aoa = getSheetAOA(workbook);
        expect(aoa[0]).toEqual(["When"]);
        expect(typeof (aoa[1] as unknown[])[0]).toBe("string");
        expect((aoa[1] as unknown[])[0]).toBe(String(when));
    });

    it("writes only headers when rows is empty", () => {
        const columns: ExportColumn<Row>[] = [
            { key: "id", header: "ID" },
            { key: "name", header: "Name" },
        ];

        exportToExcel<Row>([], columns, "empty.xlsx");

        const [workbook, filename] = writeFileMock.mock.calls[0] as [XLSX.WorkBook, string];
        expect(filename).toBe("empty.xlsx");
        const aoa = getSheetAOA(workbook);
        expect(aoa).toEqual([["ID", "Name"]]);
    });
});
