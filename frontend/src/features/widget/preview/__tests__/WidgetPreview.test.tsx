import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { I18nWrapper } from "../../../../test-utils/i18n-wrapper";
import { WidgetPreview } from "../WidgetPreview";

// Mutable default-key state backing the useDefaultApiKey mock. Hoisted so the
// (hoisted) vi.mock factory can close over it; tests reassign to toggle the
// loading state or simulate a keyless company.
const keyState = vi.hoisted(() => ({
    apiKey: { id: "k1", key: "test-key-123", label: "Default Key", default_location: null } as
        | { id: string; key: string; label: string; default_location: string | null }
        | null,
    isLoading: false,
    isError: false,
}));

vi.mock("../../../../hooks/useDefaultApiKey", () => ({
    useDefaultApiKey: () => ({
        apiKey: keyState.apiKey,
        isLoading: keyState.isLoading,
        isError: keyState.isError,
    }),
}));

// Two products from the public widget endpoint: a standard product (with sku)
// and a polymorphic one (routed via /p-widget/:id).
const PRODUCTS_PAYLOAD = {
    products: [{ id: 42, name: "Bolt", sku: "BLT-1" }],
    poly_products: [{ id: 99, name: "Assembly" }],
};

function renderPreview() {
    return render(
        <I18nWrapper>
            <WidgetPreview />
        </I18nWrapper>,
    );
}

describe("WidgetPreview", () => {
    beforeEach(() => {
        keyState.apiKey = { id: "k1", key: "test-key-123", label: "Default Key", default_location: null };
        keyState.isLoading = false;
        keyState.isError = false;
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(PRODUCTS_PAYLOAD),
        }) as unknown as typeof fetch;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("fetches products from the public widget endpoint with the key in the X-Api-Key header (not the URL)", async () => {
        renderPreview();
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                expect.not.stringContaining("api_key="),
                expect.objectContaining({
                    headers: expect.objectContaining({ "X-Api-Key": "test-key-123" }),
                }),
            );
        });
        // The widget endpoint is still the one being hit, just without the credential in the URL.
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining("/api/v1/widget/"),
            expect.anything(),
        );
    });

    it("renders a product selector populated from the fetched products", async () => {
        renderPreview();
        const trigger = await screen.findByRole("combobox");
        // Selector becomes enabled once products load.
        await waitFor(() => expect(trigger).not.toBeDisabled());
        fireEvent.click(trigger);
        // Standard product label includes its SKU; poly product shows its name.
        expect(await screen.findByText("Bolt (BLT-1)")).toBeTruthy();
        expect(screen.getByText("Assembly")).toBeTruthy();
    });

    it("renders a live preview iframe pointed at the selected product's widget", async () => {
        const { container } = renderPreview();
        const trigger = await screen.findByRole("combobox");
        await waitFor(() => expect(trigger).not.toBeDisabled());

        // No iframe before a product is chosen.
        expect(container.querySelector("iframe")).toBeNull();

        fireEvent.click(trigger);
        fireEvent.click(await screen.findByText("Bolt (BLT-1)"));

        const iframe = await waitFor(() => {
            const el = container.querySelector("iframe");
            expect(el).toBeTruthy();
            return el as HTMLIFrameElement;
        });
        expect(iframe.getAttribute("src")).toContain("/widget?api_key=test-key-123&product_id=42");
    });

    it("routes polymorphic products through their /p-widget/:id public route", async () => {
        const { container } = renderPreview();
        const trigger = await screen.findByRole("combobox");
        await waitFor(() => expect(trigger).not.toBeDisabled());

        fireEvent.click(trigger);
        fireEvent.click(await screen.findByText("Assembly"));

        const iframe = await waitFor(() => {
            const el = container.querySelector("iframe");
            expect(el).toBeTruthy();
            return el as HTMLIFrameElement;
        });
        expect(iframe.getAttribute("src")).toContain("/p-widget/99?api_key=test-key-123");
    });

    it("omits every developer-only surface (no embed code, curl/fetch, or Run Request)", async () => {
        renderPreview();
        await screen.findByRole("combobox");

        // None of the WidgetGenerator developer affordances should appear.
        expect(screen.queryByText(/Run Request/i)).toBeNull();
        expect(screen.queryByText(/curl/i)).toBeNull();
        expect(screen.queryByText(/<iframe/i)).toBeNull();
        expect(screen.queryByText(/embed/i)).toBeNull();
        // No API-key picker: managers never choose a key here.
        expect(screen.queryByText(/API Key/i)).toBeNull();
        // No method toggle for GET/POST simulation.
        expect(screen.queryByText(/^POST$/)).toBeNull();
    });
});
