import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { config } from "../../config";
import { ACCESS_TOKEN_COOKIE, AuthTokenPayload } from "../../modules/auth/auth.constants";
import { AuthenticationError } from "../core/errors";

/**
 * Requires a valid access-token cookie. Attaches the decoded user to
 * `req.user`. Every route behind this middleware can assume `req.user` is set.
 *
 * @throws {AuthenticationError} When the cookie is missing, expired, or invalid.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;
    if (!token) {
        throw new AuthenticationError("Authentication required");
    }

    let payload: AuthTokenPayload;
    try {
        payload = jwt.verify(token, config.auth.secretKey) as AuthTokenPayload;
    } catch {
        throw new AuthenticationError("Invalid or expired session");
    }

    req.user = { id: payload.sub, email: payload.email };
    next();
}
