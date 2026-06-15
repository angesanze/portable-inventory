import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MovementCreate } from "../create";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// CLEANUP-05 round-trip: a movement draft is snapshotted to sessionStorage
// before an inline-create jump, restored on remount, the just-created entity is
// preselected from the URL, and the draft is cleared on a successful submit.

const DRAFT_KEY = "draft:movements:create";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

// Mutable state shared with the hoisted @refinedev/core mock.
const h = vi.hoisted(() => ({
    suppliers: [] as any[],
    onMutationSuccess: undefined as undefined | ((d: any) => void),
}));

const mockProducts = [
    {
        id: "pm-1",
        name: "Bulk Widget",
        sku: "BW-001",
        profile: "SIMPLE_COUNT",
        tracking_mode: "BULK",
        engine_type: "counter",
    },
];
const mockLocations = [
    { id: "loc-1", name: "Main Warehouse", type: "WAREHOUSE" },
    { id: "loc-2", name: "Retail Store", type: "STORE" },
    { id: "loc-3", name: "External Vendor", type: "VIRTUAL" },
];

vi.mock("@refinedev/core", () => ({
    // Capture the onMutationSuccess callback and fire it (with the Refine-wrapped
    // shape `{ data: { id } }`) when the form is submitted, so we can assert the
    // draft gets cleared on success.
    useForm: (opts: any) => {
        h.onMutationSuccess = opts?.onMutationSuccess;
        return {
            onFinish: vi.fn(async () => {
                h.onMutationSuccess?.({ data: { id: "mv-1" } });
            }),
            mutationResult: { isLoading: false, isError: false, error: null },
        };
    },
    useList: ({ resource }: { resource: string }) => {
        if (resource === "product-models") {
            return { data: { data: mockProducts }, isLoading: false };
        }
        if (resource === "locations") {
            return { data: { data: mockLocations }, isLoading: false };
        }
        if (resource === "suppliers") {
            return { data: { data: h.suppliers }, isLoading: false };
        }
        return { data: { data: [] }, isLoading: false };
    },
    useCustom: () => ({ data: null, isLoading: false }),
}));

function renderAt(entry: string) {
    return render(
        <MemoryRouter initialEntries={[entry]}>
            <MovementCreate />
        </MemoryRouter>,
    );
}

describe("MovementCreate draft round-trip (CLEANUP-05)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        h.suppliers = [];
        h.onMutationSuccess = undefined;
    });

    it("snapshots the in-progress form to sessionStorage when an inline-create link is clicked", () => {
        renderAt("/movements/create?direction=inbound");

        // Select a product so the rest of the form (and the supplier inline-create
        // link, since no suppliers exist) becomes visible.
        fireEvent.click(screen.getByRole("combobox"));
        fireEvent.click(screen.getByText("Bulk Widget"));

        // Fill another field.
        fireEvent.change(screen.getByLabelText("Quantity"), {
            target: { value: "7" },
        });

        // No suppliers → the "Add one" inline-create link is shown. Clicking it
        // should snapshot the draft then navigate to /suppliers/create.
        fireEvent.click(screen.getByText("Add one"));

        const raw = sessionStorage.getItem(DRAFT_KEY);
        expect(raw).not.toBeNull();
        const draft = JSON.parse(raw as string);
        expect(draft.productId).toBe("pm-1");
        expect(draft.direction).toBe("inbound");
        expect(draft.quantity).toBe("7");

        expect(mockNavigate).toHaveBeenCalledWith(
            expect.stringMatching(/^\/suppliers\/create\?returnTo=/),
        );
    });

    it("restores a drafted form on remount and preselects the just-created supplier", () => {
        // A supplier was created on-the-fly and is now in the list.
        h.suppliers = [{ id: "sup-9", name: "Acme Supply", vat_number: "IT123", is_active: true }];

        // Seed the draft that was snapshotted before the inline-create jump.
        sessionStorage.setItem(
            DRAFT_KEY,
            JSON.stringify({
                productId: "pm-1",
                direction: "inbound",
                quantity: "7",
                locationId: "loc-1",
                reason: "Restock",
                supplierId: "",
                batchIdentifier: "",
                batchLotNumber: "",
                batchExpiry: "",
                identifier: "",
            }),
        );

        renderAt("/movements/create?direction=inbound&created_supplier=sup-9");

        // Previously entered fields are restored.
        expect(screen.getByLabelText("Quantity")).toHaveValue(7);
        expect(screen.getByDisplayValue("Restock")).toBeInTheDocument();

        // The created supplier (from ?created_supplier) is preselected — its name
        // shows in the supplier select trigger.
        expect(screen.getByText("Acme Supply")).toBeInTheDocument();

        // The one-shot created_supplier param is stripped from the URL.
        expect(mockNavigate).toHaveBeenCalledWith(
            expect.objectContaining({ pathname: "/movements/create" }),
            { replace: true },
        );
    });

    it("clears the draft after a successful submit", async () => {
        sessionStorage.setItem(
            DRAFT_KEY,
            JSON.stringify({
                productId: "pm-1",
                direction: "inbound",
                quantity: "5",
                locationId: "loc-1",
                reason: "Restock",
                supplierId: "",
                batchIdentifier: "",
                batchLotNumber: "",
                batchExpiry: "",
                identifier: "",
            }),
        );

        renderAt("/movements/create?direction=inbound");

        // Submit (inbound label is "Check In").
        fireEvent.click(screen.getByText("Check In"));

        await waitFor(() => {
            expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
        });
        expect(mockNavigate).toHaveBeenCalledWith("/movements");
    });
});
