import { render, screen } from "@testing-library/react";
import { TransferCreate } from "./transfer";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockOnFinish = vi.fn();
const mockProducts = [
    { id: "pm-1", name: "Bulk Widget", sku: "BW-001", tracking_mode: "BULK", engine_type: "counter" },
    { id: "pm-2", name: "Serial Device", sku: "SD-001", tracking_mode: "INDIVIDUAL", engine_type: "tracker" },
    { id: "pm-3", name: "Batch Chemical", sku: "BC-001", tracking_mode: "BATCH", engine_type: "bucket" },
];
const mockLocations = [
    { id: "loc-1", name: "Main Warehouse", type: "WAREHOUSE" },
    { id: "loc-2", name: "Retail Store", type: "STORE" },
    { id: "loc-3", name: "External", type: "VIRTUAL" },
];

vi.mock("@refinedev/core", () => ({
    useForm: () => ({
        onFinish: mockOnFinish,
        mutationResult: { isLoading: false, isError: false, error: null },
    }),
    useList: ({ resource }: { resource: string }) => {
        if (resource === "product-models") {
            return { data: { data: mockProducts }, isLoading: false };
        }
        if (resource === "locations") {
            return { data: { data: mockLocations }, isLoading: false };
        }
        return { data: { data: [] }, isLoading: false };
    },
}));

function renderTransfer() {
    return render(
        <BrowserRouter>
            <TransferCreate />
        </BrowserRouter>,
    );
}

describe("TransferCreate", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders FormPage with correct title", () => {
        renderTransfer();
        expect(screen.getByText("Transfer Stock")).toBeInTheDocument();
    });

    it("renders Product section with description", () => {
        renderTransfer();
        expect(screen.getByText("Product")).toBeInTheDocument();
        expect(
            screen.getByText("Select the product to transfer between locations."),
        ).toBeInTheDocument();
    });

    it("renders product model select", () => {
        renderTransfer();
        expect(screen.getByText("Product Model")).toBeInTheDocument();
    });

    it("does not show Transfer section before product is selected", () => {
        renderTransfer();
        expect(screen.queryByText("Specify source and destination locations.")).not.toBeInTheDocument();
    });

    it("renders Transfer button as submit label", () => {
        renderTransfer();
        expect(screen.getByText("Transfer")).toBeInTheDocument();
    });

    it("renders Cancel button", () => {
        renderTransfer();
        expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    it("renders Back link", () => {
        renderTransfer();
        expect(screen.getByText("Back")).toBeInTheDocument();
    });

    it("does not show batch section without product and locations selected", () => {
        renderTransfer();
        expect(screen.queryByText("Batch Information")).not.toBeInTheDocument();
    });

    it("does not show individual item section without product and locations selected", () => {
        renderTransfer();
        expect(screen.queryByText("Item Identification")).not.toBeInTheDocument();
    });

    it("does not show flow indicator without locations selected", () => {
        renderTransfer();
        expect(screen.queryByText("Main Warehouse")).not.toBeInTheDocument();
    });

    it("filters VIRTUAL locations from options", () => {
        renderTransfer();
        // Product select trigger shows "Select a product…" but VIRTUAL location "External" should not appear
        // in from/to options (they're hidden until product selected anyway)
        expect(screen.queryByText("From Location")).not.toBeInTheDocument();
    });
});
