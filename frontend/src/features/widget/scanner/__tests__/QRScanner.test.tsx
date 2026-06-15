import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks — available inside vi.mock factory
const { mockGetCameras, mockTorchIsSupported, mockTorchApply, onSuccessRef } = vi.hoisted(() => {
    return {
        mockGetCameras: vi.fn().mockResolvedValue([{ id: "cam1", label: "Back Camera" }]),
        mockTorchIsSupported: vi.fn().mockReturnValue(false),
        mockTorchApply: vi.fn().mockResolvedValue(undefined),
        onSuccessRef: { current: null as ((text: string) => void) | null },
    };
});

vi.mock("html5-qrcode", () => {
    return {
        Html5Qrcode: class MockHtml5Qrcode {
            static getCameras = mockGetCameras;
            start(_config: any, _opts: any, onSuccess: any, _onFailure: any) {
                onSuccessRef.current = onSuccess;
                return Promise.resolve();
            }
            stop() { return Promise.resolve(); }
            clear() {}
            getState() { return 2; }
            getRunningTrackCameraCapabilities() {
                return {
                    torchFeature: () => ({
                        isSupported: mockTorchIsSupported,
                        apply: mockTorchApply,
                    }),
                };
            }
        },
        Html5QrcodeScannerState: { NOT_STARTED: 1, SCANNING: 2, PAUSED: 3 },
        Html5QrcodeSupportedFormats: {
            QR_CODE: 0, EAN_13: 9, EAN_8: 10, UPC_A: 14, UPC_E: 15, CODE_128: 5,
        },
    };
});

import { QRScanner } from "../QRScanner";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
});

const productPayload = {
    products: [{
        id: "p1", name: "Widget A", sku: "WA-001",
        engine_type: "bucket", tracking_mode: "BULK",
        profile: "BATCH_TRACKED", quantity: 50,
    }],
    location: { id: "loc1", name: "Warehouse A" },
    company: "Test Co",
};

