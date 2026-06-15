import { render, screen, fireEvent } from "@testing-library/react";
import { MovementCreate } from "../create";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// Phase 04 (TRACKER-STATUS-04 task 7) smoke test: a SERIALIZED product with an
// engine_ui_config of input_type "tracker" + status_transitions branches the
// MovementCreate form to the StatusPicker flow — quantity input vanishes,
// allowed transition buttons appear.

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const trackerProduct = {
    id: "pm-tracker",
    name: "Field Sensor",
    sku: "FS-001",
    profile: "SERIALIZED",
    tracking_mode: "INDIVIDUAL",
    engine_type: "tracker",
    engine_ui_config: {
        input_type: "tracker",
        fields: [],
        status_transitions: { ACTIVE: ["BROKEN"], DECOMMISSIONED: [] },
    },
};

let physicalStatus = "ACTIVE";

vi.mock("@refinedev/core", () => ({
    useForm: () => ({
        onFinish: vi.fn(async () => {}),
        mutationResult: { isLoading: false, isError: false, error: null },
    }),
    useList: ({ resource }: { resource: string }) => {
        if (resource === "product-models") {
            return { data: { data: [trackerProduct] }, isLoading: false };
        }
        if (resource === "locations") {
            return { data: { data: [] }, isLoading: false };
        }
        if (resource === "suppliers") {
            return { data: { data: [] }, isLoading: false };
        }
        if (resource === "physical-products") {
            return {
                data: {
                    data: [
                        {
                            id: "pp-1",
                            product_model: "pm-tracker",
                            identifier: "SN-1",
                            status: physicalStatus,
                        },
                    ],
                },
                isLoading: false,
            };
        }
        return { data: { data: [] }, isLoading: false };
    },
    useCustom: () => ({ data: null, isLoading: false }),
}));

describe("MovementCreate tracker branch (TRACKER-STATUS-04)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        physicalStatus = "ACTIVE";
    });

    it("renders StatusPicker (no quantity input) for SERIALIZED tracker product", () => {
        render(
            <MemoryRouter initialEntries={["/movements/create"]}>
                <MovementCreate />
            </MemoryRouter>,
        );

        // Select the tracker product.
        fireEvent.click(screen.getByRole("combobox"));
        fireEvent.click(screen.getByText("Field Sensor"));

        // Identifier gate: StatusPicker only renders once a serial is entered
        // (current-status lookup is identifier-keyed).
        const identifierInput = screen.getAllByRole("textbox")[0];
        fireEvent.change(identifierInput, { target: { value: "SN-1" } });

        // Matching PhysicalProduct → status_transitions["ACTIVE"] = ["BROKEN"].
        expect(screen.getByRole("button", { name: "BROKEN" })).toBeInTheDocument();

        // Numeric flow is replaced — no quantity input.
        expect(screen.queryByLabelText("Quantity")).not.toBeInTheDocument();

        // Direction selector hidden in tracker mode (TRACKER-STATUS-05 task 6).
        // Direction label appears only on the inbound/outbound Select; absent here.
        expect(screen.queryByText(/^Direction$/)).not.toBeInTheDocument();

        // Submit label switches to status-change copy in tracker mode (TRACKER-STATUS-05 task 4).
        expect(
            screen.getByRole("button", { name: /Apply status change/i }),
        ).toBeInTheDocument();
    });

    it("ignores ?direction= URL hint for tracker products (TRACKER-STATUS-05 task 7)", () => {
        render(
            <MemoryRouter initialEntries={["/movements/create?direction=inbound"]}>
                <MovementCreate />
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole("combobox"));
        fireEvent.click(screen.getByText("Field Sensor"));

        // Preselected-direction pill must NOT render for tracker products.
        expect(screen.queryByText(/Receiving stock/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Shipping out/i)).not.toBeInTheDocument();
        // Direction Select label also absent (section 2 fully gated by !isTracker).
        expect(screen.queryByText(/^Direction$/)).not.toBeInTheDocument();
    });

    it("gates submit and hides picker when current status has empty transition list", () => {
        // status_transitions["DECOMMISSIONED"] = [] → terminal state.
        physicalStatus = "DECOMMISSIONED";

        render(
            <MemoryRouter initialEntries={["/movements/create"]}>
                <MovementCreate />
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole("combobox"));
        fireEvent.click(screen.getByText("Field Sensor"));

        const identifierInput = screen.getAllByRole("textbox")[0];
        fireEvent.change(identifierInput, { target: { value: "SN-1" } });

        // Message shown, no transition buttons rendered.
        expect(
            screen.getByText(/No transitions available from 'DECOMMISSIONED'/),
        ).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "BROKEN" })).not.toBeInTheDocument();

        // Submit gated (label now uses status-change copy in tracker mode).
        const submit = screen.getByRole("button", { name: /Apply status change/i });
        expect(submit).toBeDisabled();
    });
});
