import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { config } from "../../config";
import { getUserByEmail } from "../../repositories/postgres/auth.repository";
import { AuthenticationError } from "../../shared/core/errors";
import { AuthTokenPayload } from "./auth.constants";

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string };
}

function signAccessToken(payload: AuthTokenPayload): string {
    return jwt.sign(payload, config.auth.secretKey, { expiresIn: config.auth.accessTokenTtl } as jwt.SignOptions);
}

function signRefreshToken(payload: AuthTokenPayload): string {
    return jwt.sign(payload, config.auth.secretKey, { expiresIn: config.auth.refreshTokenTtl } as jwt.SignOptions);
}

/**
 * Verifies email/password against the single admin user and issues a fresh
 * access + refresh token pair.
 *
 * @throws {AuthenticationError} When the email is unknown or the password does not match.
 */
export async function login(email: string, password: string): Promise<AuthTokens> {
    const user = await getUserByEmail(email);
    if (!user) {
        throw new AuthenticationError("Invalid email or password");
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
        throw new AuthenticationError("Invalid email or password");
    }

    const payload: AuthTokenPayload = { sub: user.id, email: user.email };
    return {
        accessToken: signAccessToken(payload),
        refreshToken: signRefreshToken(payload),
        user: { id: user.id, email: user.email }
    };
}

/**
 * Verifies a refresh token and issues a new access token for the same user.
 *
 * @throws {AuthenticationError} When the refresh token is missing, expired, or invalid.
 */
export function refreshAccessToken(refreshToken: string | undefined): string {
    if (!refreshToken) {
        throw new AuthenticationError("Refresh token required");
    }

    let payload: AuthTokenPayload;
    try {
        payload = jwt.verify(refreshToken, config.auth.secretKey) as AuthTokenPayload;
    } catch {
        throw new AuthenticationError("Invalid or expired refresh token");
    }

    return signAccessToken({ sub: payload.sub, email: payload.email });
}
