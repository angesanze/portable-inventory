import { render, screen, fireEvent } from "@testing-library/react";
import { LocationCreate } from "./create";
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
const mockLocations = [
    { id: "loc-1", name: "Main Warehouse" },
    { id: "loc-2", name: "Store Front" },
];

vi.mock("@refinedev/core", () => ({
    useForm: () => ({
        onFinish: mockOnFinish,
        mutationResult: { isLoading: false, isError: false, error: null },
    }),
    useList: () => ({
        data: { data: mockLocations },
        isLoading: false,
    }),
}));

function renderCreate() {
    return render(
        <BrowserRouter>
            <LocationCreate />
        </BrowserRouter>,
    );
}

describe("LocationCreate", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders FormPage with correct title", () => {
        renderCreate();
        expect(screen.getByText("New Location")).toBeInTheDocument();
    });

    it("renders Location Details section with description", () => {
        renderCreate();
        expect(screen.getByText("Location Details")).toBeInTheDocument();
        expect(
            screen.getByText("Locations represent physical or virtual places where inventory is stored."),
        ).toBeInTheDocument();
    });

    it("renders name input field", () => {
        renderCreate();
        expect(screen.getByLabelText("Name")).toBeInTheDocument();
    });

    it("renders type select with all location types", () => {
        renderCreate();
        expect(screen.getByText("Type")).toBeInTheDocument();
        // Default selection shown
        expect(screen.getByText("Warehouse")).toBeInTheDocument();
    });

    it("renders parent location select", () => {
        renderCreate();
        expect(screen.getByText("Parent Location")).toBeInTheDocument();
    });

    it("renders Save and Cancel buttons", () => {
        renderCreate();
        expect(screen.getByText("Save")).toBeInTheDocument();
        expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    it("renders Back link", () => {
        renderCreate();
        expect(screen.getByText("Back")).toBeInTheDocument();
    });
});