describe("QRScanner", () => {
    let onScanComplete: ReturnType<typeof vi.fn>;
    let onError: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        onSuccessRef.current = null;
        onScanComplete = vi.fn();
        onError = vi.fn();
        mockGetCameras.mockResolvedValue([{ id: "cam1", label: "Back Camera" }]);
        mockTorchIsSupported.mockReturnValue(false);
        fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(productPayload) });
    });

    const renderScanner = () =>
        render(<QRScanner apiKey="test-key" onScanComplete={onScanComplete} onError={onError} />);

    it("renders scanner UI with header and controls", async () => {
        renderScanner();
        expect(screen.getByTestId("qr-scanner")).toBeInTheDocument();
        expect(screen.getByText("Scan Inventory QR Code")).toBeInTheDocument();
        expect(screen.getByLabelText("Enter code manually")).toBeInTheDocument();
    });

    it("calls onScanComplete when QR decoded", async () => {
        renderScanner();
        await waitFor(() => expect(onSuccessRef.current).not.toBeNull());

        await act(async () => { onSuccessRef.current!("ABCD1234"); });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("code=ABCD1234"));
            expect(onScanComplete).toHaveBeenCalledWith(
                expect.objectContaining({ code: "ABCD1234", productId: "p1", productName: "Widget A", locationId: "loc1" })
            );
        });
    });

    it("extracts code from URL with qr_code param", async () => {
        renderScanner();
        await waitFor(() => expect(onSuccessRef.current).not.toBeNull());

        await act(async () => {
            onSuccessRef.current!("https://example.com/widget?api_key=k&qr_code=XY789012");
        });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("code=XY789012"));
        });
    });

    it("extracts code from /go/{code}/ URL", async () => {
        renderScanner();
        await waitFor(() => expect(onSuccessRef.current).not.toBeNull());

        await act(async () => {
            onSuccessRef.current!("https://example.com/go/MYCODE99/");
        });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("code=MYCODE99"));
        });
    });

    it("shows error for invalid QR code", async () => {
        fetchMock.mockResolvedValue({
            ok: false, status: 404,
            json: () => Promise.resolve({ detail: "Invalid QR code" }),
        });

        renderScanner();
        await waitFor(() => expect(onSuccessRef.current).not.toBeNull());

        await act(async () => { onSuccessRef.current!("BAD1"); });

        await waitFor(() => {
            expect(screen.getByText(/not a valid Varasto code/)).toBeInTheDocument();
            expect(onError).toHaveBeenCalledWith("invalid_qr", expect.any(String));
        });
    });

    it("shows error for expired QR code", async () => {
        fetchMock.mockResolvedValue({
            ok: false, status: 400,
            json: () => Promise.resolve({ detail: "QR code expired" }),
        });

        renderScanner();
        await waitFor(() => expect(onSuccessRef.current).not.toBeNull());

        await act(async () => { onSuccessRef.current!("EXP1"); });

        await waitFor(() => {
            expect(screen.getByText(/expired/)).toBeInTheDocument();
            expect(onError).toHaveBeenCalledWith("expired_code", expect.any(String));
        });
    });

    it("shows error for locked QR code", async () => {
        fetchMock.mockResolvedValue({
            ok: false, status: 400,
            json: () => Promise.resolve({ detail: "QR code is locked" }),
        });

        renderScanner();
        await waitFor(() => expect(onSuccessRef.current).not.toBeNull());

        await act(async () => { onSuccessRef.current!("LCK1"); });

        await waitFor(() => {
            expect(screen.getByText(/locked/)).toBeInTheDocument();
            expect(onError).toHaveBeenCalledWith("locked_code", expect.any(String));
        });
    });

    it("shows network error on fetch failure", async () => {
        fetchMock.mockRejectedValue(new Error("Network failed"));

        renderScanner();
        await waitFor(() => expect(onSuccessRef.current).not.toBeNull());

        await act(async () => { onSuccessRef.current!("NET1"); });

        await waitFor(() => {
            expect(screen.getByText(/Unable to reach the server/)).toBeInTheDocument();
            expect(onError).toHaveBeenCalledWith("network_error", expect.any(String));
        });
    });

    it("manual entry submits code", async () => {
        renderScanner();

        fireEvent.click(screen.getByLabelText("Enter code manually"));

        const input = await screen.findByLabelText("QR code manual entry");
        fireEvent.change(input, { target: { value: "test1234" } });
        expect(input).toHaveValue("TEST1234");

        await act(async () => {
            fireEvent.click(screen.getByLabelText("Submit QR code"));
        });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("code=TEST1234"));
            expect(onScanComplete).toHaveBeenCalled();
        });
    });

    it("switches back to camera from manual entry", async () => {
        renderScanner();

        fireEvent.click(screen.getByLabelText("Enter code manually"));
        await screen.findByLabelText("QR code manual entry");

        fireEvent.click(screen.getByLabelText("Switch to camera"));

        expect(screen.queryByLabelText("QR code manual entry")).not.toBeInTheDocument();
    });

    it("shows no camera error when device list empty", async () => {
        mockGetCameras.mockResolvedValue([]);

        renderScanner();

        await waitFor(() => {
            expect(screen.getByText(/No camera found/)).toBeInTheDocument();
            expect(onError).toHaveBeenCalledWith("no_camera", expect.any(String));
        });
    });

    it("retry button clears error and restarts scanner", async () => {
        mockGetCameras.mockResolvedValueOnce([]);

        renderScanner();

        await waitFor(() => {
            expect(screen.getByText(/No camera found/)).toBeInTheDocument();
        });

        mockGetCameras.mockResolvedValue([{ id: "cam1", label: "Back" }]);

        await act(async () => {
            fireEvent.click(screen.getByLabelText("Retry scanning"));
        });

        await waitFor(() => {
            expect(screen.queryByText(/No camera found/)).not.toBeInTheDocument();
        });
    });

    it("does not submit empty manual code", async () => {
        renderScanner();

        fireEvent.click(screen.getByLabelText("Enter code manually"));
        await screen.findByLabelText("QR code manual entry");

        expect(screen.getByLabelText("Submit QR code")).toBeDisabled();
    });
});
