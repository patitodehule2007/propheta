import axios from "axios";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";

/**
 * Centralized HTTP client. Never use fetch or axios directly in components.
 */
export const requestService = axios.create({
    baseURL: "/api",
    withCredentials: true
});

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
    _retried?: boolean;
}

let onAuthFailure: (() => void) | null = null;

/**
 * Registers a callback invoked when a request fails auth even after a
 * silent token refresh attempt. Kept as a callback (not a store import) to
 * avoid a circular dependency between requestService and authStore.
 */
export function setAuthFailureHandler(handler: () => void): void {
    onAuthFailure = handler;
}

requestService.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<{ error: { code: string; message: string } }>) => {
        const requestConfig = error.config as RetryableRequestConfig | undefined;
        const isAuthEndpoint = requestConfig?.url?.startsWith("/auth/") ?? false;

        if (error.response?.status === 401 && requestConfig && !requestConfig._retried && !isAuthEndpoint) {
            requestConfig._retried = true;
            try {
                await requestService.post("/auth/refresh");
                return requestService(requestConfig);
            } catch {
                onAuthFailure?.();
            }
        }

        return Promise.reject(error);
    }
);
