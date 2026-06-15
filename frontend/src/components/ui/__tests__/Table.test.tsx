import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "../Table";

describe("Table", () => {
    it("renders a full composed table", () => {
        render(
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Qty</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow>
                        <TableCell>Widget A</TableCell>
                        <TableCell>10</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        );
        expect(screen.getByText("Name")).toBeTruthy();
        expect(screen.getByText("Qty")).toBeTruthy();
        expect(screen.getByText("Widget A")).toBeTruthy();
        expect(screen.getByText("10")).toBeTruthy();
    });

    it("renders table element with correct base classes", () => {
        render(
            <Table data-testid="table">
                <TableBody>
                    <TableRow>
                        <TableCell>A</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        );
        const table = screen.getByTestId("table");
        expect(table.tagName).toBe("TABLE");
        expect(table.className).toContain("w-full");
        expect(table.className).toContain("text-sm");
    });

    it("wraps table in container div", () => {
        render(
            <Table data-testid="table">
                <TableBody>
                    <TableRow>
                        <TableCell>A</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        );
        const wrapper = screen.getByTestId("table").parentElement!;
        expect(wrapper.tagName).toBe("DIV");
        expect(wrapper.className).toContain("w-full");
    });
});

describe("TableHead", () => {
    it("applies design-system header styles", () => {
        render(
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Col</TableHead>
                    </TableRow>
                </TableHeader>
            </Table>
        );
        const th = screen.getByText("Col");
        expect(th.tagName).toBe("TH");
        expect(th.className).toContain("text-xs");
        expect(th.className).toContain("font-medium");
        expect(th.className).toContain("text-zinc-500");
        expect(th.className).toContain("uppercase");
        expect(th.className).toContain("tracking-wider");
        expect(th.className).toContain("border-b");
        expect(th.className).toContain("border-white/[0.06]");
    });
});

describe("TableRow", () => {
    it("applies row styles with hover", () => {
        render(
            <Table>
                <TableBody>
                    <TableRow data-testid="row">
                        <TableCell>X</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        );
        const row = screen.getByTestId("row");
        expect(row.className).toContain("border-b");
        expect(row.className).toContain("border-white/[0.04]");
        expect(row.className).toContain("hover:bg-white/[0.02]");
        expect(row.className).toContain("transition-colors");
    });
});

describe("TableCell", () => {
    it("applies cell styles", () => {
        render(
            <Table>
                <TableBody>
                    <TableRow>
                        <TableCell>Data</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        );
        const td = screen.getByText("Data");
        expect(td.tagName).toBe("TD");
        expect(td.className).toContain("py-3");
        expect(td.className).toContain("px-4");
        expect(td.className).toContain("text-sm");
        expect(td.className).toContain("text-zinc-50");
    });
});

describe("Table merges custom className", () => {
    it("on Table", () => {
        render(
            <Table className="min-w-[600px]" data-testid="table">
                <TableBody>
                    <TableRow>
                        <TableCell>A</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        );
        expect(screen.getByTestId("table").className).toContain("min-w-[600px]");
    });

    it("on TableHead", () => {
        render(
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="text-right">H</TableHead>
                    </TableRow>
                </TableHeader>
            </Table>
        );
        expect(screen.getByText("H").className).toContain("text-right");
    });

    it("on TableCell", () => {
        render(
            <Table>
                <TableBody>
                    <TableRow>
                        <TableCell className="font-mono">C</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        );
        expect(screen.getByText("C").className).toContain("font-mono");
    });
});
