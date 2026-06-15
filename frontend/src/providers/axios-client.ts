import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import { API_URL } from "../config";

export const axiosInstance = axios.create({
    baseURL: API_URL,
});

/**
 * localStorage key holding the developer's currently selected acting-tenant
 * company id. Owned by `ActingTenantProvider`, but read here so the request
 * interceptor can attach the `X-Acting-Company` header on every dashboard
 * call. Shared as a constant so the provider and interceptor never disagree.
 */
export const ACTING_TENANT_STORAGE_KEY = "acting_tenant_id";

axiosInstance.interceptors.request.use((config) => {
    const token = localStorage.getItem("access_token");
    if (token) {
        config.headers["Authorization"] = `Bearer ${token}`;
    }

    // Scope dashboard requests to the developer's selected child tenant.
    // Backend reads this as `HTTP_X_ACTING_COMPANY` (see core/scope.py).
    const actingTenant = localStorage.getItem(ACTING_TENANT_STORAGE_KEY);
    if (actingTenant) {
        config.headers["X-Acting-Company"] = actingTenant;
    } else {
        delete config.headers["X-Acting-Company"];
    }

    // Append trailing slash to URL if missing (required by Django)
    if (config.url && !config.url.endsWith("/")) {
        const parts = config.url.split("?");
        if (!parts[0].endsWith("/")) {
            parts[0] += "/";
            config.url = parts.join("?");
        }
    }
    return config;
});

// Token refresh interceptor — retry 401s with a refreshed access token.
// Queues concurrent requests while a refresh is in-flight so only one
// refresh call is made at a time.
let isRefreshing = false;
let failedQueue: {
    resolve: (token: string) => void;
    reject: (error: unknown) => void;
}[] = [];

function processQueue(error: unknown, token: string | null) {
    failedQueue.forEach((p) => {
        if (token) {
            p.resolve(token);
        } else {
            p.reject(error);
        }
    });
    failedQueue = [];
}

axiosInstance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & {
            _retry?: boolean;
        };

        // Only attempt refresh on 401, and not for auth endpoints themselves
        if (
            error.response?.status !== 401 ||
            originalRequest._retry ||
            originalRequest.url?.includes("/api/token/")
        ) {
            return Promise.reject(error);
        }

        const refreshToken = localStorage.getItem("refresh_token");
        if (!refreshToken) {
            return Promise.reject(error);
        }

        if (isRefreshing) {
            // Another refresh is already in-flight — queue this request
            return new Promise<string>((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            }).then((newToken) => {
                originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
                return axiosInstance(originalRequest);
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
            const { data } = await axiosInstance.post("/api/token/refresh/", {
                refresh: refreshToken,
            });

            localStorage.setItem("access_token", data.access);
            if (data.refresh) {
                localStorage.setItem("refresh_token", data.refresh);
            }

            processQueue(null, data.access);

            originalRequest.headers["Authorization"] = `Bearer ${data.access}`;
            return axiosInstance(originalRequest);
        } catch (refreshError) {
            processQueue(refreshError, null);
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    },
);
