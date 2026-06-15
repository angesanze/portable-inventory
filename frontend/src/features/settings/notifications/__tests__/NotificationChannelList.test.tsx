import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithI18n } from "../../../../test-utils/i18n-wrapper";
import { ToastProvider } from "../../../../components/ui/Toast";
import { NotificationChannelList } from "../NotificationChannelList";

const mockChannels = [
    {
        id: "ch-email",
        name: "Ops mail",
        kind: "EMAIL",
        is_active: true,
        recipients: "ops@example.com",
        url: "",
        secret: "",
        headers: {},
        event_filter: [],
        created_at: "2026-06-01T10:00:00Z",
        updated_at: "2026-06-01T10:00:00Z",
    },
    {
        id: "ch-hook",
        name: "ERP hook",
        kind: "WEBHOOK",
        is_active: false,
        recipients: "",
        url: "https://erp.example.com/hooks/pi",
        secret: "s3cr3t",
        headers: {},
        event_filter: ["THRESHOLD"],
        created_at: "2026-06-02T10:00:00Z",
        updated_at: "2026-06-02T10:00:00Z",
    },
];

const mockDeliveries = [
    {
        id: "dl-1",
        channel: "ch-hook",
        channel_name: "ERP hook",
        channel_kind: "WEBHOOK",
        event_log: "ev-1",
        event_message: "Stock quantity 2 is below minimum threshold of 5.",
        product_name: "Widget",
        status: "FAILED",
        attempts: 5,
        last_error: "connection refused",
        next_retry_at: null,
        created_at: "2026-06-03T09:00:00Z",
    },
];

let mockChannelList: any;
let mockDeliveryList: any;
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockRefetch = vi.fn();

vi.mock("@refinedev/core", () => ({
    useList: (opts: any) =>
        opts?.resource === "notification-deliveries" ? mockDeliveryList : mockChannelList,
    useCreate: () => ({ mutate: mockCreateMutate, isLoading: false }),
    useUpdate: () => ({ mutate: mockUpdateMutate, isLoading: false }),
    useDelete: () => ({ mutate: mockDeleteMutate, isLoading: false }),
    useApiUrl: () => "http://api.test/api/v1",
}));

const mockFetch = vi.fn();

function renderPage() {
    return renderWithI18n(
        <ToastProvider>
            <NotificationChannelList />
        </ToastProvider>,
    );
}

describe("NotificationChannelList", () => {
    beforeEach(() => {
        mockChannelList = {
            data: { data: mockChannels },
            isLoading: false,
            isError: false,
            refetch: mockRefetch,
        };
        mockDeliveryList = {
            data: { data: mockDeliveries },
            refetch: vi.fn(),
        };
        mockCreateMutate.mockClear();
        mockUpdateMutate.mockClear();
        mockDeleteMutate.mockClear();
        mockRefetch.mockClear();
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ success: true, error: null }),
        });
        vi.stubGlobal("fetch", mockFetch);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("renders both channels with kind badges and destinations", () => {
        renderPage();
        expect(screen.getByText("Ops mail")).toBeInTheDocument();
        // "ERP hook" also shows up in the deliveries table below.
        expect(screen.getAllByText("ERP hook").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("ops@example.com")).toBeInTheDocument();
        expect(screen.getByText("https://erp.example.com/hooks/pi")).toBeInTheDocument();
        expect(screen.getByText("Webhook")).toBeInTheDocument();
        expect(screen.getByText("Active")).toBeInTheDocument();
        expect(screen.getByText("Inactive")).toBeInTheDocument();
    });

    it("renders the recent deliveries table with status and error", () => {
        renderPage();
        expect(screen.getByText("Recent deliveries")).toBeInTheDocument();
        expect(
            screen.getByText("Stock quantity 2 is below minimum threshold of 5."),
        ).toBeInTheDocument();
        expect(screen.getByText("Failed")).toBeInTheDocument();
        expect(screen.getByText("connection refused")).toBeInTheDocument();
    });

    it("Send test POSTs to the channel test endpoint and toasts success", async () => {
        renderPage();
        fireEvent.click(screen.getByTestId("send-test-ch-email"));

        await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe("http://api.test/api/v1/notification-channels/ch-email/test/");
        expect(init.method).toBe("POST");

        expect(await screen.findByText("Test notification sent.")).toBeInTheDocument();
    });

    it("Send test surfaces backend failure in an error toast", async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 502,
            json: async () => ({ success: false, error: "connection refused" }),
        });
        renderPage();
        fireEvent.click(screen.getByTestId("send-test-ch-hook"));
        expect(
            await screen.findByText("Test failed: connection refused"),
        ).toBeInTheDocument();
    });

    describe("channel form modal", () => {
        it("opens on Add Channel with email fields, switches to webhook fields", () => {
            renderPage();
            fireEvent.click(screen.getByRole("button", { name: /Add Channel/i }));

            expect(screen.getByTestId("modal")).toBeInTheDocument();
            expect(screen.getByTestId("channel-recipients-input")).toBeInTheDocument();
            expect(screen.queryByTestId("channel-url-input")).not.toBeInTheDocument();

            fireEvent.change(screen.getByTestId("channel-kind-select"), {
                target: { value: "WEBHOOK" },
            });
            expect(screen.getByTestId("channel-url-input")).toBeInTheDocument();
            expect(screen.queryByTestId("channel-recipients-input")).not.toBeInTheDocument();
        });

        it("validates required fields before saving", () => {
            renderPage();
            fireEvent.click(screen.getByRole("button", { name: /Add Channel/i }));
            fireEvent.click(screen.getByTestId("channel-form-save"));

            expect(screen.getByText("Name is required")).toBeInTheDocument();
            expect(screen.getByText("At least one recipient is required")).toBeInTheDocument();
            expect(mockCreateMutate).not.toHaveBeenCalled();
        });

        it("creates an email channel with the entered values", () => {
            renderPage();
            fireEvent.click(screen.getByRole("button", { name: /Add Channel/i }));

            fireEvent.change(screen.getByTestId("channel-name-input"), {
                target: { value: "New alerts" },
            });
            fireEvent.change(screen.getByTestId("channel-recipients-input"), {
                target: { value: "a@b.it, c@d.it" },
            });
            fireEvent.click(screen.getByTestId("channel-filter-THRESHOLD"));
            fireEvent.click(screen.getByTestId("channel-form-save"));

            expect(mockCreateMutate).toHaveBeenCalledTimes(1);
            const [payload] = mockCreateMutate.mock.calls[0];
            expect(payload.resource).toBe("notification-channels");
            expect(payload.values).toMatchObject({
                name: "New alerts",
                kind: "EMAIL",
                recipients: "a@b.it, c@d.it",
                event_filter: ["THRESHOLD"],
                is_active: true,
            });
        });

        it("edits an existing webhook channel pre-filled with its values", () => {
            renderPage();
            fireEvent.click(screen.getAllByLabelText("Edit Channel")[1]);

            const urlInput = screen.getByTestId("channel-url-input") as HTMLInputElement;
            expect(urlInput.value).toBe("https://erp.example.com/hooks/pi");
            expect((screen.getByTestId("channel-secret-input") as HTMLInputElement).value).toBe("s3cr3t");

            fireEvent.change(urlInput, { target: { value: "https://erp.example.com/hooks/v2" } });
            fireEvent.click(screen.getByTestId("channel-form-save"));

            expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
            const [payload] = mockUpdateMutate.mock.calls[0];
            expect(payload.id).toBe("ch-hook");
            expect(payload.values.url).toBe("https://erp.example.com/hooks/v2");
        });
    });
});
