import { Request, Response } from "express";
import ms from "ms";

import { config } from "../config";
import { login, refreshAccessToken } from "../modules/auth/auth.service";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "../modules/auth/auth.constants";
import { loginSchema } from "../modules/auth/auth.schema";

const isProduction = config.env === "production";

function accessTokenCookieOptions(): { httpOnly: true; sameSite: "lax"; secure: boolean; maxAge: number } {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: ms(config.auth.accessTokenTtl as ms.StringValue)
    };
}

function refreshTokenCookieOptions(): { httpOnly: true; sameSite: "lax"; secure: boolean; maxAge: number } {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: ms(config.auth.refreshTokenTtl as ms.StringValue)
    };
}

/**
 * Authenticates the single admin user and sets httpOnly access + refresh
 * token cookies.
 */
export async function loginController(req: Request, res: Response): Promise<void> {
    const { email, password } = loginSchema.parse(req.body);
    const tokens = await login(email, password);

    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, accessTokenCookieOptions());
    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshTokenCookieOptions());
    res.status(200).json({ data: { user: tokens.user }, message: "Logged in" });
}

/**
 * Reissues the access-token cookie from the refresh-token cookie.
 */
export function refreshController(req: Request, res: Response): void {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    const accessToken = refreshAccessToken(refreshToken);

    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, accessTokenCookieOptions());
    res.status(200).json({ data: null, message: "Session refreshed" });
}

/**
 * Clears both auth cookies.
 */
export function logoutController(_req: Request, res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE);
    res.clearCookie(REFRESH_TOKEN_COOKIE);
    res.status(200).json({ data: null, message: "Logged out" });
}

/**
 * Returns the authenticated user. Behind authMiddleware — used by the
 * frontend to restore session state on page load.
 */
export function meController(req: Request, res: Response): void {
    res.status(200).json({ data: { user: req.user }, message: "Current user" });
}
