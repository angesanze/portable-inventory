import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { MovementTypePicker } from "./MovementTypePicker";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

function renderPicker() {
    return render(
        <BrowserRouter>
            <MovementTypePicker />
        </BrowserRouter>,
    );
}

describe("MovementTypePicker", () => {
    it("renders all three movement type cards", () => {
        renderPicker();

        expect(screen.getByText("Receive Stock")).toBeInTheDocument();
        expect(screen.getByText("Ship / Consume")).toBeInTheDocument();
        expect(screen.getByText("Transfer Between Locations")).toBeInTheDocument();
    });

    it("renders descriptions for each type", () => {
        renderPicker();

        expect(
            screen.getByText(
                "Record inventory arriving at a location from an external source",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Record inventory leaving a location (shipping, usage, waste)",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Move inventory from one of your locations to another",
            ),
        ).toBeInTheDocument();
    });

    it("navigates to inbound create on Receive Stock click", () => {
        renderPicker();

        fireEvent.click(screen.getByText("Receive Stock"));
        expect(mockNavigate).toHaveBeenCalledWith(
            "/movements/create?direction=inbound",
        );
    });

    it("navigates to outbound create on Ship / Consume click", () => {
        renderPicker();

        fireEvent.click(screen.getByText("Ship / Consume"));
        expect(mockNavigate).toHaveBeenCalledWith(
            "/movements/create?direction=outbound",
        );
    });

    it("navigates to transfer on Transfer click", () => {
        renderPicker();

        fireEvent.click(screen.getByText("Transfer Between Locations"));
        expect(mockNavigate).toHaveBeenCalledWith("/movements/transfer");
    });
});
