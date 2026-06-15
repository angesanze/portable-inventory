import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { I18nWrapper, i18n } from "../../../test-utils/i18n-wrapper";
import { ActingTenantProvider } from "../../../context/ActingTenantProvider";
import { ACTING_TENANT_STORAGE_KEY } from "../../../providers/axios-client";
import { ActingTenantBanner } from "../ActingTenantBanner";

// Mock useOne so the banner can resolve a friendly tenant name without a
// real data provider. Returns a name only for the known tenant id.
vi.mock("@refinedev/core", () => ({
    useOne: (opts: { id: string; queryOptions?: { enabled?: boolean } }) => {
        if (!opts.queryOptions?.enabled) return { data: undefined, isLoading: false };
        if (opts.id === "tenant-42") {
            return { data: { data: { id: "tenant-42", name: "Acme Warehouses" } }, isLoading: false };
        }
        return { data: undefined, isLoading: false };
    },
}));

function renderBanner() {
    return render(
        <I18nWrapper>
            <ActingTenantProvider>
                <ActingTenantBanner />
            </ActingTenantProvider>
        </I18nWrapper>,
    );
}

describe("ActingTenantBanner", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("renders nothing when no acting tenant is set", () => {
        renderBanner();
        expect(screen.queryByTestId("acting-tenant-banner")).toBeNull();
    });

    it("shows the resolved tenant name when acting", () => {
        localStorage.setItem(ACTING_TENANT_STORAGE_KEY, "tenant-42");
        renderBanner();
        const banner = screen.getByTestId("acting-tenant-banner");
        expect(banner).toBeTruthy();
        expect(banner.textContent).toContain("Acting as");
        expect(banner.textContent).toContain("Acme Warehouses");
    });

    it("falls back to the raw id when the name lookup yields nothing", () => {
        localStorage.setItem(ACTING_TENANT_STORAGE_KEY, "unknown-id");
        renderBanner();
        const banner = screen.getByTestId("acting-tenant-banner");
        expect(banner.textContent).toContain("unknown-id");
    });

    it("exit button clears the acting tenant (removes header + hides banner)", () => {
        localStorage.setItem(ACTING_TENANT_STORAGE_KEY, "tenant-42");
        renderBanner();
        fireEvent.click(screen.getByTestId("acting-tenant-exit"));
        expect(localStorage.getItem(ACTING_TENANT_STORAGE_KEY)).toBeNull();
        expect(screen.queryByTestId("acting-tenant-banner")).toBeNull();
    });

    it("uses role=status so the impersonation context is announced", () => {
        localStorage.setItem(ACTING_TENANT_STORAGE_KEY, "tenant-42");
        renderBanner();
        expect(screen.getByRole("status")).toBeTruthy();
    });

    it("translates the banner labels to Italian", async () => {
        localStorage.setItem(ACTING_TENANT_STORAGE_KEY, "tenant-42");
        await i18n.changeLanguage("it");
        try {
            renderBanner();
            const banner = screen.getByTestId("acting-tenant-banner");
            expect(banner.textContent).toContain("Operi come");
            expect(screen.getByTestId("acting-tenant-exit").textContent).toContain("Esci");
        } finally {
            await i18n.changeLanguage("en");
        }
    });
});
