import { screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";

import { ProductModelList } from "./list";
import { renderWithI18n as render } from "../../../test-utils/i18n-wrapper";

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return { ...actual, useNavigate: () => vi.fn() };
});

const mockModels = [
    {
        id: "uuid-001",
        name: "Widget Alpha",
        sku: "WA-001",
        profile: "SIMPLE_COUNT",
        tracking_mode: "BULK",
        engine_type: "standard",
        created_at: "2026-04-20T12:00:00Z",
        stock_summary: { total: 10, tracking_mode: "BULK", status: "OK" },
    },
    {
        id: "uuid-002",
        name: "Gadget Beta",
        sku: "GB-002",
        profile: "SIMPLE_COUNT",
        tracking_mode: "BULK",
        engine_type: "standard",
        created_at: "2026-04-22T08:00:00Z",
        stock_summary: { total: 5, tracking_mode: "BULK", status: "OK" },
    },
];

vi.mock("@refinedev/core", () => ({
    useList: () => ({ data: { data: mockModels }, isLoading: false }),
    useDelete: () => ({ mutate: vi.fn() }),
    useCustomMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({}) }),
    useNotification: () => ({ open: vi.fn() }),
    useGetIdentity: () => ({
        data: { capabilities: { manage_own_inventory: true } },
        isLoading: false,
    }),
}));

function renderList() {
    return render(
        <BrowserRouter>
            <ProductModelList />
        </BrowserRouter>,
    );
}

const headerCheckbox = () =>
    screen.getByLabelText("Select all rows") as HTMLInputElement;
const rowCheckbox = (name: string) =>
    screen.getByLabelText(`Select ${name}`) as HTMLInputElement;

describe("ProductModelList selection column", () => {
    it("renders a header checkbox and one checkbox per row", () => {
        renderList();
        expect(headerCheckbox()).toBeInTheDocument();
        expect(rowCheckbox("Widget Alpha")).toBeInTheDocument();
        expect(rowCheckbox("Gadget Beta")).toBeInTheDocument();
    });

    it("toggling a row checkbox marks it selected without navigating", () => {
        renderList();
        const cb = rowCheckbox("Widget Alpha");
        expect(cb.checked).toBe(false);
        fireEvent.click(cb);
        expect(cb.checked).toBe(true);
    });

    it("partial selection produces an indeterminate header checkbox", () => {
        renderList();
        const cb = rowCheckbox("Widget Alpha");
        fireEvent.click(cb);
        expect(headerCheckbox().indeterminate).toBe(true);
        expect(headerCheckbox().checked).toBe(false);
    });

    it("header checkbox selects every row, second click clears", () => {
        renderList();
        const header = headerCheckbox();
        fireEvent.click(header);
        expect(rowCheckbox("Widget Alpha").checked).toBe(true);
        expect(rowCheckbox("Gadget Beta").checked).toBe(true);
        expect(header.checked).toBe(true);
        expect(header.indeterminate).toBe(false);

        fireEvent.click(header);
        expect(rowCheckbox("Widget Alpha").checked).toBe(false);
        expect(rowCheckbox("Gadget Beta").checked).toBe(false);
    });
});
