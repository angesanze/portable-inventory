import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { ReturnOrderResolve } from "./resolve";
import { ToastProvider } from "../../../components/ui/Toast";
import { renderWithI18n as render } from "../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ id: "rma-1" }),
    };
});

const mockPost = vi.fn().mockResolvedValue({});
const mockRefetch = vi.fn();

const mockOrder = {
    id: "rma-1",
    number: "RMA-2026-0001",
    kind: "CUSTOMER_RETURN",
    status: "RECEIVED",
    customer_name: "Mario Rossi",
    reason_code: "DEFECTIVE",
    lines: [
        {
            id: "line-1",
            product_name: "Widget A",
            product_sku: "SKU-1",
            physical_identifier: null,
            quantity: "2",
            resolution: "PENDING",
        },
        {
            id: "line-2",
            product_name: "Widget B",
            product_sku: "SKU-2",
            physical_identifier: null,
            quantity: "1",
            resolution: "RESTOCK",
        },
    ],
};

const mockLocations = [
    { id: "wh-1", name: "Main Warehouse", type: "WAREHOUSE", is_sellable: true },
    { id: "qz-1", name: "Quarantena", type: "WAREHOUSE", is_sellable: false },
];

vi.mock("@refinedev/core", () => ({
    useOne: () => ({ data: { data: mockOrder }, isLoading: false, refetch: mockRefetch }),
    useList: ({ resource }: any) => ({
        data: {
            data: resource === "locations" ? mockLocations : [{ id: "sup-1", name: "Acme" }],
        },
    }),
    useCustomMutation: () => ({ mutateAsync: mockPost, isLoading: false }),
}));

function renderResolve() {
    return render(
        <ToastProvider>
            <BrowserRouter>
                <ReturnOrderResolve />
            </BrowserRouter>
        </ToastProvider>,
    );
}

describe("ReturnOrderResolve", () => {
    beforeEach(() => {
        mockNavigate.mockClear();
        mockPost.mockClear();
        mockRefetch.mockClear();
    });

    it("renders the RMA header and only the PENDING line", () => {
        renderResolve();
        expect(screen.getByText("RMA-2026-0001")).toBeInTheDocument();
        expect(screen.getByText("Mario Rossi")).toBeInTheDocument();
        // PENDING line shown for resolution.
        expect(screen.getByTestId("resolve-line-line-1")).toBeInTheDocument();
        // Already-resolved line is not offered again.
        expect(screen.queryByTestId("resolve-line-line-2")).toBeNull();
    });

    it("offers the three resolution outcomes", () => {
        renderResolve();
        // Only one PENDING line → exactly one resolution picker (placeholder).
        fireEvent.click(screen.getByText("Choose an outcome"));
        expect(screen.getByText("Restock")).toBeInTheDocument();
        expect(screen.getByText("Scrap")).toBeInTheDocument();
        expect(screen.getByText("Return to supplier")).toBeInTheDocument();
    });

    it("posts the chosen resolution to the resolve endpoint", async () => {
        renderResolve();
        fireEvent.click(screen.getByText("Choose an outcome"));
        fireEvent.click(screen.getByText("Scrap"));

        // Submit via the FormPage primary action.
        const submit = screen.getByText("Apply resolutions");
        fireEvent.click(submit);

        await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
        const call = mockPost.mock.calls[0][0];
        expect(call.url).toContain("/return-orders/rma-1/resolve/");
        expect(call.method).toBe("post");
        expect(call.values.resolutions).toEqual([
            { line_id: "line-1", resolution: "SCRAP" },
        ]);
    });
});
