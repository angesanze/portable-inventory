import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReservationList } from "./list";
import { ToastProvider } from "../../../components/ui/Toast";
import { renderWithI18n as render } from "../../../test-utils/i18n-wrapper";

const mockReservations = [
    {
        id: "res-001",
        quantity: "6.0000",
        status: "ACTIVE",
        reference: "Ordine #1234",
        expires_at: "2026-07-01T10:00:00Z",
        created_at: "2026-06-10T09:00:00Z",
        product_sku: "SKU-001",
        product_name: "Widget Alpha",
        location_name: "Magazzino Centrale",
        batch_identifier: null,
        physical_identifier: null,
    },
    {
        id: "res-002",
        quantity: "2.0000",
        status: "RELEASED",
        reference: "",
        expires_at: null,
        created_at: "2026-06-09T15:30:00Z",
        product_sku: "SKU-002",
        product_name: "Widget Beta",
        location_name: null,
        batch_identifier: null,
        physical_identifier: null,
    },
    {
        id: "res-003",
        quantity: "1.0000",
        status: "CONSUMED",
        reference: "Lavoro 88",
        expires_at: null,
        created_at: "2026-06-08T12:00:00Z",
        product_sku: "SKU-003",
        product_name: "Widget Gamma",
        location_name: "Negozio",
        batch_identifier: null,
        physical_identifier: "SN-42",
    },
];

const mockRefetch = vi.fn();
const mockMutateAsync = vi.fn().mockResolvedValue({});
const useListSpy = vi.fn();

vi.mock("@refinedev/core", () => ({
    useList: (params: any) => {
        useListSpy(params);
        if (params?.resource === "reservations") {
            return {
                data: { data: mockReservations, total: mockReservations.length },
                isLoading: false,
                isError: false,
                refetch: mockRefetch,
            };
        }
        // product-models / locations lookups used by the create modal
        return { data: { data: [] }, isLoading: false, isError: false, refetch: vi.fn() };
    },
    useCustomMutation: () => ({
        mutateAsync: mockMutateAsync,
        isLoading: false,
        isError: false,
        error: null,
        reset: vi.fn(),
    }),
}));

function renderList() {
    return render(
        <ToastProvider>
            <ReservationList />
        </ToastProvider>,
    );
}

describe("ReservationList rendering", () => {
    beforeEach(() => {
        mockRefetch.mockClear();
        mockMutateAsync.mockClear();
        useListSpy.mockClear();
    });

    it("renders one row per reservation with product, sku, reference and status badge", () => {
        renderList();

        expect(screen.getByText("Widget Alpha")).toBeInTheDocument();
        expect(screen.getByText("SKU-001")).toBeInTheDocument();
        expect(screen.getByText("Ordine #1234")).toBeInTheDocument();

        // Status badges (default test language: English)
        expect(screen.getByText("Active")).toBeInTheDocument();
        expect(screen.getByText("Released")).toBeInTheDocument();
        expect(screen.getByText("Consumed")).toBeInTheDocument();
    });

    it("shows the company-level fallback when location is null", () => {
        renderList();
        expect(screen.getByText("Any location")).toBeInTheDocument();
    });

    it("requests the reservations resource with server-side pagination", () => {
        renderList();
        const reservationCall = useListSpy.mock.calls.find(
            ([params]) => params?.resource === "reservations",
        );
        expect(reservationCall).toBeTruthy();
        expect(reservationCall![0].pagination).toEqual({ current: 1, pageSize: 20 });
    });

    it("renders the Release action only for ACTIVE reservations", () => {
        renderList();
        expect(screen.getByTestId("release-res-001")).toBeInTheDocument();
        expect(screen.queryByTestId("release-res-002")).not.toBeInTheDocument();
        expect(screen.queryByTestId("release-res-003")).not.toBeInTheDocument();
    });
});

describe("ReservationList release flow", () => {
    beforeEach(() => {
        mockRefetch.mockClear();
        mockMutateAsync.mockClear();
        mockMutateAsync.mockResolvedValue({});
    });

    it("confirming the dialog POSTs to the release endpoint, refetches and toasts", async () => {
        renderList();

        fireEvent.click(screen.getByTestId("release-res-001"));

        // Confirm dialog appears
        const dialog = await screen.findByTestId("confirm-dialog");
        expect(dialog).toBeInTheDocument();

        fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));

        await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
        const call = mockMutateAsync.mock.calls[0][0];
        expect(call.url).toContain("/api/v1/reservations/res-001/release/");
        expect(call.method).toBe("post");

        await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
        expect(await screen.findByTestId("toast")).toHaveTextContent(
            "Reservation released",
        );
    });

    it("cancelling the dialog does not call the release endpoint", async () => {
        renderList();

        fireEvent.click(screen.getByTestId("release-res-001"));
        await screen.findByTestId("confirm-dialog");
        fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));

        await waitFor(() =>
            expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument(),
        );
        expect(mockMutateAsync).not.toHaveBeenCalled();
        expect(mockRefetch).not.toHaveBeenCalled();
    });

    it("shows an error toast when the release fails", async () => {
        mockMutateAsync.mockRejectedValueOnce(new Error("insufficient"));
        renderList();

        fireEvent.click(screen.getByTestId("release-res-001"));
        await screen.findByTestId("confirm-dialog");
        fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));

        expect(await screen.findByTestId("toast")).toHaveTextContent(
            "Release failed",
        );
        expect(mockRefetch).not.toHaveBeenCalled();
    });
});
