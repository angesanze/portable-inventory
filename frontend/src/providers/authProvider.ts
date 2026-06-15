import type { AuthProvider } from "@refinedev/core";
import axios from "axios";

import { API_URL } from "../config";

export const authProvider: AuthProvider = {
    login: async ({ username, password, license_code }) => {
        const sanitizedApiUrl = API_URL.endsWith("/") ? API_URL.slice(0, -1) : API_URL;
        try {
            const { data } = await axios.post(`${sanitizedApiUrl}/api/token/`, {
                username,
                password,
                license_code,
            });

            if (data.access) {
                localStorage.setItem("access_token", data.access);
                localStorage.setItem("refresh_token", data.refresh);
                return {
                    success: true,
                    redirectTo: "/",
                };
            }
        } catch (error: any) {
            console.error("Login failed:", error);
            const errorMessage = error.response?.data?.detail || error.message || "Invalid username or password";
            return {
                success: false,
                error: {
                    name: "LoginError",
                    message: errorMessage,
                },
            };
        }
        return {
            success: false,
            error: {
                name: "LoginError",
                message: "Unexpected error occurred",
            },
        };
    },
    logout: async () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        return {
            success: true,
            redirectTo: "/login",
        };
    },
    check: async () => {
        const token = localStorage.getItem("access_token");

        if (token) {
            return {
                authenticated: true,
            };
        }

        return {
            authenticated: false,
            redirectTo: "/login",
        };
    },
    getPermissions: async () => null,
    getIdentity: async () => {
        // Short-circuit when logged out: no token means /users/me/ would 401.
        // Returning null here stops a request storm on the login screen
        // (the identity query would otherwise refetch on every re-render).
        const accessToken = localStorage.getItem("access_token");
        if (!accessToken) {
            return null;
        }
        try {
            const sanitizedApiUrl = API_URL.endsWith("/") ? API_URL.slice(0, -1) : API_URL;
            const { data } = await axios.get(`${sanitizedApiUrl}/api/v1/users/me/`, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("access_token")}`,
                },
            });
            return {
                id: data.id,
                name: data.username,
                email: data.email,
                avatar: `https://ui-avatars.com/api/?name=${data.username}`,
                company: data.company_name ? { name: data.company_name } : undefined,
                account_type: data.account_type ?? null,
                is_superuser: data.is_superuser ?? false,
                capabilities: data.capabilities ?? undefined,
                role: data.role ?? null,
                license: data.license ?? null,
            };
        } catch (error) {
            return {
                id: 0,
                name: "Guest",
                avatar: "https://i.pravatar.cc/300",
            };
        }
    },
    onError: async (error) => {
        if (error.response?.status === 401) {
            // The axios interceptor attempts token refresh on 401.
            // If we reach here, refresh already failed and tokens were cleared.
            const token = localStorage.getItem("access_token");
            if (!token) {
                return { logout: true };
            }
        }

        return { error };
    },
};
