import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API_URL } from "../../config";

/* ── Types ──────────────────────────────────────────────────── */

export interface RegisterPayload {
    company_name: string;
    admin_email: string;
    admin_password: string;
    industry_type: string;
    vat: string;
}

export interface RegisterResponse {
    tokens: { access: string; refresh: string };
    company: { id: string; name: string; license_code: string; industry_type: string; vat: string };
    user: { id: string; email: string; username: string; role: string };
    api_key: { id: string; key: string; label: string };
}

/**
 * Shape of a DRF validation error body as surfaced through an axios error.
 * Field keys map to a list of messages; `detail` is the generic fallback.
 */
interface ApiErrorData {
    detail?: string;
    [field: string]: string | string[] | undefined;
}

interface ApiError {
    message?: string;
    response?: { data?: ApiErrorData };
}

/** First message for a DRF field error, if the catch value looks like an axios error. */
function fieldError(err: unknown, field: string): string | undefined {
    const value = (err as ApiError | undefined)?.response?.data?.[field];
    return Array.isArray(value) ? value[0] : undefined;
}

/** Just the DRF `response.data.detail` string, if present. */
function detailErrorRaw(err: unknown): string | undefined {
    return (err as ApiError | undefined)?.response?.data?.detail;
}

/** Generic `detail` / message fallback from an axios-shaped error. */
function detailError(err: unknown): string | undefined {
    const e = err as ApiError | undefined;
    return detailErrorRaw(err) || e?.message;
}

export type WizardStep = 1 | 2 | 3;

export interface WizardState {
    step: WizardStep;
    // Step 1 – Welcome (no fields)
    companyName: string;
    // Step 2 – Create Product Model
    productSku: string;
    productName: string;
    trackingMode: string;
    // Preserved for backwards compat with registration flow
    apiKey: string;
}

const STORAGE_KEY = "onboarding_wizard";

const defaultWizardState: WizardState = {
    step: 1,
    companyName: "",
    productSku: "",
    productName: "",
    trackingMode: "BULK",
    apiKey: "",
};

/* ── Hook ───────────────────────────────────────────────────── */

export function useOnboarding() {
    /* Registration ----------------------------------------------- */
    const [isRegistering, setIsRegistering] = useState(false);
    const [registerError, setRegisterError] = useState<string | null>(null);

    const register = useCallback(async (payload: RegisterPayload): Promise<RegisterResponse | null> => {
        setIsRegistering(true);
        setRegisterError(null);
        try {
            const { data } = await axios.post<RegisterResponse>(
                `${API_URL}/api/v1/onboarding/`,
                payload,
            );
            // Store JWT so user is immediately authenticated
            localStorage.setItem("access_token", data.tokens.access);
            localStorage.setItem("refresh_token", data.tokens.refresh);
            // Seed wizard with registration data
            const initial: WizardState = {
                ...defaultWizardState,
                companyName: data.company.name,
                apiKey: data.api_key.key,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
            return data;
        } catch (err: unknown) {
            const msg =
                fieldError(err, "admin_email") ||
                fieldError(err, "company_name") ||
                fieldError(err, "vat") ||
                detailError(err) ||
                "Registration failed";
            setRegisterError(msg);
            return null;
        } finally {
            setIsRegistering(false);
        }
    }, []);

    /* Wizard state ----------------------------------------------- */
    const [wizard, setWizardRaw] = useState<WizardState>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : defaultWizardState;
        } catch {
            return defaultWizardState;
        }
    });

    // Persist on change
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(wizard));
    }, [wizard]);

    const setWizard = useCallback((patch: Partial<WizardState>) => {
        setWizardRaw((prev) => ({ ...prev, ...patch }));
    }, []);

    const nextStep = useCallback(() => {
        setWizardRaw((prev) => ({ ...prev, step: Math.min(prev.step + 1, 3) as WizardStep }));
    }, []);

    const prevStep = useCallback(() => {
        setWizardRaw((prev) => ({ ...prev, step: Math.max(prev.step - 1, 1) as WizardStep }));
    }, []);

    const clearWizard = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        setWizardRaw(defaultWizardState);
    }, []);

    /* Wizard API helpers ----------------------------------------- */
    const [wizardLoading, setWizardLoading] = useState(false);
    const [wizardError, setWizardError] = useState<string | null>(null);

    const apiHeaders = () => ({
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
    });

    const updateCompanySettings = useCallback(async (settings: { timezone?: string; currency?: string }) => {
        setWizardLoading(true);
        setWizardError(null);
        try {
            await axios.patch(`${API_URL}/api/v1/company/settings/`, settings, { headers: apiHeaders() });
        } catch (err: unknown) {
            setWizardError(detailErrorRaw(err) || "Failed to update company settings");
            throw err;
        } finally {
            setWizardLoading(false);
        }
    }, []);

    const createLocation = useCallback(async (name: string, type: string) => {
        setWizardLoading(true);
        setWizardError(null);
        try {
            await axios.post(`${API_URL}/api/v1/locations/`, { name, type }, { headers: apiHeaders() });
        } catch (err: unknown) {
            setWizardError(detailErrorRaw(err) || fieldError(err, "name") || "Failed to create location");
            throw err;
        } finally {
            setWizardLoading(false);
        }
    }, []);

    const createProduct = useCallback(async (sku: string, name: string, profile: string = "SIMPLE_COUNT") => {
        setWizardLoading(true);
        setWizardError(null);
        try {
            await axios.post(`${API_URL}/api/v1/product-models/`, {
                sku,
                name,
                profile,
            }, { headers: apiHeaders() });
        } catch (err: unknown) {
            setWizardError(detailErrorRaw(err) || fieldError(err, "sku") || "Failed to create product");
            throw err;
        } finally {
            setWizardLoading(false);
        }
    }, []);

    return {
        // Registration
        register,
        isRegistering,
        registerError,
        // Wizard
        wizard,
        setWizard,
        nextStep,
        prevStep,
        clearWizard,
        wizardLoading,
        wizardError,
        setWizardError,
        // Wizard API helpers
        updateCompanySettings,
        createLocation,
        createProduct,
    } as const;
}
