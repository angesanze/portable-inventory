import { useEffect } from "react";
import { AxiosError } from "axios";
import { useNotification, useLogout } from "@refinedev/core";
import { axiosInstance } from "./axios-client";

export const AxiosErrorHandler = () => {
    const { open } = useNotification();
    const { mutate: logout } = useLogout();

    useEffect(() => {
        // BP-02: register on the shared axiosInstance — all app traffic goes
        // through it (axios.create), so interceptors on the global `axios`
        // default never fired and the 401/403/4xx/5xx toasts were dead.
        const interceptor = axiosInstance.interceptors.response.use(
            (response) => response,
            (error: AxiosError) => {
                const status = error.response?.status;
                const data: unknown = error.response?.data;

                // Handle 401 Unauthorized
                if (status === 401) {
                    logout();
                    return Promise.reject(error);
                }

                // Handle 403 Forbidden
                if (status === 403) {
                    open?.({
                        message: "Access Denied",
                        description: "You do not have permission to perform this action.",
                        type: "error"
                    });
                    return Promise.reject(error);
                }

                // Handle 500 Server Error
                if (status && status >= 500) {
                    open?.({
                        message: "Server Error",
                        description: "An unexpected error occurred. Please try again later.",
                        type: "error"
                    });
                    return Promise.reject(error);
                }

                // Handle Generic API Errors (400)
                if (status === 400 && data) {
                    const message = "Validation Error";
                    let description = "Please check your input.";

                    const detail = (data as { detail?: unknown }).detail;
                    if (typeof data === 'string') {
                        description = data;
                    } else if (detail) {
                        description = String(detail);
                    } else if (Array.isArray(data)) {
                        description = data.join(", ");
                    } else if (typeof data === 'object') {
                        // Concatenate all error messages
                        description = Object.entries(data as Record<string, unknown>)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join("; ");
                    }

                    open?.({
                        message,
                        description,
                        type: "error"
                    });
                    return Promise.reject(error);
                }

                return Promise.reject(error);
            }
        );

        return () => {
            axiosInstance.interceptors.response.eject(interceptor);
        };
    }, [open, logout]);

    return null;
};
