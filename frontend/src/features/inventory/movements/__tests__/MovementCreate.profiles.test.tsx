import { render, screen, fireEvent } from "@testing-library/react";
import { MovementCreate } from "../create";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// PRESET-LOGIC-07: per-profile gating regression — confirm MovementCreate
// surfaces the right conditional sections for each inventory profile under an
// inbound movement. One test per profile (BULK / BATCH_TRACKED / PERISHABLE /
// SERIALIZED-individual). The SERIALIZED-tracker branch lives in
// MovementCreate.tracker.test.tsx and is not duplicated here.

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const products = [
    {
        id: "pm-simple",
        name: "Bulk Widget",
        sku: "BW-001",
        profile: "SIMPLE_COUNT",
        tracking_mode: "BULK",
        engine_type: "counter",
    },
    {
        id: "pm-dim",
        name: "Fabric Roll",
        sku: "FR-001",
        profile: "DIMENSIONAL",
        tracking_mode: "BULK",
        engine_type: "dimension",
    },
    {
        id: "pm-batch",
        name: "Chem Batch",
        sku: "CB-001",
        profile: "BATCH_TRACKED",
        tracking_mode: "BATCH",
        engine_type: "bucket",
    },
    {
        id: "pm-perish",
        name: "Yogurt",
        sku: "YG-001",
        profile: "PERISHABLE",
        tracking_mode: "BATCH",
        engine_type: "time_based",
    },
    {
        id: "pm-serial",
        name: "Bare Asset",
        sku: "BA-001",
        profile: "SERIALIZED",
        tracking_mode: "INDIVIDUAL",
        engine_type: "tracker",
        // No engine_ui_config.status_transitions → form uses the
        // individual-serial branch, not the tracker StatusPicker branch.
    },
];

const locations = [
    { id: "loc-wh", name: "Main Warehouse", type: "WAREHOUSE" },
    { id: "loc-ext", name: "External Vendor", type: "VIRTUAL" },
];

let lastOnFinishPayload: any = null;
const mockOnFinish = vi.fn(async (payload: any) => {
    lastOnFinishPayload = payload;
});

vi.mock("@refinedev/core", () => ({
    useForm: () => ({
        onFinish: mockOnFinish,
        mutationResult: { isLoading: false, isError: false, error: null },
    }),
    useList: ({ resource }: { resource: string }) => {
        if (resource === "product-models") return { data: { data: products } };
        if (resource === "locations") return { data: { data: locations } };
        if (resource === "suppliers") return { data: { data: [] } };
        if (resource === "physical-products") return { data: { data: [] } };
        return { data: { data: [] } };
    },
    useCustom: () => ({ data: null, isLoading: false }),
}));

function renderInbound() {
    return render(
        <MemoryRouter initialEntries={["/movements/create?direction=inbound"]}>
            <MovementCreate />
        </MemoryRouter>,
    );
}

function selectProduct(name: string) {
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText(name));
}

describe("MovementCreate — per-profile gating (PRESET-LOGIC-07)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        lastOnFinishPayload = null;
    });

    it("SIMPLE_COUNT: shows quantity, no batch / serial sections", () => {
        renderInbound();
        selectProduct("Bulk Widget");

        expect(screen.getByLabelText(/Quantity/i)).toBeInTheDocument();
        expect(screen.queryByText("Batch Information")).not.toBeInTheDocument();
        expect(screen.queryByText("Item Identification")).not.toBeInTheDocument();
    });

    it("DIMENSIONAL: behaves as BULK in movement form (quantity, no batch)", () => {
        renderInbound();
        selectProduct("Fabric Roll");

        expect(screen.getByLabelText(/Quantity/i)).toBeInTheDocument();
        expect(screen.queryByText("Batch Information")).not.toBeInTheDocument();
        expect(screen.queryByText("Item Identification")).not.toBeInTheDocument();
    });

    it("BATCH_TRACKED: surfaces Batch Information section with optional fields", () => {
        renderInbound();
        selectProduct("Chem Batch");

        expect(screen.getByLabelText(/Quantity/i)).toBeInTheDocument();
        expect(screen.getByText("Batch Information")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("e.g. BATCH-2026-04")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("e.g. LOT-A1234")).toBeInTheDocument();
        // Serial input absent for BATCH profile.
        expect(screen.queryByText("Item Identification")).not.toBeInTheDocument();
    });

    it("PERISHABLE: surfaces Batch Information section (includes expiry date)", () => {
        renderInbound();
        selectProduct("Yogurt");

        expect(screen.getByLabelText(/Quantity/i)).toBeInTheDocument();
        expect(screen.getByText("Batch Information")).toBeInTheDocument();
        // Date input — match by type since multiple "Expiry Date" labels exist.
        const expiryInputs = document.querySelectorAll('input[type="date"]');
        expect(expiryInputs.length).toBeGreaterThan(0);
    });

    it("SERIALIZED (no tracker transitions): surfaces Item Identification, hides quantity", () => {
        renderInbound();
        selectProduct("Bare Asset");

        expect(screen.getByText("Item Identification")).toBeInTheDocument();
        expect(screen.getByLabelText(/Serial Number/i)).toBeInTheDocument();
        // SERIALIZED uses identifier in place of numeric quantity.
        expect(screen.queryByLabelText(/Quantity/i)).not.toBeInTheDocument();
    });
});
