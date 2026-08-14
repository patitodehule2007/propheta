export const ACCESS_TOKEN_COOKIE = "propheta_access_token";
export const REFRESH_TOKEN_COOKIE = "propheta_refresh_token";

/**
 * Payload embedded in both access and refresh JWTs.
 */
export interface AuthTokenPayload {
    sub: string;
    email: string;
}
