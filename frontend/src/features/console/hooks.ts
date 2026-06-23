import { useCallback, useEffect, useState } from "react";
import axios from "axios";

import { axiosInstance } from "../../providers/axios-client";

/**
 * Headline platform totals returned by ``GET /api/v1/platform/stats/``
 * (SUPERADMIN-03). Superuser-only; one aggregate query per figure server-side.
 */
export interface PlatformStats {
    companies: {
        total: number;
        by_tier: {
            manager: number;
            developer: number;
        };
        active: number;
        suspended: number;
    };
    users_total: number;
    api_keys_total: number;
    movements_total: number;
    open_events_total: number;
}

/**
 * One day of the platform growth time-series returned by
 * ``GET /api/v1/platform/stats/growth/`` (SUPERADMIN-03). Dense + gap-filled
 * server-side, so the series is ready to hand straight to recharts.
 */
export interface PlatformGrowthPoint {
    date: string;
    companies: number;
    movements: number;
}

export interface UsePlatformStatsResult {
    stats: PlatformStats | null;
    growth: PlatformGrowthPoint[];
    isLoading: boolean;
    isError: boolean;
}

const STATS_URL = "/api/v1/platform/stats/";
const GROWTH_URL = "/api/v1/platform/stats/growth/";

/**
 * Fetch the platform overview data (headline totals + growth series) for the
 * superadmin console's Overview dashboard. Both endpoints are loaded together
 * via {@link axiosInstance} (which attaches the bearer token); a failure on
 * either marks the whole hook as errored so the page can fail closed. Mirrors
 * the imperative fetch pattern of ``useDefaultApiKey`` — no react-query needed.
 */
