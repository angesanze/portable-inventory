import { useEffect } from "react";
import axios, { AxiosError } from "axios";
import { useNotification, useLogout } from "@refinedev/core";

export const AxiosErrorHandler = () => {
    const { open } = useNotification();
    const { mutate: logout } = useLogout();

    useEffect(() => {
        const interceptor = axios.interceptors.response.use(
            (response) => response,
            (error: AxiosError) => {
                const status = error.response?.status;
                const data: any = error.response?.data;

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
                    let message = "Validation Error";
                    let description = "Please check your input.";

                    if (typeof data === 'string') {
                        description = data;
                    } else if (data.detail) {
                        description = data.detail;
                    } else if (Array.isArray(data)) {
                        description = data.join(", ");
                    } else if (typeof data === 'object') {
                        // Concatenate all error messages
                        description = Object.entries(data)
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
            axios.interceptors.response.eject(interceptor);
        };
    }, [open, logout]);

    return null;
};
