import axios from "axios";

interface ApiErrorBody {
    error?: { code?: string; message?: string };
}

/**
 * Extracts the client-safe message from a requestService error response,
 * falling back to a generic message for network/unexpected failures.
 */
export function extractErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
    if (axios.isAxiosError<ApiErrorBody>(err)) {
        return err.response?.data?.error?.message ?? fallback;
    }
    return fallback;
}