export const usePlatformStats = (): UsePlatformStatsResult => {
    const [stats, setStats] = useState<PlatformStats | null>(null);
    const [growth, setGrowth] = useState<PlatformGrowthPoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        // Imperative fetch effect (no react-query): resets the loading/error
        // flags before synchronizing React state with the external API.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsLoading(true);
        setIsError(false);

        Promise.all([
            axiosInstance.get<PlatformStats>(STATS_URL),
            axiosInstance.get<PlatformGrowthPoint[]>(GROWTH_URL),
        ])
            .then(([statsRes, growthRes]) => {
                if (cancelled) return;
                setStats(statsRes.data);
                setGrowth(Array.isArray(growthRes.data) ? growthRes.data : []);
            })
            .catch(() => {
                if (!cancelled) {
                    setIsError(true);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return { stats, growth, isLoading, isError };
};

/**
 * A developer company's owned manager tenant, as embedded in the company list
 * row's ``children_summary`` (SUPERADMIN-02). ``null`` for managers.
 */
export interface CompanyChildSummary {
    id: string;
    name: string;
    is_active: boolean;
}

/**
 * One row of the platform company list returned by
 * ``GET /api/v1/platform/companies/`` (SUPERADMIN-02). Carries the model fields
 * plus the server-side annotations (per-company counts, last activity) the grid
 * renders directly.
 */
export interface PlatformCompany {
    id: string;
    name: string;
    account_type: "manager" | "developer";
    license_code: string;
    vat: string | null;
    is_active: boolean;
    created_at: string;
    parent: string | null;
    parent_name: string | null;
    users_count: number;
    api_keys_count: number;
    children_count: number;
    last_activity: string | null;
    children_summary: CompanyChildSummary[] | null;
}

/**
 * Query parameters accepted by the company grid. Mirrors the viewset's filter
 * backends: ``search`` (name/vat/license_code), ``account_type`` and
 * ``is_active`` exact filters, and ``ordering`` over created_at/name/last_activity.
 * Empty strings are treated as "unset" and dropped before the request.
 */
export interface CompanyQuery {
    search?: string;
    account_type?: string;
    is_active?: string;
    ordering?: string;
}

export interface UseCompaniesResult {
    companies: PlatformCompany[];
    count: number;
    isLoading: boolean;
    isError: boolean;
    refetch: () => void;
}

const COMPANIES_URL = "/api/v1/platform/companies/";

interface Paginated<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

/**
 * Fetch the platform company list for the superadmin console's Companies grid.
 * Re-fetches whenever the query (search / filters / ordering) changes, and
 * exposes {@link UseCompaniesResult.refetch} so lifecycle actions can refresh
 * the grid on success. Drops empty-string params so an unset filter is omitted
 * rather than sent as ``?account_type=``. Mirrors {@link usePlatformStats}'
 * imperative, fail-closed fetch — no react-query.
 */
export const useCompanies = (query: CompanyQuery): UseCompaniesResult => {
    const [companies, setCompanies] = useState<PlatformCompany[]>([]);
    const [count, setCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

    const { search, account_type, is_active, ordering } = query;

    useEffect(() => {
        let cancelled = false;
        // Imperative fetch effect (no react-query): resets the loading/error
        // flags before synchronizing React state with the external API.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsLoading(true);
        setIsError(false);

        const params: Record<string, string> = {};
        if (search) params.search = search;
        if (account_type) params.account_type = account_type;
        if (is_active) params.is_active = is_active;
        if (ordering) params.ordering = ordering;

        axiosInstance
            .get<Paginated<PlatformCompany>>(COMPANIES_URL, { params })
            .then((res) => {
                if (cancelled) return;
                const data = res.data;
                setCompanies(Array.isArray(data?.results) ? data.results : []);
                setCount(typeof data?.count === "number" ? data.count : 0);
            })
            .catch(() => {
                if (!cancelled) setIsError(true);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [search, account_type, is_active, ordering, reloadKey]);

    return { companies, count, isLoading, isError, refetch };
};

/** One user row embedded in a company's drill-down detail. */
export interface PlatformCompanyUser {
    id: string;
    username: string;
    email: string;
    role: string | null;
    is_active: boolean;
}

/**
 * One API-key row embedded in a company's detail, carrying the usage telemetry
 * the drawer renders (``usage_count`` / ``last_used_at`` / ``rate_limit_tier``).
 */
export interface PlatformApiKey {
    id: string;
    label: string;
    is_active: boolean;
    rate_limit_tier: "free" | "standard" | "premium";
    usage_count: number;
    last_used_at: string | null;
    created_at: string;
}

/** One recent audit entry that targeted the company. */
export interface PlatformActivityEntry {
    id: string;
    action: string;
    actor_username: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
}

/**
 * The drill-down payload returned by ``GET /platform/companies/{id}/``
 * (SUPERADMIN-07). Extends the list row with the embedded users, API keys and
 * recent activity the console's detail drawer renders.
 */
export interface PlatformCompanyDetail extends PlatformCompany {
    users: PlatformCompanyUser[];
    api_keys: PlatformApiKey[];
    recent_activity: PlatformActivityEntry[];
}

export interface UseCompanyDetailResult {
    company: PlatformCompanyDetail | null;
    isLoading: boolean;
    isError: boolean;
    refetch: () => void;
}

/**
 * Fetch a single company's drill-down for the console detail drawer. Re-fetches
 * when ``id`` changes and exposes {@link UseCompanyDetailResult.refetch} so
 * lifecycle actions (next phase) can refresh after a mutation. Fail-closed, like
 * {@link useCompanies}; ``id === undefined`` keeps the hook idle.
 */
export const useCompanyDetail = (id: string | undefined): UseCompanyDetailResult => {
    const [company, setCompany] = useState<PlatformCompanyDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        // Imperative fetch effect (no react-query): resets the loading/error
        // flags before synchronizing React state with the external API.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsLoading(true);
        setIsError(false);

        axiosInstance
            .get<PlatformCompanyDetail>(`${COMPANIES_URL}${id}/`)
            .then((res) => {
                if (!cancelled) setCompany(res.data);
            })
            .catch(() => {
                if (!cancelled) setIsError(true);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [id, reloadKey]);

    return { company, isLoading, isError, refetch };
};

/* ─── Lifecycle mutations (SUPERADMIN-07) ──────────────────────────────────
 *
 * Plain imperative POST helpers wrapping the SUPERADMIN-02 lifecycle endpoints.
 * They throw on failure so callers can surface the message via a toast and skip
 * the grid refetch; the components own the loading/confirm-dialog state. No
 * react-query, mirroring the read hooks above.
 */

/** Payload for ``POST /platform/companies/provision-developer/``. */
export interface ProvisionDeveloperPayload {
    name: string;
    vat?: string;
    admin_email?: string;
    admin_password?: string;
}

/**
 * The 201 body returned when provisioning a developer: the created company row
 * plus the one-time secrets — the plaintext default ``api_key`` and the seeded
 * ``admin`` (when an admin email was supplied). Neither secret is ever readable
 * again, so the modal surfaces them once.
 */
export interface ProvisionDeveloperResult extends PlatformCompany {
    api_key: string | null;
    admin: { id: string; email: string } | null;
}

/** Provision a new developer company; resolves with its one-time credentials. */
export const provisionDeveloper = (
    payload: ProvisionDeveloperPayload,
): Promise<ProvisionDeveloperResult> =>
    axiosInstance
        .post<ProvisionDeveloperResult>(`${COMPANIES_URL}provision-developer/`, payload)
        .then((res) => res.data);

/** Promote/demote a company between the manager and developer tiers. */
export const setCompanyTier = (
    id: string,
    accountType: "manager" | "developer",
): Promise<PlatformCompany> =>
    axiosInstance
        .post<PlatformCompany>(`${COMPANIES_URL}${id}/set-tier/`, { account_type: accountType })
        .then((res) => res.data);

/** Suspend a company (blocks its users from login/API). */
export const suspendCompany = (id: string): Promise<PlatformCompany> =>
    axiosInstance
        .post<PlatformCompany>(`${COMPANIES_URL}${id}/suspend/`)
        .then((res) => res.data);

/** Lift a company's suspension. */
export const reactivateCompany = (id: string): Promise<PlatformCompany> =>
    axiosInstance
        .post<PlatformCompany>(`${COMPANIES_URL}${id}/reactivate/`)
        .then((res) => res.data);

/**
 * Pull a human-readable message out of a rejected lifecycle request. DRF returns
 * field errors as ``{field: ["msg", …]}`` (e.g. the set-tier "manager cannot own
 * children" invariant under ``account_type``) or a bare ``{detail: "…"}``; this
 * flattens the first message it finds so the toast can show it verbatim. Falls
 * back to ``fallback`` for non-Axios errors or an opaque body.
 */
export const extractLifecycleError = (err: unknown, fallback: string): string => {
    if (axios.isAxiosError(err)) {
        const data = err.response?.data as Record<string, unknown> | string | undefined;
        if (typeof data === "string" && data) return data;
        if (data && typeof data === "object") {
            if (typeof data.detail === "string") return data.detail;
            for (const value of Object.values(data)) {
                if (typeof value === "string") return value;
                if (Array.isArray(value) && typeof value[0] === "string") return value[0];
            }
        }
    }
    return fallback;
};

/* ─── Intelligence panel (SUPERADMIN-08) ───────────────────────────────────
 *
 * Read hooks for the console's Insights view: the anomaly feed
 * (``/platform/insights/``) and the per-company health scores
 * (``/platform/insights/health/``). Both are loaded together, fail-closed,
 * mirroring {@link usePlatformStats}.
 */

/** Anomaly severity, ordered most → least urgent for grouped rendering. */
export type AnomalySeverity = "critical" | "warning" | "info";

/**
 * One detected anomaly from ``GET /platform/insights/`` (SUPERADMIN-05): a
 * problem worth the superadmin's attention, carrying the offending company, a
 * human ``detail`` and the ``suggested_action`` that resolves it.
 */
export interface PlatformAnomaly {
    kind: string;
    severity: AnomalySeverity;
    company_id: string;
    company_name: string;
    detail: string;
    suggested_action: string;
}

/**
 * One company's health score from ``GET /platform/insights/health/``
 * (SUPERADMIN-05). The server returns the list worst-first; ``factors`` is the
 * per-signal points breakdown that explains the 0-100 ``score``.
 */
export interface PlatformHealth {
    company_id: string;
    company_name: string;
    score: number;
    factors: Record<string, number>;
}

export interface UsePlatformInsightsResult {
    anomalies: PlatformAnomaly[];
    health: PlatformHealth[];
    isLoading: boolean;
    isError: boolean;
}

const INSIGHTS_URL = "/api/v1/platform/insights/";
const HEALTH_URL = "/api/v1/platform/insights/health/";

/**
 * Fetch the platform intelligence payload (anomaly feed + per-company health)
 * for the console's Insights panel. Both endpoints load together via
 * {@link axiosInstance}; a failure on either fails the whole hook closed so the
 * page can show an error card. Imperative + fail-closed, like
 * {@link usePlatformStats} — no react-query.
 */
export const usePlatformInsights = (): UsePlatformInsightsResult => {
    const [anomalies, setAnomalies] = useState<PlatformAnomaly[]>([]);
    const [health, setHealth] = useState<PlatformHealth[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        // Imperative fetch effect (no react-query): resets the loading/error
        // flags before synchronizing React state with the external API.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsLoading(true);
        setIsError(false);

        Promise.all([
            axiosInstance.get<PlatformAnomaly[]>(INSIGHTS_URL),
            axiosInstance.get<PlatformHealth[]>(HEALTH_URL),
        ])
            .then(([anomaliesRes, healthRes]) => {
                if (cancelled) return;
                setAnomalies(Array.isArray(anomaliesRes.data) ? anomaliesRes.data : []);
                setHealth(Array.isArray(healthRes.data) ? healthRes.data : []);
            })
            .catch(() => {
                if (!cancelled) setIsError(true);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return { anomalies, health, isLoading, isError };
};

/* ─── API-usage analytics (SUPERADMIN-08) ──────────────────────────────────
 *
 * Read hook for the console's API Usage view, wrapping
 * ``GET /platform/stats/api-usage/`` (SUPERADMIN-03). Fail-closed, mirroring
 * {@link usePlatformStats}.
 */

/** One row of the top API consumers: a company and its summed key usage. */
export interface ApiUsageConsumer {
    company_id: string;
    company_name: string;
    tier: "manager" | "developer";
    usage_count: number;
}

/**
 * The API-usage analytics payload from ``GET /platform/stats/api-usage/``
 * (SUPERADMIN-03): the top consumers by summed ``ApiKey.usage_count``, a dense
 * per-tier key distribution (every tier present, zero-filled), and the count of
 * dormant keys (never used or idle past the server's window).
 */
export interface PlatformApiUsage {
    top_consumers: ApiUsageConsumer[];
    rate_tier_distribution: Record<string, number>;
    dormant_keys: number;
}

export interface UsePlatformApiUsageResult {
    usage: PlatformApiUsage | null;
    isLoading: boolean;
    isError: boolean;
}

const API_USAGE_URL = "/api/v1/platform/stats/api-usage/";

/**
 * Fetch the platform API-usage analytics for the console's API Usage view. One
 * request via {@link axiosInstance}; fails closed so the page can show an error
 * card. Imperative + fail-closed, like {@link usePlatformStats} — no react-query.
 */
export const usePlatformApiUsage = (): UsePlatformApiUsageResult => {
    const [usage, setUsage] = useState<PlatformApiUsage | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        // Imperative fetch effect (no react-query): resets the loading/error
        // flags before synchronizing React state with the external API.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsLoading(true);
        setIsError(false);

        axiosInstance
            .get<PlatformApiUsage>(API_USAGE_URL)
            .then((res) => {
                if (!cancelled) setUsage(res.data);
            })
            .catch(() => {
                if (!cancelled) setIsError(true);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return { usage, isLoading, isError };
};

/* ─── Audit trail (SUPERADMIN-08) ───────────────────────────────────────────
 *
 * Read hook for the console's Audit view, wrapping the paginated
 * ``GET /platform/audit/`` viewset (SUPERADMIN-04). Re-fetches on filter/page
 * change; fail-closed, mirroring {@link useCompanies}.
 */

/**
 * One platform audit entry returned by ``GET /platform/audit/``
 * (SUPERADMIN-04). The actor and target-company FKs are flattened to names
 * server-side so a row renders without a second lookup; ``metadata`` carries
 * the action context (e.g. ``{from, to}`` for a tier change).
 */
export interface PlatformAuditEntry {
    id: string;
    action: string;
    actor: string | null;
    actor_username: string | null;
    target_company: string | null;
    target_company_name: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
}

/**
 * Query parameters for the audit timeline. ``action`` and ``target_company``
 * map to the viewset's exact-match filters; ``page`` drives DRF page-number
 * pagination. Empty strings are dropped so an unset filter is omitted.
 */
export interface AuditQuery {
    action?: string;
    target_company?: string;
    page?: number;
}

export interface UsePlatformAuditResult {
    entries: PlatformAuditEntry[];
    count: number;
    hasNext: boolean;
    hasPrevious: boolean;
    isLoading: boolean;
    isError: boolean;
}

const AUDIT_URL = "/api/v1/platform/audit/";

/**
 * Fetch a page of the platform audit trail (newest-first) for the console's
 * Audit view. Re-fetches whenever the action/target filters or the page change,
 * dropping empty-string params. Fail-closed, like {@link useCompanies} — no
 * react-query.
 */
export const usePlatformAudit = (query: AuditQuery): UsePlatformAuditResult => {
    const [entries, setEntries] = useState<PlatformAuditEntry[]>([]);
    const [count, setCount] = useState(0);
    const [hasNext, setHasNext] = useState(false);
    const [hasPrevious, setHasPrevious] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);

    const { action, target_company, page } = query;

    useEffect(() => {
        let cancelled = false;
        // Imperative fetch effect (no react-query): resets the loading/error
        // flags before synchronizing React state with the external API.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsLoading(true);
        setIsError(false);

        const params: Record<string, string> = {};
        if (action) params.action = action;
        if (target_company) params.target_company = target_company;
        if (page && page > 1) params.page = String(page);

        axiosInstance
            .get<Paginated<PlatformAuditEntry>>(AUDIT_URL, { params })
            .then((res) => {
                if (cancelled) return;
                const data = res.data;
                setEntries(Array.isArray(data?.results) ? data.results : []);
                setCount(typeof data?.count === "number" ? data.count : 0);
                setHasNext(Boolean(data?.next));
                setHasPrevious(Boolean(data?.previous));
            })
            .catch(() => {
                if (!cancelled) setIsError(true);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [action, target_company, page]);

    return { entries, count, hasNext, hasPrevious, isLoading, isError };
};
