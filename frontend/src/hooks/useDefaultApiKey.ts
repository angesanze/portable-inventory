import { useEffect, useState } from "react";

import { axiosInstance } from "../providers/axios-client";

/**
 * Shape returned by the read-only ``GET /api/v1/api-keys/default/`` endpoint
 * (DUAL-TIER-09). Always scoped to the caller's own company; auto-creates a
 * single ``Default Key`` server-side if the company is keyless, so the result
 * is non-null whenever the user belongs to a company.
 */
export interface DefaultApiKey {
    id: string;
    key: string;
    label: string;
    default_location: string | null;
}

export interface UseDefaultApiKeyResult {
    apiKey: DefaultApiKey | null;
    isLoading: boolean;
    isError: boolean;
}

/**
 * Fetch the company's single default API key without listing keys. Managers
 * (``manage_api_keys=false``) get ``403`` on ``GET /api-keys`` but can still
 * read their own key here, so QR generation works without any key-management
 * surface. Pass ``enabled=false`` to skip the request (e.g. for developers who
 * use the multi-key dropdown via ``useList("api-keys")`` instead).
 */
export const useDefaultApiKey = (enabled = true): UseDefaultApiKeyResult => {
    const [apiKey, setApiKey] = useState<DefaultApiKey | null>(null);
    const [isLoading, setIsLoading] = useState(enabled);
    const [isError, setIsError] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setApiKey(null);
            setIsLoading(false);
            setIsError(false);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        setIsError(false);

        axiosInstance
            .get<DefaultApiKey>("/api/v1/api-keys/default/")
            .then(({ data }) => {
                if (!cancelled) {
                    setApiKey(data);
                }
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
    }, [enabled]);

    return { apiKey, isLoading, isError };
};
