import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { StocktakeView } from "./view";
import { ToastProvider } from "../../../components/ui/Toast";
import { renderWithI18n as render } from "../../../test-utils/i18n-wrapper";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ id: "cs-001" }),
    };
});

const mockSession = {
    id: "cs-001",
    location_name: "Main Warehouse",
    status: "COUNTING",
    lines: [
        {
            id: "line-bulk",
            product_name: "Widget A",
            product_sku: "WID-001",
            product_profile: "SIMPLE_COUNT",
            batch_identifier: null,
            identifier: null,
            expected_qty: "100",
            counted_qty: null,
        },
        {
            id: "line-serial",
            product_name: "Asset X",
            product_sku: "ASSET-X",
            product_profile: "SERIALIZED",
            batch_identifier: null,
            identifier: "SN-42",
            expected_qty: "1",
            counted_qty: null,
        },
    ],
};

const mockVariance = {
    session_id: "cs-001",
    status: "COUNTING",
    variances: [
        {
            line_id: "line-bulk",
            product_sku: "WID-001",
            product_name: "Widget A",
            batch_identifier: null,
            identifier: null,
            expected_qty: "100",
            counted_qty: "97",
            variance: "-3",
        },
    ],
    uncounted: [{ line_id: "line-serial", product_id: "p2" }],
    movements_after_snapshot: true,
};

const mockActionAsync = vi.fn().mockResolvedValue({ data: { adjustments: 1 } });
const mockRefetch = vi.fn();
const mockRefetchVar = vi.fn();

vi.mock("@refinedev/core", () => ({
    useOne: () => ({ data: { data: mockSession }, isLoading: false, refetch: mockRefetch }),
    useCustom: () => ({ data: { data: mockVariance }, refetch: mockRefetchVar }),
    useCustomMutation: () => ({ mutateAsync: mockActionAsync, isLoading: false }),
    useNotification: () => ({ open: vi.fn() }),
}));

function renderView() {
    return render(
        <ToastProvider>
            <BrowserRouter>
                <StocktakeView />
            </BrowserRouter>
        </ToastProvider>,
    );
}

describe("StocktakeView — count tab", () => {
    beforeEach(() => {
        mockActionAsync.mockClear();
        mockRefetch.mockClear();
        mockRefetchVar.mockClear();
    });

    it("renders the location header and one row per expected item", () => {
        renderView();
        expect(screen.getByText("Main Warehouse")).toBeInTheDocument();
        expect(screen.getByTestId("count-line-line-bulk")).toBeInTheDocument();
        expect(screen.getByTestId("count-line-line-serial")).toBeInTheDocument();
    });

    it("progress reflects counted inputs", () => {
        renderView();
        expect(screen.getByTestId("progress-label").textContent).toContain("0 / 2");
        fireEvent.change(screen.getByTestId("count-input-line-bulk"), {
            target: { value: "97" },
        });
        expect(screen.getByTestId("progress-label").textContent).toContain("1 / 2");
    });

    it("scan focuses the matching row by identifier", () => {
        renderView();
        const scan = screen.getByTestId("scan-input") as HTMLInputElement;
        fireEvent.change(scan, { target: { value: "SN-42" } });
        fireEvent.submit(scan.closest("form")!);
        expect(document.activeElement).toBe(screen.getByTestId("count-input-line-serial"));
    });

    it("save POSTs only counted lines to /count/", async () => {
        renderView();
        fireEvent.change(screen.getByTestId("count-input-line-bulk"), {
            target: { value: "97" },
        });
        fireEvent.click(screen.getByTestId("save-counts-button"));
        await waitFor(() => expect(mockActionAsync).toHaveBeenCalledTimes(1));
        const payload = mockActionAsync.mock.calls[0][0];
        expect(payload.url).toMatch(/\/count-sessions\/cs-001\/count\/$/);
        expect(payload.values.counts).toEqual([{ line_id: "line-bulk", qty: "97" }]);
    });
});

describe("StocktakeView — review tab", () => {
    beforeEach(() => {
        mockActionAsync.mockClear();
        mockRefetch.mockClear();
        mockRefetchVar.mockClear();
    });

    it("shows only variance rows with surplus/shortfall badge", () => {
        renderView();
        fireEvent.click(screen.getByTestId("tab-review"));
        expect(screen.getByTestId("variance-line-bulk")).toBeInTheDocument();
        expect(screen.getByText(/Shortfall -3/)).toBeInTheDocument();
    });

    it("warns about movements after the snapshot", () => {
        renderView();
        fireEvent.click(screen.getByTestId("tab-review"));
        expect(screen.getByTestId("movements-warning")).toBeInTheDocument();
    });

    it("lists the uncounted rows count", () => {
        renderView();
        fireEvent.click(screen.getByTestId("tab-review"));
        expect(screen.getByTestId("uncounted-count").textContent).toContain("1");
    });

    it("apply POSTs to /apply/ with the uncounted mode after confirm", async () => {
        renderView();
        fireEvent.click(screen.getByTestId("tab-review"));
        fireEvent.click(screen.getByTestId("apply-button"));
        // ConfirmDialog renders — click its confirm.
        const confirmBtn = await screen.findByTestId("confirm-dialog-confirm");
        fireEvent.click(confirmBtn);
        await waitFor(() => expect(mockActionAsync).toHaveBeenCalled());
        const call = mockActionAsync.mock.calls.find((c) =>
            String(c[0].url).includes("/apply/"),
        );
        expect(call).toBeTruthy();
        expect(call![0].values).toEqual({ uncounted: "skip" });
    });
});
