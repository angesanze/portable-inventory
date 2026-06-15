import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QuickAdjust } from "../QuickAdjust";

// Mock axiosInstance
const mockPost = vi.fn().mockResolvedValue({ data: { status: "success" } });
vi.mock("../../../providers/axios-client", () => ({
    axiosInstance: { post: (...args: unknown[]) => mockPost(...args) },
}));

// Mock refine hooks
vi.mock("@refinedev/core", () => ({
    useNotification: () => ({ open: vi.fn() }),
    useList: () => ({
        data: { data: [{ id: "loc-1" }] },
    }),
}));

describe("QuickAdjust", () => {
    const product = { id: "prod-1", profile: "SIMPLE_COUNT", stock_value: 10 };

    beforeEach(() => {
        mockPost.mockClear();
    });

    it("does not send api_key in request payload", async () => {
        render(<QuickAdjust product={product} onUpdate={vi.fn()} />);

        const buttons = screen.getAllByRole("button");
        const addBtn = buttons[buttons.length - 1]; // Plus is always last
        fireEvent.click(addBtn);

        await waitFor(() => expect(mockPost).toHaveBeenCalled());

        const [url, payload] = mockPost.mock.calls[0];
        expect(url).toBe("/api/v1/widget/move/");
        expect(payload).not.toHaveProperty("api_key");
        expect(payload.product_id).toBe("prod-1");
        expect(payload.location_id).toBe("loc-1");
    });

    it("uses axiosInstance (JWT auth) instead of raw axios", async () => {
        render(<QuickAdjust product={product} onUpdate={vi.fn()} />);

        const buttons = screen.getAllByRole("button");
        fireEvent.click(buttons[buttons.length - 1]);

        await waitFor(() => expect(mockPost).toHaveBeenCalled());
        expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it("sends positive quantity for add, negative for subtract", async () => {
        render(<QuickAdjust product={product} onUpdate={vi.fn()} />);

        const buttons = screen.getAllByRole("button");
        // AGGREGATE: [Minus, Plus]
        const subtractBtn = buttons[0];
        const addBtn = buttons[1];

        fireEvent.click(addBtn);
        await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
        expect(mockPost.mock.calls[0][1].quantity).toBe(1);

        mockPost.mockClear();

        fireEvent.click(subtractBtn);
        await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
        expect(mockPost.mock.calls[0][1].quantity).toBe(-1);
    });
});
