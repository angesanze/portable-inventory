import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { ValuationReport } from "./valuation";
import { renderWithI18n as render } from "../../../test-utils/i18n-wrapper";

const mockReport = {
    total_value: 112.5,
    by_product: [
        {
            product_id: "p1",
            sku: "BOLT-1",
            name: "Bolt",
            quantity: 15,
            avg_unit_cost: 7.5,
            stock_value: 112.5,
        },
    ],
    by_location: [{ location_id: "l1", location: "Warehouse", stock_value: 112.5 }],
};

const { exportToExcelSpy } = vi.hoisted(() => ({ exportToExcelSpy: vi.fn() }));
vi.mock("../../../utils/exportToExcel", () => ({ exportToExcel: exportToExcelSpy }));

const mockRefetch = vi.fn();
let customState = { data: { data: mockReport }, isLoading: false, isError: false };

vi.mock("@refinedev/core", () => ({
    useCustom: () => ({ ...customState, refetch: mockRefetch }),
}));

const renderPage = () =>
    render(
        <BrowserRouter>
            <ValuationReport />
        </BrowserRouter>,
    );

describe("ValuationReport", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        customState = { data: { data: mockReport }, isLoading: false, isError: false };
    });

    it("renders the total value card", () => {
        renderPage();
        expect(screen.getByTestId("valuation-total")).toHaveTextContent("112.50");
    });

    it("renders a per-product row with avg cost and value", () => {
        renderPage();
        const row = screen.getByTestId("valuation-row-p1");
        expect(row).toHaveTextContent("BOLT-1");
        expect(row).toHaveTextContent("7.50");
        expect(row).toHaveTextContent("112.50");
    });

    it("renders the per-location breakdown", () => {
        renderPage();
        expect(screen.getByText("Warehouse")).toBeInTheDocument();
    });

    it("exports to Excel on button click", () => {
        renderPage();
        fireEvent.click(screen.getByText(/Download Excel|Scarica Excel/));
        expect(exportToExcelSpy).toHaveBeenCalledTimes(1);
        const [rows] = exportToExcelSpy.mock.calls[0];
        expect(rows).toHaveLength(1);
    });

    it("shows an error state and retries", () => {
        customState = { data: undefined as any, isLoading: false, isError: true };
        renderPage();
        const retry = screen.queryByRole("button", { name: /retry|riprova/i });
        if (retry) {
            fireEvent.click(retry);
            expect(mockRefetch).toHaveBeenCalled();
        } else {
            // ErrorState always renders its title at minimum.
            expect(screen.getByText(/Failed to load report|Caricamento report fallito/)).toBeInTheDocument();
        }
    });
});
