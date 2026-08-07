import axios from "axios";
import type { AxiosError } from "axios";

/**
 * Centralized HTTP client. Never use fetch or axios directly in components.
 */
export const requestService = axios.create({
    baseURL: "/api",
    withCredentials: true
});

requestService.interceptors.response.use(
    (response) => response,
    (error: AxiosError<{ error: { code: string; message: string } }>) => {
        return Promise.reject(error);
    }
);
