import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useTableSelection } from "../useTableSelection";

const rows = (...ids: string[]) => ids.map((id) => ({ id }));

describe("useTableSelection", () => {
    it("starts empty", () => {
        const { result } = renderHook(() => useTableSelection(rows("a", "b", "c")));
        expect(result.current.selectedIds.size).toBe(0);
        expect(result.current.isAllSelected).toBe(false);
        expect(result.current.isPartial).toBe(false);
    });

    it("toggleOne adds and removes a single id", () => {
        const { result } = renderHook(() => useTableSelection(rows("a", "b", "c")));

        act(() => result.current.toggleOne("a"));
        expect(Array.from(result.current.selectedIds)).toEqual(["a"]);
        expect(result.current.isPartial).toBe(true);
        expect(result.current.isAllSelected).toBe(false);

        act(() => result.current.toggleOne("a"));
        expect(result.current.selectedIds.size).toBe(0);
    });

    it("toggleAll selects every visible row", () => {
        const { result } = renderHook(() => useTableSelection(rows("a", "b", "c")));

        act(() => result.current.toggleAll());
        expect(Array.from(result.current.selectedIds).sort()).toEqual([
            "a",
            "b",
            "c",
        ]);
        expect(result.current.isAllSelected).toBe(true);
        expect(result.current.isPartial).toBe(false);
    });

    it("toggleAll on a fully-selected view clears it (idempotent toggle)", () => {
        const { result } = renderHook(() => useTableSelection(rows("a", "b")));

        act(() => result.current.toggleAll());
        expect(result.current.isAllSelected).toBe(true);

        act(() => result.current.toggleAll());
        expect(result.current.selectedIds.size).toBe(0);
        expect(result.current.isAllSelected).toBe(false);
        expect(result.current.isPartial).toBe(false);
    });

    it("isPartial true while only some rows are selected", () => {
        const { result } = renderHook(() => useTableSelection(rows("a", "b", "c")));
        act(() => result.current.toggleOne("b"));
        expect(result.current.isPartial).toBe(true);
        expect(result.current.isAllSelected).toBe(false);
    });

    it("clear() drops every selection", () => {
        const { result } = renderHook(() => useTableSelection(rows("a", "b")));
        act(() => result.current.toggleAll());
        expect(result.current.selectedIds.size).toBe(2);

        act(() => result.current.clear());
        expect(result.current.selectedIds.size).toBe(0);
    });

    it("isAllSelected stays false when the visible list is empty", () => {
        const { result } = renderHook(() => useTableSelection(rows()));
        expect(result.current.isAllSelected).toBe(false);
        expect(result.current.isPartial).toBe(false);
    });

    it("toggleAll on a partial selection promotes it to full", () => {
        const { result } = renderHook(() => useTableSelection(rows("a", "b", "c")));
        act(() => result.current.toggleOne("a"));
        expect(result.current.isPartial).toBe(true);

        act(() => result.current.toggleAll());
        expect(result.current.isAllSelected).toBe(true);
        expect(Array.from(result.current.selectedIds).sort()).toEqual([
            "a",
            "b",
            "c",
        ]);
    });
});
