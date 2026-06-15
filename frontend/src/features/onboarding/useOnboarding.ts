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
        } catch (err: any) {
            const msg =
                err.response?.data?.admin_email?.[0] ||
                err.response?.data?.company_name?.[0] ||
                err.response?.data?.vat?.[0] ||
                err.response?.data?.detail ||
                err.message ||
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
        } catch (err: any) {
            setWizardError(err.response?.data?.detail || "Failed to update company settings");
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
        } catch (err: any) {
            setWizardError(err.response?.data?.detail || err.response?.data?.name?.[0] || "Failed to create location");
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
        } catch (err: any) {
            setWizardError(err.response?.data?.detail || err.response?.data?.sku?.[0] || "Failed to create product");
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
