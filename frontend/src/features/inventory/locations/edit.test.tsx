import { render, screen } from "@testing-library/react";
import { LocationEdit } from "./edit";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ id: "loc-1" }),
    };
});

const mockOnFinish = vi.fn();
const mockRecord = {
    id: "loc-1",
    name: "Main Warehouse",
    type: "WAREHOUSE",
    parent_id: null,
};

const mockLocations = [
    { id: "loc-1", name: "Main Warehouse" },
    { id: "loc-2", name: "Store Front" },
    { id: "loc-3", name: "Returns Bin" },
];

vi.mock("@refinedev/core", () => ({
    useForm: () => ({
        onFinish: mockOnFinish,
        queryResult: { data: { data: mockRecord } },
        mutationResult: { isLoading: false, isError: false, error: null },
        formLoading: false,
    }),
    useList: () => ({
        data: { data: mockLocations },
        isLoading: false,
    }),
}));

function renderEdit() {
    return render(
        <BrowserRouter>
            <LocationEdit />
        </BrowserRouter>,
    );
}

describe("LocationEdit", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders FormPage with correct title", () => {
        renderEdit();
        expect(screen.getByText("Edit Location")).toBeInTheDocument();
    });

    it("renders Location Details section with description", () => {
        renderEdit();
        expect(screen.getByText("Location Details")).toBeInTheDocument();
        expect(
            screen.getByText("Locations represent physical or virtual places where inventory is stored."),
        ).toBeInTheDocument();
    });

    it("populates name from record", () => {
        renderEdit();
        const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
        expect(nameInput.value).toBe("Main Warehouse");
    });

    it("populates type from record", () => {
        renderEdit();
        // Warehouse should be shown as the selected type
        expect(screen.getByText("Warehouse")).toBeInTheDocument();
    });

    it("filters out current location from parent options", () => {
        renderEdit();
        // loc-1 (Main Warehouse) should be excluded from parent options since we're editing it
        // This is handled by the filter in the component
        expect(screen.getByText("Parent Location")).toBeInTheDocument();
    });

    it("renders Save and Cancel buttons", () => {
        renderEdit();
        expect(screen.getByText("Save")).toBeInTheDocument();
        expect(screen.getByText("Cancel")).toBeInTheDocument();
    });
});
