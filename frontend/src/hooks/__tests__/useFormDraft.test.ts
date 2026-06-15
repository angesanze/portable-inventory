import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useFormDraft } from "../useFormDraft";

interface Draft {
    name: string;
    qty: number;
}

const KEY = "draft:test:create";

afterEach(() => {
    sessionStorage.clear();
});

describe("useFormDraft", () => {
    it("returns null when no draft is stored", () => {
        const { result } = renderHook(() => useFormDraft<Draft>(KEY));
        expect(result.current.restored).toBeNull();
    });

    it("round-trips save -> read on a fresh mount", () => {
        const first = renderHook(() => useFormDraft<Draft>(KEY));
        act(() => {
            first.result.current.save({ name: "widget", qty: 3 });
        });
        expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
            name: "widget",
            qty: 3,
        });

        // A new mount reads the persisted draft.
        const second = renderHook(() => useFormDraft<Draft>(KEY));
        expect(second.result.current.restored).toEqual({ name: "widget", qty: 3 });
    });

    it("clear() removes the stored draft", () => {
        const { result } = renderHook(() => useFormDraft<Draft>(KEY));
        act(() => {
            result.current.save({ name: "x", qty: 1 });
        });
        expect(sessionStorage.getItem(KEY)).not.toBeNull();

        act(() => {
            result.current.clear();
        });
        expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it("returns null when the stored draft is corrupt JSON", () => {
        sessionStorage.setItem(KEY, "{not valid json");
        const { result } = renderHook(() => useFormDraft<Draft>(KEY));
        expect(result.current.restored).toBeNull();
    });

    it("is inert when enabled is false", () => {
        sessionStorage.setItem(KEY, JSON.stringify({ name: "y", qty: 9 }));
        const { result } = renderHook(() =>
            useFormDraft<Draft>(KEY, { enabled: false }),
        );
        expect(result.current.restored).toBeNull();

        act(() => {
            result.current.save({ name: "z", qty: 2 });
        });
        // save is a no-op, the pre-existing value is untouched.
        expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
            name: "y",
            qty: 9,
        });
    });
});
