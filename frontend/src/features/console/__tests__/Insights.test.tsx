import { screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { renderWithI18n, i18n } from "../../../test-utils/i18n-wrapper";
import type {
    UsePlatformInsightsResult,
    UsePlatformAuditResult,
    UseCompaniesResult,
} from "../hooks";

// ---------------------------------------------------------------------------
// Mock the console data layer. Both views read fail-closed imperative fetches
// (no react-query), so we swap them for hoisted mutable state. `useCompanies`
// only feeds the audit filter's target-company select, so an empty list is fine.
// ---------------------------------------------------------------------------

const insightsState = vi.hoisted(() => {
    const loaded = {
        anomalies: [
            {
                kind: "stale_company",
                severity: "critical" as const,
                company_id: "c1",
                company_name: "Acme Dev Co",
                detail: "No movements in 90 days",
                suggested_action: "Reach out to the account owner",
            },
            {
                kind: "dormant_keys",
                severity: "warning" as const,
                company_id: "c2",
                company_name: "Globex Ltd",
                detail: "3 API keys unused for 30 days",
                suggested_action: "Rotate or revoke the idle keys",
            },
            {
                kind: "low_usage",
                severity: "info" as const,
                company_id: "c3",
                company_name: "Initech",
                detail: "Usage trending down",
                suggested_action: "Schedule a check-in",
            },
        ],
        health: [
            { company_id: "c1", company_name: "Acme Dev Co", score: 22, factors: {} },
            { company_id: "c4", company_name: "Umbrella Inc", score: 67, factors: {} },
        ],
        isLoading: false,
        isError: false,
    };
    return { current: loaded as UsePlatformInsightsResult, loaded };
});

const auditState = vi.hoisted(() => {
    const loaded = {
        entries: [
            {
                id: "a1",
                action: "TIER_CHANGED",
                actor: "u1",
                actor_username: "root",
                target_company: "c1",
                target_company_name: "Acme Dev Co",
                metadata: { from: "manager", to: "developer" },
                created_at: "2026-05-21T10:00:00Z",
            },
            {
                id: "a2",
                action: "COMPANY_PROVISIONED",
                actor: null,
                actor_username: null,
                target_company: "c2",
                target_company_name: "Globex Ltd",
                metadata: {},
                created_at: "2026-05-20T09:00:00Z",
            },
        ],
        count: 2,
        hasNext: false,
        hasPrevious: false,
        isLoading: false,
        isError: false,
    };
    return { current: loaded as UsePlatformAuditResult, loaded };
});

vi.mock("../hooks", () => ({
    usePlatformInsights: () => insightsState.current,
    usePlatformAudit: () => auditState.current,
    useCompanies: (): UseCompaniesResult => ({
        companies: [],
        count: 0,
        isLoading: false,
        isError: false,
        refetch: () => {},
    }),
}));

import { Insights } from "../Insights";
import { Audit } from "../Audit";

describe("console Insights", () => {
    beforeEach(() => {
        insightsState.current = insightsState.loaded;
    });

    afterEach(async () => {
        await i18n.changeLanguage("en");
    });

    it("renders anomalies grouped by severity with their suggested actions", () => {
        renderWithI18n(<MemoryRouter><Insights /></MemoryRouter>);

        // Each severity group heading is present.
        expect(screen.getByText("Critical")).toBeTruthy();
        expect(screen.getByText("Warning")).toBeTruthy();
        expect(screen.getByText("Info")).toBeTruthy();

        // The anomaly detail + its suggested action both render per card.
        expect(screen.getByText("No movements in 90 days")).toBeTruthy();
        expect(screen.getByText("Reach out to the account owner")).toBeTruthy();
        expect(screen.getByText("Rotate or revoke the idle keys")).toBeTruthy();
        expect(screen.getByText("Schedule a check-in")).toBeTruthy();

        // The company name deep-links to that company's console detail.
        const link = screen.getAllByRole("link", { name: "Acme Dev Co" })[0];
        expect(link.getAttribute("href")).toBe("/console/companies/c1");
    });

    it("renders the worst-health needs-attention list with score badges", () => {
        renderWithI18n(<MemoryRouter><Insights /></MemoryRouter>);

        expect(screen.getByText("Needs attention")).toBeTruthy();
        expect(screen.getByText("Umbrella Inc")).toBeTruthy();
        // The server returns worst-first; the scores surface as badges.
        expect(screen.getByText("22")).toBeTruthy();
        expect(screen.getByText("67")).toBeTruthy();
    });

    it("fails closed to an error card when the fetch rejects", () => {
        insightsState.current = {
            anomalies: [],
            health: [],
            isLoading: false,
            isError: true,
        };
        renderWithI18n(<MemoryRouter><Insights /></MemoryRouter>);

        expect(screen.getByText("Failed to load platform insights.")).toBeTruthy();
        expect(screen.queryByText("Needs attention")).toBeNull();
    });
});

describe("console Audit", () => {
    beforeEach(() => {
        auditState.current = auditState.loaded;
    });

    afterEach(async () => {
        await i18n.changeLanguage("en");
    });

    it("renders the timeline with action badges and a from→to metadata diff", () => {
        renderWithI18n(<MemoryRouter><Audit /></MemoryRouter>);

        // Scope to the timeline list — the FilterBar selects also carry action
        // labels as <option>s, so assert against the rendered rows only.
        const timeline = within(screen.getByRole("list"));

        // Action badges (human labels) for the mocked entries.
        expect(timeline.getByText("Tier changed")).toBeTruthy();
        expect(timeline.getByText("Provisioned")).toBeTruthy();

        // The tier change renders its {from, to} diff.
        expect(timeline.getByText("manager")).toBeTruthy();
        expect(timeline.getByText("developer")).toBeTruthy();

        // Actor shown when present; the "System" fallback for the null actor.
        expect(timeline.getByText("root")).toBeTruthy();
        expect(timeline.getByText("System")).toBeTruthy();

        // Target company deep-links into the console.
        const link = timeline.getByRole("link", { name: "Globex Ltd" });
        expect(link.getAttribute("href")).toBe("/console/companies/c2");
    });

    it("fails closed to an error card when the fetch rejects", () => {
        auditState.current = {
            entries: [],
            count: 0,
            hasNext: false,
            hasPrevious: false,
            isLoading: false,
            isError: true,
        };
        renderWithI18n(<MemoryRouter><Audit /></MemoryRouter>);

        expect(screen.getByText("Failed to load the audit log.")).toBeTruthy();
        // The timeline list is suppressed in the error state (the lingering
        // "Tier changed" text belongs to the FilterBar option, not a row).
        expect(screen.queryByRole("list")).toBeNull();
    });
});
