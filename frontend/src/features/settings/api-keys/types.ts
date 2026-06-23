/**
 * Local types for the API-keys settings area.
 *
 * Narrowly mirrors the `api-keys` and `locations` payloads as consumed by the
 * list and create-modal screens. Only fields read in this feature are declared.
 */

/** Per-action permission flags carried on an API key. */
export type ApiKeyPermissions = Record<string, boolean>;

/** A row in the api-keys list. */
export interface ApiKey {
    id: string;
    label: string;
    key_hint?: string;
    permissions?: ApiKeyPermissions;
    rate_limit_tier: string;
    expires_at: string | null;
    last_used_at: string | null;
    usage_count?: number;
    is_active: boolean;
}

/** A location row as used to build the default-location select options. */
export interface ApiKeyLocation {
    id: string;
    name: string;
}
