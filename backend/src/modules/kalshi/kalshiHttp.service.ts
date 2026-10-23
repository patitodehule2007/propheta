import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

import { config } from "../../config";
import { ExternalServiceError } from "../../shared/core/errors";
import { logger } from "../../shared/services/logger";
import { buildAuthHeaders } from "./kalshiSigner.service";

/** Trailing slashes would produce a double slash in the signed path. */
const baseUrl = config.kalshi.baseUrl.replace(/\/+$/, "");

/**
 * Builds the path Kalshi expects the signature to cover: the full path from the
 * API root, query string excluded. `URL` resolution cannot be used with the
 * relative path alone, because a leading slash would discard the
 * `/trade-api/v2` prefix carried by the base URL.
 *
 * @param path - request path relative to the configured base URL
 * @returns the absolute path to sign
 */
function toSignedPath(path: string): string {
    return new URL(`${baseUrl}${path}`).pathname;
}

/**
 * Axios instance for the Kalshi Trade API. Every request is signed; responses
 * that fail are logged with upstream detail and rethrown as a typed error
 * carrying no upstream internals.
 */
export const kalshiHttpClient = axios.create({
    baseURL: baseUrl,
    timeout: config.kalshi.timeoutMs,
    headers: { "Content-Type": "application/json" },
    // Arrays go out as `key=a&key=b`, the form Kalshi's list filters accept,
    // not axios' default `key[]=a&key[]=b`.
    paramsSerializer: { indexes: null }
});

kalshiHttpClient.interceptors.request.use((requestConfig: InternalAxiosRequestConfig) => {
    const method = (requestConfig.method ?? "get").toUpperCase();
    const authHeaders = buildAuthHeaders(method, toSignedPath(requestConfig.url ?? ""));

    return { ...requestConfig, headers: requestConfig.headers.concat(authHeaders) };
});

kalshiHttpClient.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
        if (!axios.isAxiosError(error)) {
            throw error;
        }

        const axiosError = error as AxiosError;
        logger.error(
            {
                method: axiosError.config?.method,
                path: axiosError.config?.url,
                status: axiosError.response?.status,
                code: axiosError.code,
                body: axiosError.response?.data
            },
            "Kalshi API request failed"
        );

        // Deliberately generic: this message is surfaced to clients by the
        // centralized error middleware, so it must not leak the upstream path,
        // status or payload. The detail above stays server-side. upstreamStatus
        // is attached for internal callers only (e.g. treating a 409 on order
        // creation as idempotent success) and is never read by the middleware.
        throw new ExternalServiceError("Kalshi API request failed", axiosError.response?.status);
    }
);
